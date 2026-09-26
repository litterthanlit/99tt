export interface StrokePoint { x: number; y: number; pressure: number }
export interface Dab { x: number; y: number; radius: number; alpha: number }

export function normalizePressure(pointerType: string, pressure: number): number {
  return pointerType === 'pen' && pressure > 0 ? Math.min(1, pressure) : 1
}

export function radiusAt(size: number, pressure: number): number {
  return Math.max(0.5, (size / 2) * (0.2 + 0.8 * pressure))
}

export function spacingFor(size: number): number {
  return Math.max(0.5, size * 0.12)
}

/** Per-dab alpha so a straight stroke lands near `opacity` despite overlapping dabs. */
export function dabAlpha(opacity: number, step: number, radius: number): number {
  const o = Math.min(Math.max(opacity, 0), 0.999)
  return 1 - Math.pow(1 - o, Math.min(1, step / (2 * radius)))
}

/** Dabs from a to b. `carry` = distance along the segment where the next dab goes. */
export function stampSegment(a: StrokePoint, b: StrokePoint, size: number, opacity: number, carry: number): { dabs: Dab[]; carry: number } {
  const step = spacingFor(size)
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const dabs: Dab[] = []
  let d = carry
  while (d <= len) {
    const t = len === 0 ? 0 : d / len
    const radius = radiusAt(size, a.pressure + (b.pressure - a.pressure) * t)
    dabs.push({ x: a.x + dx * t, y: a.y + dy * t, radius, alpha: dabAlpha(opacity, step, radius) })
    d += step
  }
  return { dabs, carry: d - len }
}

/** Same dabs as live drawing (begin = segment(p0, p0), then each segment with carry). */
export function stampStroke(points: StrokePoint[], size: number, opacity: number): Dab[] {
  if (points.length === 0) return []
  let r = stampSegment(points[0], points[0], size, opacity, 0)
  const out = [...r.dabs]
  for (let i = 1; i < points.length; i++) {
    r = stampSegment(points[i - 1], points[i], size, opacity, r.carry)
    out.push(...r.dabs)
  }
  return out
}
