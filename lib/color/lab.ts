import { clamp01 } from '@/lib/util/math'

export type Vec3 = [number, number, number]

// D65 white; constants must match LAB in lib/renderer/shaders.ts
const XN = 0.95047, YN = 1.0, ZN = 1.08883
const EPS = 216 / 24389
const KAPPA = 24389 / 27

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116)
const fInv = (t: number) => (t * t * t > EPS ? t * t * t : (116 * t - 16) / KAPPA)

export function rgbToLab([r, g, b]: Vec3): Vec3 {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b)
  const fx = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN)
  const fy = f((0.2126729 * R + 0.7151522 * G + 0.072175 * B) / YN)
  const fz = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / ZN)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labToRgb([L, a, b]: Vec3): Vec3 {
  const fy = (L + 16) / 116
  const x = fInv(fy + a / 500) * XN, y = fInv(fy) * YN, z = fInv(fy - b / 200) * ZN
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  return [toSrgb(clamp01(R)), toSrgb(clamp01(G)), toSrgb(clamp01(B))]
}
