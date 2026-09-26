import { describe, expect, it } from 'vitest'
import { hexToRgb } from './hex'
import { labToRgb, rgbToLab } from './lab'

describe('hexToRgb', () => {
  it('parses', () => {
    expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0])
    expect(hexToRgb('00FF00')).toEqual([0, 1, 0])
  })
  it('rejects junk', () => {
    expect(() => hexToRgb('red')).toThrow('Bad color')
  })
})

describe('lab', () => {
  it('white, black, red', () => {
    const w = rgbToLab([1, 1, 1])
    expect(w[0]).toBeCloseTo(100, 1)
    expect(w[1]).toBeCloseTo(0, 1)
    expect(w[2]).toBeCloseTo(0, 1)
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 6)
    const r = rgbToLab([1, 0, 0])
    expect(r[0]).toBeCloseTo(53.24, 1)
    expect(r[1]).toBeCloseTo(80.09, 1)
    expect(r[2]).toBeCloseTo(67.2, 1)
  })
  it('round-trips', () => {
    const back = labToRgb(rgbToLab([0.2, 0.5, 0.8]))
    back.forEach((v, i) => expect(v).toBeCloseTo([0.2, 0.5, 0.8][i], 5))
  })
})
