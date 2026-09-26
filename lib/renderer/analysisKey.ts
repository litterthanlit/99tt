import type { Painting } from '@/lib/doc/types'

/** Changes whenever the layer's centroid or color-transfer inputs change. */
export function analysisKey(p: Painting, index: number, versionOf: (layerId: string) => number): string {
  const l = p.layers[index]
  const own = [l.id, versionOf(l.id), l.place.x, l.place.y, l.place.scale].join(',')
  if (l.harmonize.colorMatch <= 0) return own
  const below = p.layers
    .slice(0, index)
    .map(b => [b.id, versionOf(b.id), b.visible, b.opacity, b.blend, b.place.x, b.place.y, b.place.scale, b.harmonize.feather].join(','))
  return [own, p.background, ...below].join('|')
}
