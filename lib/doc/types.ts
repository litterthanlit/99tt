export const PAINTING_SIZE = 2048

export const FLOW_RECIPES = ['none', 'smoke', 'melt', 'streaks', 'shimmer', 'rush'] as const
export const TRANSFORM_RECIPES = ['none', 'drift', 'pulse', 'turn', 'breathe'] as const
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'darken', 'lighten'] as const

export type FlowRecipe = (typeof FLOW_RECIPES)[number]
export type TransformRecipe = (typeof TRANSFORM_RECIPES)[number]
export type BlendMode = (typeof BLEND_MODES)[number]

export interface Flow {
  recipe: FlowRecipe
  speed: number
  intensity: number
  direction: number
  seed: number
  originX: number
  originY: number
}

export interface Transform {
  recipe: TransformRecipe
  speed: number
  intensity: number
  direction: number
}

/** Blend-in settings for pasted layers. feather in layer px, others 0–1. */
export interface Harmonize {
  feather: number
  colorMatch: number
  bleed: number
}

/** Non-destructive placement: layer px → painting px = (p - S/2) * scale + S/2 + (x, y). */
export interface Placement {
  x: number
  y: number
  scale: number
}

export interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number
  blend: BlendMode
  place: Placement
  flow: Flow
  transform: Transform
  harmonize: Harmonize
}

export interface Painting {
  width: number
  height: number
  /** index 0 = bottom */
  layers: Layer[]
  focusedLayerId: string | null
  playing: boolean
  startedAt: number
  pausedElapsed: number
  grain: number
  background: string
}
