import { clamp } from '@/lib/util/math'
import type { Mat3, Pt } from './mat3'

export type { Pt }
export interface View { zoom: number; panX: number; panY: number }
export interface Viewport { width: number; height: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 }
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

export function viewScale(vp: Viewport, size: number, view: View): number {
  return (Math.min(vp.width, vp.height) / size) * view.zoom
}

export function paintingToScreen(p: Pt, vp: Viewport, size: number, view: View): Pt {
  const s = viewScale(vp, size, view)
  return { x: vp.width / 2 + (p.x - size / 2) * s + view.panX, y: vp.height / 2 + (p.y - size / 2) * s + view.panY }
}

export function screenToPainting(p: Pt, vp: Viewport, size: number, view: View): Pt {
  const s = viewScale(vp, size, view)
  return { x: (p.x - vp.width / 2 - view.panX) / s + size / 2, y: (p.y - vp.height / 2 - view.panY) / s + size / 2 }
}

export function paintingRect(vp: Viewport, size: number, view: View): Rect {
  const tl = paintingToScreen({ x: 0, y: 0 }, vp, size, view)
  const s = viewScale(vp, size, view) * size
  return { x: tl.x, y: tl.y, w: s, h: s }
}

export function panView(view: View, dx: number, dy: number): View {
  return { ...view, panX: view.panX + dx, panY: view.panY + dy }
}

/** Keeps the painting point under the previous finger midpoint under the new midpoint. */
export function pinchView(view: View, vp: Viewport, size: number, prev: [Pt, Pt], next: [Pt, Pt]): View {
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
  const anchor = screenToPainting(mid(...prev), vp, size, view)
  const nm = mid(...next)
  const zoom = clamp(view.zoom * (dist(...next) / Math.max(1, dist(...prev))), MIN_ZOOM, MAX_ZOOM)
  const s = (Math.min(vp.width, vp.height) / size) * zoom
  return {
    zoom,
    panX: nm.x - vp.width / 2 - (anchor.x - size / 2) * s,
    panY: nm.y - vp.height / 2 - (anchor.y - size / 2) * s,
  }
}

/** a_pos in [0,1]² → clip for a rect given in CSS px of the viewport (y flipped for the screen). */
export function rectToClip(r: Rect, vp: Viewport): Mat3 {
  return [
    (2 * r.w) / vp.width, 0, 0,
    0, (-2 * r.h) / vp.height, 0,
    (2 * r.x) / vp.width - 1, 1 - (2 * r.y) / vp.height, 1,
  ]
}
