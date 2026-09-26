import { rgbToLab, type Vec3 } from '@/lib/color/lab'
import { clamp } from '@/lib/util/math'

export interface LabStats { mean: Vec3; std: Vec3; weight: number }
/** Shader applies: lab' = (lab - srcMean) * scale + dstMean */
export interface ColorTransfer { srcMean: Vec3; scale: Vec3; dstMean: Vec3 }

/** ≈ 8 fully opaque pixels of a 128² readback */
const MIN_WEIGHT = 8

/** Weighted Lab mean/std of premultiplied RGBA8 pixels. */
export function labStats(px: ArrayLike<number>, weight: (i: number) => number): LabStats {
  const n = px.length / 4
  let total = 0
  const s: Vec3 = [0, 0, 0], s2: Vec3 = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3]
    const w = weight(i)
    if (w <= 0 || a === 0) continue
    const lab = rgbToLab([Math.min(1, px[i * 4] / a), Math.min(1, px[i * 4 + 1] / a), Math.min(1, px[i * 4 + 2] / a)])
    total += w
    for (let k = 0; k < 3; k++) {
      s[k] += w * lab[k]
      s2[k] += w * lab[k] * lab[k]
    }
  }
  if (total === 0) return { mean: [0, 0, 0], std: [0, 0, 0], weight: 0 }
  const mean = s.map(v => v / total) as Vec3
  const std = s2.map((v, k) => Math.sqrt(Math.max(0, v / total - mean[k] * mean[k]))) as Vec3
  return { mean, std, weight: total }
}

/** Reinhard transfer from the layer's colors toward the backdrop under the layer's footprint. */
export function colorTransfer(layer: ArrayLike<number>, below: ArrayLike<number>): ColorTransfer | null {
  const footprint = (i: number) => layer[i * 4 + 3] / 255
  const src = labStats(layer, footprint)
  const dst = labStats(below, footprint)
  if (src.weight < MIN_WEIGHT || dst.weight < MIN_WEIGHT) return null
  const scale = src.std.map((s, k) => clamp(Math.max(dst.std[k], 1) / Math.max(s, 1), 0.4, 2.5)) as Vec3
  return { srcMean: src.mean, scale, dstMean: dst.mean }
}

/** Alpha-weighted center in uv (0–1), rows top-down. */
export function alphaCentroid(px: ArrayLike<number>, w: number, h: number): { x: number; y: number } | null {
  let sum = 0, sx = 0, sy = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3]
      if (!a) continue
      sum += a
      sx += a * (x + 0.5)
      sy += a * (y + 0.5)
    }
  }
  return sum === 0 ? null : { x: sx / sum / w, y: sy / sum / h }
}
