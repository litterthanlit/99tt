import { FLOW_RECIPES, type Flow, type Transform } from '@/lib/doc/types'
import { IDENTITY, rotateAbout, scaleAbout, translate, type Mat3, type Pt } from '@/lib/geometry/mat3'
import { clamp01 } from '@/lib/util/math'

export function dirVector(deg: number): Pt {
  const r = (deg * Math.PI) / 180
  return { x: Math.cos(r), y: -Math.sin(r) }
}

/** Matrix maps output painting uv → sample uv. `centroid` is in painting uv. */
export function transformAt(tr: Transform, t: number, centroid: Pt, baseOpacity: number): { matrix: Mat3; opacity: number } {
  const k = tr.intensity
  const w = t * tr.speed
  switch (tr.recipe) {
    case 'drift': {
      const d = dirVector(tr.direction)
      const amt = 0.08 * k * Math.sin(w * 0.6)
      return { matrix: translate(-d.x * amt, -d.y * amt), opacity: baseOpacity }
    }
    case 'pulse':
      return { matrix: scaleAbout(centroid, 1 + 0.12 * k * Math.sin(w * 2)), opacity: baseOpacity }
    case 'turn':
      return { matrix: rotateAbout(centroid, w * 0.3 * (0.25 + k)), opacity: baseOpacity }
    case 'breathe':
      return { matrix: IDENTITY, opacity: clamp01(baseOpacity * (1 + 0.6 * k * Math.sin(w * 1.5))) }
    default:
      return { matrix: IDENTITY, opacity: baseOpacity }
  }
}

export interface FlowUniforms {
  kind: number
  speed: number
  intensity: number
  dir: [number, number]
  seed: [number, number]
  origin: [number, number]
}

export function flowUniforms(f: Flow): FlowUniforms {
  const d = dirVector(f.direction)
  return {
    kind: FLOW_RECIPES.indexOf(f.recipe),
    speed: f.speed,
    intensity: f.intensity,
    dir: [d.x, d.y],
    // keep noise offsets small so GLSL float precision holds
    seed: [f.seed % 997, (f.seed * 7) % 991],
    origin: [f.originX, f.originY],
  }
}
