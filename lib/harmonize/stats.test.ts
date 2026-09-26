import { describe, expect, it } from 'vitest'
import { rgbToLab } from '@/lib/color/lab'
import { alphaCentroid, colorTransfer } from './stats'

type Px = [number, number, number, number]
const buf = (pixels: Px[]) => Uint8Array.from(pixels.flat())
const fill = (n: number, px: Px) => Array.from({ length: n }, () => px)
const RED: Px = [255, 0, 0, 255]
const BLUE: Px = [0, 0, 255, 255]
const GREEN: Px = [0, 255, 0, 255]
const CLEAR: Px = [0, 0, 0, 0]

describe('colorTransfer', () => {
  it('maps the layer mean onto the backdrop mean', () => {
    const t = colorTransfer(buf(fill(16, RED)), buf(fill(16, BLUE)))!
    const red = rgbToLab([1, 0, 0]), blue = rgbToLab([0, 0, 1])
    t.srcMean.forEach((v, i) => expect(v).toBeCloseTo(red[i], 6))
    t.dstMean.forEach((v, i) => expect(v).toBeCloseTo(blue[i], 6))
    expect(t.scale).toEqual([1, 1, 1])
  })
  it('only looks at the backdrop under the layer footprint', () => {
    const layer = buf([...fill(8, RED), ...fill(8, CLEAR)])
    const below = buf([...fill(8, BLUE), ...fill(8, GREEN)])
    const blue = rgbToLab([0, 0, 1])
    colorTransfer(layer, below)!.dstMean.forEach((v, i) => expect(v).toBeCloseTo(blue[i], 6))
  })
  it('returns null for an empty layer', () => {
    expect(colorTransfer(buf(fill(16, CLEAR)), buf(fill(16, BLUE)))).toBeNull()
  })
  it('handles premultiplied half-alpha pixels', () => {
    const t = colorTransfer(buf(fill(32, [128, 0, 0, 128])), buf(fill(32, BLUE)))!
    const red = rgbToLab([1, 0, 0])
    t.srcMean.forEach((v, i) => expect(v).toBeCloseTo(red[i], 6))
  })
})

describe('alphaCentroid', () => {
  it('finds the single opaque pixel (uv)', () => {
    const px = fill(8, CLEAR)
    px[1 * 4 + 3] = RED
    expect(alphaCentroid(buf(px), 4, 2)).toEqual({ x: 0.875, y: 0.75 })
  })
  it('null when empty', () => {
    expect(alphaCentroid(buf(fill(8, CLEAR)), 4, 2)).toBeNull()
  })
})
