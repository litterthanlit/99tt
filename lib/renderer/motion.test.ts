import { describe, expect, it } from 'vitest'
import { createPainting, reduce } from '@/lib/doc/painting'
import { makeFlow, makeTransform } from '@/lib/doc/recipes'
import { apply } from '@/lib/geometry/mat3'
import { analysisKey } from './analysisKey'
import { dirVector, flowUniforms, transformAt } from './motion'

const c = { x: 0.3, y: 0.6 }

describe('dirVector', () => {
  it('0 = right, 90 = up (y-down uv)', () => {
    expect(dirVector(0).x).toBeCloseTo(1, 6)
    expect(dirVector(90).y).toBeCloseTo(-1, 6)
  })
})

describe('transformAt', () => {
  it('none is identity at base opacity', () => {
    const r = transformAt(makeTransform('none'), 3, c, 0.7)
    expect(apply(r.matrix, { x: 0.2, y: 0.9 })).toEqual({ x: 0.2, y: 0.9 })
    expect(r.opacity).toBe(0.7)
  })
  it('drift moves content along the direction', () => {
    const t = Math.PI / 2 / 0.6 // sin(t * 0.6) = 1 at speed 1
    const r = transformAt(makeTransform('drift', { intensity: 1 }), t, c, 1)
    const p = apply(r.matrix, { x: 0.5, y: 0.5 })
    expect(p.x).toBeCloseTo(0.42, 6)
    expect(p.y).toBeCloseTo(0.5, 6)
  })
  it('pulse and turn keep the centroid fixed', () => {
    for (const name of ['pulse', 'turn']) {
      const p = apply(transformAt(makeTransform(name, { intensity: 1 }), 1.3, c, 1).matrix, c)
      expect(p.x).toBeCloseTo(c.x, 6)
      expect(p.y).toBeCloseTo(c.y, 6)
    }
  })
  it('breathe uses layer opacity as the midpoint', () => {
    expect(transformAt(makeTransform('breathe'), 0, c, 0.5).opacity).toBeCloseTo(0.5, 6)
    expect(transformAt(makeTransform('breathe', { intensity: 1 }), Math.PI / 3, c, 0.5).opacity).toBeCloseTo(0.8, 6)
  })
})

describe('flowUniforms', () => {
  it('maps a recipe to shader inputs', () => {
    const u = flowUniforms(makeFlow('rush', { direction: 90, seed: 1000, originX: 0.25 }))
    expect(u.kind).toBe(5)
    expect(u.dir[0]).toBeCloseTo(0, 6)
    expect(u.dir[1]).toBeCloseTo(-1, 6)
    expect(u.seed).toEqual([3, 63])
    expect(u.origin).toEqual([0.25, 0.5])
  })
})

describe('analysisKey', () => {
  it('tracks layers below only when color match is on', () => {
    let p = createPainting(0, 'A')
    p = reduce(p, { type: 'addLayer', id: 'B' })
    const v = new Map([['A', 1], ['B', 1]])
    const key = () => analysisKey(p, 1, id => v.get(id) ?? 0)
    const k1 = key()
    v.set('A', 2)
    expect(key()).toBe(k1)
    p = reduce(p, { type: 'patchLayer', layerId: 'B', patch: { harmonize: { feather: 0, colorMatch: 0.5, bleed: 0 } } })
    const k2 = key()
    v.set('A', 3)
    expect(key()).not.toBe(k2)
  })
})
