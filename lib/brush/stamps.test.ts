import { describe, expect, it } from 'vitest'
import { normalizePressure, radiusAt, stampSegment, stampStroke } from './stamps'

const pt = (x: number, pressure = 1) => ({ x, y: 0, pressure })

describe('pressure', () => {
  it('uses pen pressure, full pressure otherwise', () => {
    expect(normalizePressure('pen', 0.4)).toBe(0.4)
    expect(normalizePressure('pen', 0)).toBe(1)
    expect(normalizePressure('touch', 0.5)).toBe(1)
    expect(normalizePressure('mouse', 0.5)).toBe(1)
  })
  it('scales radius', () => {
    expect(radiusAt(20, 1)).toBe(10)
    expect(radiusAt(20, 0.5)).toBeCloseTo(6, 6)
  })
})

describe('stampStroke', () => {
  it('a tap is one dab', () => {
    const d = stampStroke([pt(5)], 20, 1)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ x: 5, y: 0, radius: 10 })
  })
  it('evenly spaces dabs (spacing = 12% of size)', () => {
    const d = stampStroke([pt(0), pt(100)], 20, 1)
    expect(d).toHaveLength(42)
    expect(d[1].x - d[0].x).toBeCloseTo(2.4, 6)
  })
  it('carries spacing across segments', () => {
    expect(stampStroke([pt(0), pt(50), pt(100)], 20, 1)).toHaveLength(42)
  })
  it('matches incremental stamping (live drawing == replay)', () => {
    const pts = [pt(0), pt(13, 0.3), pt(40, 0.9), pt(41), pt(90, 0.5)]
    let r = stampSegment(pts[0], pts[0], 16, 0.6, 0)
    const live = [...r.dabs]
    for (let i = 1; i < pts.length; i++) {
      r = stampSegment(pts[i - 1], pts[i], 16, 0.6, r.carry)
      live.push(...r.dabs)
    }
    expect(stampStroke(pts, 16, 0.6)).toEqual(live)
  })
  it('lower opacity means lower per-dab alpha', () => {
    expect(stampStroke([pt(0)], 20, 0.3)[0].alpha).toBeLessThan(stampStroke([pt(0)], 20, 1)[0].alpha)
  })
})
