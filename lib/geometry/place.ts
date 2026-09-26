import type { Placement } from '@/lib/doc/types'
import type { Mat3, Pt } from './mat3'
import type { Rect } from './view'

export type { Rect }

export function layerToPainting(p: Pt, place: Placement, size: number): Pt {
  return { x: (p.x - size / 2) * place.scale + size / 2 + place.x, y: (p.y - size / 2) * place.scale + size / 2 + place.y }
}

export function paintingToLayer(p: Pt, place: Placement, size: number): Pt {
  return { x: (p.x - size / 2 - place.x) / place.scale + size / 2, y: (p.y - size / 2 - place.y) / place.scale + size / 2 }
}

/** Shader form: (x/size, y/size, scale). Matches toLayer() in shaders.ts. */
export function placeUniform(place: Placement, size: number): [number, number, number] {
  return [place.x / size, place.y / size, place.scale]
}

/** Fit an image inside `frac` of the canvas, centered. */
export function fitContain(w: number, h: number, size: number, frac = 0.8): Rect {
  const s = Math.min((size * frac) / w, (size * frac) / h)
  const rw = w * s, rh = h * s
  return { x: (size - rw) / 2, y: (size - rh) / 2, w: rw, h: rh }
}

/** a_pos in [0,1]² → clip for a rect in target px (row 0 = top, no flip). */
export function rectToTargetClip(r: Rect, size: number): Mat3 {
  return [(2 * r.w) / size, 0, 0, 0, (2 * r.h) / size, 0, (2 * r.x) / size - 1, (2 * r.y) / size - 1, 1]
}
