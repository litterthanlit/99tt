import { describe, expect, it } from 'vitest'
import { FULLSCREEN, apply, rotateAbout, scaleAbout, translate } from './mat3'
import { DEFAULT_VIEW, paintingRect, paintingToScreen, panView, pinchView, rectToClip, screenToPainting } from './view'
import { fitContain, layerToPainting, paintingToLayer, placeUniform, rectToTargetClip } from './place'

const vp = { width: 1000, height: 800 }
const S = 2048
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

describe('mat3', () => {
  it('translate / scaleAbout / rotateAbout', () => {
    close(apply(translate(0.1, -0.2), { x: 0.5, y: 0.5 }), { x: 0.6, y: 0.3 })
    close(apply(scaleAbout({ x: 0.3, y: 0.3 }, 2), { x: 0.3, y: 0.3 }), { x: 0.3, y: 0.3 })
    close(apply(scaleAbout({ x: 0, y: 0 }, 2), { x: 0.4, y: 0.2 }), { x: 0.2, y: 0.1 })
    close(apply(rotateAbout({ x: 0.5, y: 0.5 }, Math.PI / 2), { x: 0.5, y: 0.5 }), { x: 0.5, y: 0.5 })
    const p = apply(rotateAbout({ x: 0, y: 0 }, 1.1), { x: 0.3, y: 0.4 })
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(0.5, 6)
  })
})

describe('view', () => {
  it('default view letterboxes and centers', () => {
    expect(paintingRect(vp, S, DEFAULT_VIEW)).toEqual({ x: 100, y: 0, w: 800, h: 800 })
    close(screenToPainting({ x: 500, y: 400 }, vp, S, DEFAULT_VIEW), { x: 1024, y: 1024 })
  })
  it('round-trips', () => {
    const view = { zoom: 2.5, panX: 40, panY: -12 }
    const p = { x: 300, y: 1700 }
    close(screenToPainting(paintingToScreen(p, vp, S, view), vp, S, view), p)
  })
  it('pinch zooms around the fingers', () => {
    const v = pinchView(DEFAULT_VIEW, vp, S, [{ x: 400, y: 400 }, { x: 600, y: 400 }], [{ x: 300, y: 400 }, { x: 700, y: 400 }])
    expect(v.zoom).toBeCloseTo(2, 6)
    close(screenToPainting({ x: 500, y: 400 }, vp, S, v), { x: 1024, y: 1024 })
  })
  it('two-finger drag pans', () => {
    const v = pinchView(DEFAULT_VIEW, vp, S, [{ x: 400, y: 400 }, { x: 600, y: 400 }], [{ x: 410, y: 420 }, { x: 610, y: 420 }])
    expect(v).toEqual({ zoom: 1, panX: 10, panY: 20 })
    expect(panView(v, 5, 5)).toEqual({ zoom: 1, panX: 15, panY: 25 })
  })
  it('rectToClip maps the painting rect to clip space (y flipped)', () => {
    const m = rectToClip({ x: 100, y: 0, w: 800, h: 800 }, vp)
    close(apply(m, { x: 0, y: 0 }), { x: -0.8, y: 1 })
    close(apply(m, { x: 1, y: 1 }), { x: 0.8, y: -1 })
  })
})

describe('place', () => {
  it('layer ↔ painting round trip', () => {
    const place = { x: 120, y: -40, scale: 0.5 }
    const p = { x: 700, y: 900 }
    close(paintingToLayer(layerToPainting(p, place, S), place, S), p)
    close(layerToPainting({ x: 1024, y: 1024 }, place, S), { x: 1144, y: 984 })
  })
  it('fitContain centers at 80% of the canvas', () => {
    const r = fitContain(1000, 500, S)
    expect(r.w).toBeCloseTo(1638.4, 6)
    expect(r.h).toBeCloseTo(819.2, 6)
    expect(r.x).toBeCloseTo(204.8, 6)
    expect(r.y).toBeCloseTo(614.4, 6)
  })
  it('placeUniform and rectToTargetClip', () => {
    expect(placeUniform({ x: 1024, y: -512, scale: 2 }, S)).toEqual([0.5, -0.25, 2])
    expect(rectToTargetClip({ x: 0, y: 0, w: S, h: S }, S)).toEqual(FULLSCREEN)
  })
})
