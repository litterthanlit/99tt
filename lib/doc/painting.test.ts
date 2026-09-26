import { describe, expect, it } from 'vitest'
import { createPainting, elapsedSeconds, reduce } from './painting'

const base = () => createPainting(1000, 'L1')

describe('createPainting', () => {
  it('starts 2048², playing, with Layer 1 focused', () => {
    const p = base()
    expect(p).toMatchObject({ width: 2048, height: 2048, playing: true, startedAt: 1000, pausedElapsed: 0, focusedLayerId: 'L1', grain: 0 })
    expect(p.layers.map(l => l.name)).toEqual(['Layer 1'])
    expect(p.layers[0].flow.recipe).toBe('none')
  })
})

describe('reduce', () => {
  it('adds a layer on top and focuses it', () => {
    const p = reduce(base(), { type: 'addLayer', id: 'L2' })
    expect(p.layers.map(l => l.id)).toEqual(['L1', 'L2'])
    expect(p.layers[1].name).toBe('Layer 2')
    expect(p.focusedLayerId).toBe('L2')
  })
  it('refuses to remove the last layer', () => {
    expect(() => reduce(base(), { type: 'removeLayer', layerId: 'L1' })).toThrow('Cannot remove the last layer')
  })
  it('removing the focused layer focuses the new top', () => {
    let p = reduce(base(), { type: 'addLayer', id: 'L2' })
    p = reduce(p, { type: 'addLayer', id: 'L3' })
    p = reduce(p, { type: 'removeLayer', layerId: 'L3' })
    expect(p.focusedLayerId).toBe('L2')
  })
  it('moves a layer', () => {
    let p = reduce(base(), { type: 'addLayer', id: 'L2' })
    p = reduce(p, { type: 'moveLayer', layerId: 'L2', toIndex: 0 })
    expect(p.layers.map(l => l.id)).toEqual(['L2', 'L1'])
  })
  it('patches a layer and clamps opacity', () => {
    const p = reduce(base(), { type: 'patchLayer', layerId: 'L1', patch: { opacity: 3, blend: 'multiply' } })
    expect(p.layers[0]).toMatchObject({ opacity: 1, blend: 'multiply' })
  })
  it('throws Layer not found', () => {
    expect(() => reduce(base(), { type: 'focus', layerId: 'nope' })).toThrow('Layer not found')
  })
  it('pause freezes time, play resumes from the frozen time', () => {
    let p = reduce(base(), { type: 'setPlayback', playing: false, now: 3000 })
    expect(p.pausedElapsed).toBe(2)
    expect(elapsedSeconds(p, 99_000)).toBe(2)
    p = reduce(p, { type: 'setPlayback', playing: true, now: 5000 })
    expect(elapsedSeconds(p, 6000)).toBe(3)
  })
  it('clamps grain', () => {
    expect(reduce(base(), { type: 'setGrain', grain: 4 }).grain).toBe(1)
  })
})
