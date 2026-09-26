/** 3×3 matrix, column-major (as uniformMatrix3fv expects). */
export type Mat3 = [number, number, number, number, number, number, number, number, number]
export interface Pt { x: number; y: number }

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
/** a_pos in [0,1]² → clip [-1,1]², no flip (render targets). */
export const FULLSCREEN: Mat3 = [2, 0, 0, 0, 2, 0, -1, -1, 1]

export function apply(m: Mat3, p: Pt): Pt {
  return { x: m[0] * p.x + m[3] * p.y + m[6], y: m[1] * p.x + m[4] * p.y + m[7] }
}

export function translate(tx: number, ty: number): Mat3 {
  return [1, 0, 0, 0, 1, 0, tx, ty, 1]
}

/** Sampling matrix: content grows by s around c. */
export function scaleAbout(c: Pt, s: number): Mat3 {
  const k = 1 / s
  return [k, 0, 0, 0, k, 0, c.x - c.x * k, c.y - c.y * k, 1]
}

/** Sampling matrix: content rotates by a (radians) around c. */
export function rotateAbout(c: Pt, a: number): Mat3 {
  const cos = Math.cos(a), sin = Math.sin(a)
  return [cos, -sin, 0, sin, cos, 0, c.x - (cos * c.x + sin * c.y), c.y - (-sin * c.x + cos * c.y), 1]
}
