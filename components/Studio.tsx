'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPainting, DocError, reduce, type Action } from '@/lib/doc/painting'
import { PAINTING_SIZE, type Painting } from '@/lib/doc/types'
import { fitContain } from '@/lib/geometry/place'
import { loadImage } from '@/lib/image/loadImage'
import type { Renderer } from '@/lib/renderer/renderer'
import LayerPanel from './LayerPanel'
import PaintCanvas, { type BrushSettings } from './PaintCanvas'
import Toolbar from './Toolbar'

const newId = () => crypto.randomUUID()

function safeReduce(p: Painting, a: Action): Painting {
  try {
    return reduce(p, a)
  } catch (e) {
    if (e instanceof DocError) {
      console.warn(e.message)
      return p
    }
    throw e
  }
}

export default function Studio() {
  const [painting, dispatch] = useReducer(safeReduce, null, () => createPainting(Date.now(), newId()))
  const [activeId, setActiveId] = useState(() => painting.layers[0].id)
  const [brush, setBrush] = useState<BrushSettings>({ tool: 'paint', color: '#e2482d', size: 32, opacity: 1 })
  const [layersOpen, setLayersOpen] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const active = painting.layers.find(l => l.id === activeId) ?? painting.layers[painting.layers.length - 1]

  const undo = useCallback(() => {
    rendererRef.current?.surface(active.id).undo()
  }, [active.id])

  const importFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      try {
        const bitmap = await loadImage(file)
        const id = newId()
        dispatch({ type: 'addLayer', id, name: file.name.replace(/\.[^.]+$/, '') || 'Image' })
        rendererRef.current?.surface(id).setBase(bitmap, fitContain(bitmap.width, bitmap.height, PAINTING_SIZE))
        setActiveId(id)
      } catch {
        setStatus(`Could not open ${file.name}`)
      }
    }
  }, [])

  const addLayer = () => {
    const id = newId()
    dispatch({ type: 'addLayer', id })
    setActiveId(id)
  }

  const removeLayer = (id: string) => {
    if (painting.layers.length <= 1) return
    dispatch({ type: 'removeLayer', layerId: id })
    rendererRef.current?.dropSurface(id)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      void importFiles(files)
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      void importFiles(Array.from(e.dataTransfer?.files ?? []))
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [importFiles])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  return (
    <main className="studio">
      <PaintCanvas
        painting={painting}
        activeLayer={active}
        brush={brush}
        rendererRef={rendererRef}
        onPlace={(layerId, place) => dispatch({ type: 'patchLayer', layerId, patch: { place } })}
        onStatus={setStatus}
      />
      <Toolbar
        brush={brush}
        onBrush={setBrush}
        painting={painting}
        dispatch={dispatch}
        onUndo={undo}
        onImport={files => void importFiles(files)}
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen(o => !o)}
      />
      {layersOpen && (
        <LayerPanel painting={painting} activeId={active.id} onActivate={setActiveId} onAdd={addLayer} onRemove={removeLayer} dispatch={dispatch} />
      )}
      {status && (
        <div className="status" onClick={() => setStatus(null)}>{status}</div>
      )}
    </main>
  )
}
