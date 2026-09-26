import { clamp, clamp01 } from '@/lib/util/math'
import {
  BLEND_MODES, FLOW_RECIPES, TRANSFORM_RECIPES,
  type BlendMode, type Flow, type FlowRecipe, type Harmonize, type Transform, type TransformRecipe,
} from './types'

export class RecipeError extends Error {}

export interface FlowKnobs { speed?: number; intensity?: number; direction?: number; seed?: number; originX?: number; originY?: number }
export interface TransformKnobs { speed?: number; intensity?: number; direction?: number }

const wrapDeg = (d: number) => ((d % 360) + 360) % 360
const randomSeed = () => Math.floor(Math.random() * 1_000_000)

export const isFlowRecipe = (n: string): n is FlowRecipe => (FLOW_RECIPES as readonly string[]).includes(n)
export const isTransformRecipe = (n: string): n is TransformRecipe => (TRANSFORM_RECIPES as readonly string[]).includes(n)
export const isBlendMode = (n: string): n is BlendMode => (BLEND_MODES as readonly string[]).includes(n)

export const NO_FLOW: Flow = { recipe: 'none', speed: 1, intensity: 0.5, direction: 0, seed: 0, originX: 0.5, originY: 0.5 }
export const NO_TRANSFORM: Transform = { recipe: 'none', speed: 1, intensity: 0.5, direction: 0 }
export const NO_HARMONIZE: Harmonize = { feather: 0, colorMatch: 0, bleed: 0 }
export const BLEND_IN_PRESET: Harmonize = { feather: 12, colorMatch: 0.4, bleed: 0.35 }

export function makeFlow(name: string, knobs: FlowKnobs = {}, seed: () => number = randomSeed): Flow {
  if (!isFlowRecipe(name)) throw new RecipeError(`Unknown recipe: ${name}`)
  return {
    recipe: name,
    speed: clamp(knobs.speed ?? 1, 0, 10),
    intensity: clamp01(knobs.intensity ?? 0.5),
    direction: wrapDeg(knobs.direction ?? (name === 'melt' ? 270 : 0)),
    seed: Math.floor(knobs.seed ?? seed()),
    originX: clamp01(knobs.originX ?? 0.5),
    originY: clamp01(knobs.originY ?? 0.5),
  }
}

export function makeTransform(name: string, knobs: TransformKnobs = {}): Transform {
  if (!isTransformRecipe(name)) throw new RecipeError(`Unknown recipe: ${name}`)
  return {
    recipe: name,
    speed: clamp(knobs.speed ?? 1, 0, 10),
    intensity: clamp01(knobs.intensity ?? 0.5),
    direction: wrapDeg(knobs.direction ?? 0),
  }
}

export function makeHarmonize(h: Partial<Harmonize>): Harmonize {
  return {
    feather: clamp(h.feather ?? 0, 0, 64),
    colorMatch: clamp01(h.colorMatch ?? 0),
    bleed: clamp01(h.bleed ?? 0),
  }
}
