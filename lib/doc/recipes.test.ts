import { describe, expect, it } from 'vitest'
import { BLEND_IN_PRESET, isBlendMode, makeFlow, makeHarmonize, makeTransform } from './recipes'

describe('makeFlow', () => {
  it('fills defaults', () => {
    expect(makeFlow('smoke', {}, () => 42)).toEqual({
      recipe: 'smoke', speed: 1, intensity: 0.5, direction: 0, seed: 42, originX: 0.5, originY: 0.5,
    })
  })
  it('melt falls down (270deg) unless told otherwise', () => {
    expect(makeFlow('melt', {}, () => 1).direction).toBe(270)
    expect(makeFlow('melt', { direction: 90 }, () => 1).direction).toBe(90)
  })
  it('clamps knobs and wraps direction', () => {
    const f = makeFlow('streaks', { speed: 99, intensity: 2, direction: -90, originX: 3 }, () => 1)
    expect(f.speed).toBe(10)
    expect(f.intensity).toBe(1)
    expect(f.direction).toBe(270)
    expect(f.originX).toBe(1)
  })
  it('keeps an explicit seed', () => {
    expect(makeFlow('rush', { seed: 7, originX: 0.3 }, () => 1)).toMatchObject({ seed: 7, originX: 0.3 })
  })
  it('rejects unknown recipes', () => {
    expect(() => makeFlow('vortex')).toThrow('Unknown recipe')
  })
})

describe('makeTransform', () => {
  it('fills defaults', () => {
    expect(makeTransform('turn')).toEqual({ recipe: 'turn', speed: 1, intensity: 0.5, direction: 0 })
  })
  it('rejects unknown recipes', () => {
    expect(() => makeTransform('wobble')).toThrow('Unknown recipe')
  })
})

describe('makeHarmonize', () => {
  it('clamps', () => {
    expect(makeHarmonize({ feather: 200, colorMatch: -1, bleed: 0.5 })).toEqual({ feather: 64, colorMatch: 0, bleed: 0.5 })
  })
  it('preset is valid', () => {
    expect(makeHarmonize(BLEND_IN_PRESET)).toEqual(BLEND_IN_PRESET)
  })
})

describe('isBlendMode', () => {
  it('knows the list', () => {
    expect(isBlendMode('soft-light')).toBe(true)
    expect(isBlendMode('dissolve')).toBe(false)
  })
})
