import { clamp01 } from '@/lib/util/math'
import { NO_FLOW, NO_HARMONIZE, NO_TRANSFORM } from './recipes'
import { PAINTING_SIZE, type Layer, type Painting } from './types'

export class DocError extends Error {}

export type LayerPatch = Partial<Pick<Layer, 'name' | 'visible' | 'opacity' | 'blend' | 'place' | 'flow' | 'transform' | 'harmonize'>>

export type Action =
  | { type: 'addLayer'; id: string; name?: string }
  | { type: 'removeLayer'; layerId: string }
  | { type: 'moveLayer'; layerId: string; toIndex: number }
  | { type: 'patchLayer'; layerId: string; patch: LayerPatch }
  | { type: 'focus'; layerId: string }
  | { type: 'setPlayback'; playing: boolean; now: number }
  | { type: 'setGrain'; grain: number }
  | { type: 'setBackground'; color: string }

export function createLayer(id: string, name: string): Layer {
  return {
    id, name, visible: true, opacity: 1, blend: 'normal',
    place: { x: 0, y: 0, scale: 1 },
    flow: { ...NO_FLOW }, transform: { ...NO_TRANSFORM }, harmonize: { ...NO_HARMONIZE },
  }
}

export function createPainting(now: number, firstLayerId: string): Painting {
  const first = createLayer(firstLayerId, 'Layer 1')
  return {
    width: PAINTING_SIZE, height: PAINTING_SIZE, layers: [first], focusedLayerId: first.id,
    playing: true, startedAt: now, pausedElapsed: 0, grain: 0, background: '#f3efe6',
  }
}

export function elapsedSeconds(p: Pick<Painting, 'playing' | 'startedAt' | 'pausedElapsed'>, now: number): number {
  return p.playing ? p.pausedElapsed + Math.max(0, now - p.startedAt) / 1000 : p.pausedElapsed
}

function indexOf(p: Painting, id: string): number {
  const i = p.layers.findIndex(l => l.id === id)
  if (i < 0) throw new DocError('Layer not found')
  return i
}

export function reduce(p: Painting, a: Action): Painting {
  switch (a.type) {
    case 'addLayer': {
      const layer = createLayer(a.id, a.name ?? `Layer ${p.layers.length + 1}`)
      return { ...p, layers: [...p.layers, layer], focusedLayerId: layer.id }
    }
    case 'removeLayer': {
      const i = indexOf(p, a.layerId)
      if (p.layers.length === 1) throw new DocError('Cannot remove the last layer')
      const layers = p.layers.filter((_, j) => j !== i)
      const focusedLayerId = p.focusedLayerId === a.layerId ? layers[layers.length - 1].id : p.focusedLayerId
      return { ...p, layers, focusedLayerId }
    }
    case 'moveLayer': {
      const i = indexOf(p, a.layerId)
      const layers = [...p.layers]
      const [layer] = layers.splice(i, 1)
      layers.splice(Math.max(0, Math.min(layers.length, a.toIndex)), 0, layer)
      return { ...p, layers }
    }
    case 'patchLayer': {
      const i = indexOf(p, a.layerId)
      const patch = { ...a.patch }
      if (patch.opacity !== undefined) patch.opacity = clamp01(patch.opacity)
      const layers = [...p.layers]
      layers[i] = { ...layers[i], ...patch }
      return { ...p, layers }
    }
    case 'focus':
      indexOf(p, a.layerId)
      return { ...p, focusedLayerId: a.layerId }
    case 'setPlayback':
      if (a.playing === p.playing) return p
      return a.playing
        ? { ...p, playing: true, startedAt: a.now }
        : { ...p, playing: false, pausedElapsed: elapsedSeconds(p, a.now) }
    case 'setGrain':
      return { ...p, grain: clamp01(a.grain) }
    case 'setBackground':
      return { ...p, background: a.color }
  }
}
