'use client'

import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import { normalizePressure } from '@/lib/brush/stamps'
import { PAINTING_SIZE, type Layer, type Painting, type Placement } from '@/lib/doc/types'
import { paintingToLayer } from '@/lib/geometry/place'
import { DEFAULT_VIEW, panView, pinchView, screenToPainting, type Pt, type View } from '@/lib/geometry/view'
import { modeOnDown, type Mode } from '@/lib/input/pointers'
import { Renderer } from '@/lib/renderer/renderer'

export type Tool = 'paint' | 'erase' | 'move'
export interface BrushSettings { tool: Tool; color: string; size: number; opacity: number }

interface Props {
  painting: Painting
  activeLayer: Layer
  brush: BrushSettings
  rendererRef: MutableRefObject<Renderer | null>
  onPlace: (layerId: string, place: Placement) => void
  onStatus: (message: string | null) => void
}

export default function PaintCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  const view = useRef<View>(DEFAULT_VIEW)
  const pointers = useRef(new Map<number, { pt: Pt; kind: string }>())
  const g = useRef({ mode: 'idle' as Mode, penSeen: false, strokeId: null as number | null, moveFrom: null as Pt | null, placeFrom: null as Placement | null })

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const viewport = () => ({ width: canvasRef.current!.clientWidth, height: canvasRef.current!.clientHeight })
  const toPainting = (pt: Pt) => screenToPainting(pt, viewport(), PAINTING_SIZE, view.current)
  const touchCount = () => [...pointers.current.values()].filter(p => p.kind === 'touch').length

  useEffect(() => {
    const canvas = canvasRef.current!
    let renderer: Renderer
    try {
      renderer = new Renderer(canvas)
    } catch (e) {
      latest.current.onStatus(e instanceof Error ? e.message : String(e))
      return
    }
    renderer.onLost = lost => latest.current.onStatus(lost ? 'Reload to restore the canvas' : null)
    latest.current.rendererRef.current = renderer

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = local(e)
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * 0.01)
        view.current = pinchView(view.current, viewport(), PAINTING_SIZE,
          [{ x: c.x - 50, y: c.y }, { x: c.x + 50, y: c.y }],
          [{ x: c.x - 50 * f, y: c.y }, { x: c.x + 50 * f, y: c.y }])
      } else {
        view.current = panView(view.current, -e.deltaX, -e.deltaY)
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    let raf = 0
    const loop = () => {
      renderer.frame(latest.current.painting, view.current, Date.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('wheel', onWheel)
      latest.current.rendererRef.current = null
      renderer.dispose()
    }
  }, [])

  function startTool(e: { pointerId: number; pointerType: string; pressure: number; clientX: number; clientY: number }) {
    const { activeLayer, brush, rendererRef } = latest.current
    const p = toPainting(local(e))
    g.current.strokeId = e.pointerId
    if (brush.tool === 'move') {
      g.current.moveFrom = p
      g.current.placeFrom = activeLayer.place
      return
    }
    const lp = paintingToLayer(p, activeLayer.place, PAINTING_SIZE)
    rendererRef.current?.surface(activeLayer.id).begin(
      { color: brush.color, size: brush.size / activeLayer.place.scale, opacity: brush.opacity, erase: brush.tool === 'erase' },
      { x: lp.x, y: lp.y, pressure: normalizePressure(e.pointerType, e.pressure) },
    )
  }

  function continueTool(e: PointerEvent) {
    const { activeLayer, rendererRef, onPlace } = latest.current
    const p = toPainting(local(e))
    const { moveFrom, placeFrom } = g.current
    if (moveFrom && placeFrom) {
      onPlace(activeLayer.id, { ...placeFrom, x: placeFrom.x + p.x - moveFrom.x, y: placeFrom.y + p.y - moveFrom.y })
      return
    }
    const lp = paintingToLayer(p, activeLayer.place, PAINTING_SIZE)
    rendererRef.current?.surface(activeLayer.id).extend({ x: lp.x, y: lp.y, pressure: normalizePressure(e.pointerType, e.pressure) })
  }

  function endTool() {
    const { activeLayer, rendererRef } = latest.current
    rendererRef.current?.surface(activeLayer.id).commit()
    g.current.strokeId = null
    g.current.moveFrom = null
    g.current.placeFrom = null
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.pointerType === 'pen') g.current.penSeen = true
    pointers.current.set(e.pointerId, { pt: local(e), kind: e.pointerType })
    const next = modeOnDown({ mode: g.current.mode, penSeen: g.current.penSeen, touchCount: touchCount() }, e.pointerType)
    if (next.cancelStroke) {
      latest.current.rendererRef.current?.surface(latest.current.activeLayer.id).cancel()
      g.current.strokeId = null
      g.current.moveFrom = null
      g.current.placeFrom = null
    }
    const wasIdle = g.current.mode === 'idle'
    g.current.mode = next.mode
    if (wasIdle && next.mode === 'tool') startTool(e)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const entry = pointers.current.get(e.pointerId)
    if (!entry) return
    const cur = local(e)
    if (g.current.mode === 'gesture' && entry.kind === 'touch') {
      const touches = [...pointers.current.entries()].filter(([, p]) => p.kind === 'touch')
      if (touches.length >= 2) {
        const [a, b] = touches
        const prev: [Pt, Pt] = [a[1].pt, b[1].pt]
        const next: [Pt, Pt] = [a[0] === e.pointerId ? cur : a[1].pt, b[0] === e.pointerId ? cur : b[1].pt]
        view.current = pinchView(view.current, viewport(), PAINTING_SIZE, prev, next)
      } else {
        view.current = panView(view.current, cur.x - entry.pt.x, cur.y - entry.pt.y)
      }
    } else if (g.current.mode === 'tool' && e.pointerId === g.current.strokeId) {
      const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
      for (const ev of coalesced.length ? coalesced : [e.nativeEvent]) continueTool(ev)
    }
    entry.pt = cur
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerId === g.current.strokeId) {
      endTool()
      if (g.current.mode === 'tool') g.current.mode = 'idle'
    }
    pointers.current.delete(e.pointerId)
    if (g.current.mode === 'gesture' && touchCount() === 0) g.current.mode = 'idle'
    if (pointers.current.size === 0) g.current.mode = 'idle'
  }

  return (
    <canvas
      ref={canvasRef}
      className="paint-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}
