# Plan 1 — Motion Canvas (local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser painting studio (iPad Safari first) where you paint or paste layers, make pasted layers blend in, and give each layer a named motion recipe (`smoke`, `melt`, `streaks`, `shimmer`, `rush`, and `drift`/`pulse`/`turn`/`breathe`) that plays live in WebGL2.

**Architecture:** A pure-TypeScript document model (`lib/doc`) holds layers and their recipe metadata. A WebGL2 renderer (`lib/renderer`) owns the pixels: one 2048² texture per layer, rebuilt from an optional image base plus a stroke list. Every frame it composites the layers bottom to top through one "layer pass" shader that applies placement, transform, flow, blend-in and blend mode. All maths that can live outside WebGL (recipes, geometry, brush spacing, color statistics, transform matrices) are pure functions with Vitest tests. Plan 2 swaps the local reducer for Convex with the same shapes. Plan 3 adds circle, extract, chat and MCP on top.

**Tech Stack:** Next.js (App Router, TypeScript), React, WebGL2 (raw, no library), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-flowing-abstract-canvas-design.md`, including the **2026-09-25 addendum**, which adds `rush`, image import, placement, blend modes, blend-in, grain and `pausedElapsed`.

---

## Roadmap (three plans, each ships something usable)

| Plan | Delivers | Status |
| --- | --- | --- |
| **1 — Motion canvas (this file)** | Paint, paste, place, blend in and animate layers locally at `/studio`. Tuned against the reference board. | Ready |
| 2 — Live document | Convex schema + edit key, live strokes, snapshot bake, `/p/{id}` shared viewer. Replaces the local reducer with mutations of the same shape. | Written after Plan 1 ships (depends on Plan 1's `Painting`/`Layer`/`LayerSurface` interfaces) |
| 3 — Circle + agent | Circle hit-test and focus, extract-by-circle (Node action), shared tool surface (+ `set_blend`, `blend_in`), AI SDK chat, MCP stdio server, Playwright smoke | Written after Plan 2 |

## Reference looks → recipes

| Reference | Recipe that should produce it |
| --- | --- |
| Painterly landscape rushing forward (Bardou clip) | `rush`, origin at the vanishing point, intensity 0.6–0.8 |
| Zoom-burst night street | `rush`, intensity 1 |
| Horizontal red/blue light smear | `streaks`, direction 0 |
| Watercolor bloom | `smoke` (+ `breathe`) |
| Dripping / sagging paint | `melt` |
| Torn collage, pasted scraps | Image import + **Blend in** (feather, color match, bleed) + `multiply`/`soft-light` + painting grain |

## Conventions (read once)

- **Repo root** is the `litterthanlit/99tt` checkout (locally: `litt-09tt-9440cba/`). All paths below are relative to it.
- **Painting space** is 2048×2048 px, y down. **Painting uv** is painting px / 2048.
- **Texture rows:** row 0 of every painting/layer texture is the painting's *top* row. Rendering into an FBO maps painting y → clip y as `y/2048*2-1` (no flip). Only the final screen blit flips. `readPixels` row 0 = painting top.
- **Colors in textures are premultiplied RGBA8.**
- **Layer order:** `painting.layers[0]` is the bottom layer.
- **Direction knob:** degrees, 0 = right, 90 = up. In y-down uv that is `(cos θ, −sin θ)`.
- Only `lib/renderer/shaders.ts` constants may change during look-tuning (Task 16).

## File map

```
app/layout.tsx                 viewport + iPad meta (replace)
app/globals.css                all styles (replace)
app/page.tsx                   landing → /studio (replace)
app/studio/page.tsx            mounts <Studio/>
components/Studio.tsx          state owner: painting reducer, active layer, brush, import, undo
components/PaintCanvas.tsx     <canvas>, renderer lifecycle, pointers (paint / move / pinch / pan)
components/Toolbar.tsx         tools, color, size, opacity, undo, image import, grain, background, play
components/LayerPanel.tsx      layer list + inspector (blend, place, flow, transform, blend in)
components/Slider.tsx          labelled range input
lib/util/math.ts               clamp helpers
lib/doc/types.ts               Painting / Layer / recipe enums
lib/doc/recipes.ts             validated recipe + harmonize constructors
lib/doc/painting.ts            pure reducer, playback clock
lib/geometry/mat3.ts           3×3 column-major matrix helpers
lib/geometry/view.ts           screen ↔ painting, pinch, pan, rect → clip
lib/geometry/place.ts          layer placement, image fit, rect → target clip
lib/brush/stamps.ts            pressure, dab spacing, stroke → dabs
lib/input/pointers.ts          pen / finger / palm mode rules
lib/color/hex.ts               #rrggbb → rgb
lib/color/lab.ts               sRGB ↔ CIE Lab
lib/harmonize/stats.ts         Lab stats, color transfer, alpha centroid
lib/renderer/motion.ts         transform recipes → matrix/opacity; flow → uniforms
lib/renderer/analysisKey.ts    cache key for per-layer analysis
lib/renderer/shaders.ts        all GLSL
lib/renderer/gl.ts             context, programs, render targets, quad
lib/renderer/painter.ts        dab stamping + image drawing into a target
lib/renderer/surface.ts        LayerSurface: base image + strokes → texture, undo, replay, restore
lib/renderer/compositor.ts     ping-pong layer composite
lib/renderer/analyzer.ts       128² readback → centroid + color transfer
lib/renderer/renderer.ts       top-level: surfaces, analysis cache, frame(), context loss
lib/image/loadImage.ts         File → ImageBitmap ≤ 2048
```

---

### Task 0: Repo, scaffold, test runner

**Files:**
- Create: Next.js scaffold at repo root, `vitest.config.mts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Init git and scaffold Next.js**

`create-next-app` refuses a folder containing `README.md`, so move it aside first.

```bash
cd litt-09tt-9440cba
git init
mv README.md /tmp/09tt-README.md
npx create-next-app@latest . --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --yes
mv /tmp/09tt-README.md README.md
```

Expected: `app/`, `package.json` and `tsconfig.json` exist, and `docs/` is untouched.

- [ ] **Step 2: Add Vitest**

```bash
npm i -D vitest
npm pkg set scripts.test="vitest run" scripts.typecheck="tsc --noEmit"
```

Create `vitest.config.mts`:

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(fileURLToPath(new URL('.', import.meta.url))) } },
  test: { include: ['lib/**/*.test.ts'] },
})
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx vitest run --passWithNoTests`
Expected: no type errors; "No test files found" with exit 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

### Task 1: Document types and recipes

**Files:**
- Create: `lib/util/math.ts`, `lib/doc/types.ts`, `lib/doc/recipes.ts`
- Test: `lib/doc/recipes.test.ts`

- [ ] **Step 1: Write helpers and types**

`lib/util/math.ts`:

```ts
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const clamp01 = (v: number) => clamp(v, 0, 1)
```

`lib/doc/types.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing test**

`lib/doc/recipes.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/doc/recipes.test.ts`
Expected: FAIL, "Failed to resolve import ./recipes".

- [ ] **Step 4: Implement**

`lib/doc/recipes.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/doc/recipes.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/util lib/doc
git commit -m "feat(doc): layer types and validated motion recipes"
```

---

### Task 2: Painting reducer and playback clock

**Files:**
- Create: `lib/doc/painting.ts`
- Test: `lib/doc/painting.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/doc/painting.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/doc/painting.test.ts`
Expected: FAIL, "Failed to resolve import ./painting".

- [ ] **Step 3: Implement**

`lib/doc/painting.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/doc`
Expected: PASS (all doc tests).

- [ ] **Step 5: Commit**

```bash
git add lib/doc
git commit -m "feat(doc): painting reducer and playback clock"
```

---

### Task 3: Geometry — matrices, view, placement

**Files:**
- Create: `lib/geometry/mat3.ts`, `lib/geometry/view.ts`, `lib/geometry/place.ts`
- Test: `lib/geometry/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/geometry/geometry.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/geometry`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `lib/geometry/mat3.ts`**

```ts
/** 3×3 matrix, column-major (as uniformMatrix3fv expects). */
export type Mat3 = [number, number, number, number, number, number, number, number, number]
export interface Pt { x: number; y: number }

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
/** a_pos in [0,1]² → clip [-1,1]², no flip (render targets). */
export const FULLSCREEN: Mat3 = [2, 0, 0, 0, 2, 0, -1, -1, 1]

export function apply(m: Mat3, p: Pt): Pt {
  return { x: m[0] * p.x + m[3] * p.y + m[6], y: m[1] * p.x + m[4] * p.y + m[7] }
}

export function translate(tx: number, ty: number): Mat3 {
  return [1, 0, 0, 0, 1, 0, tx, ty, 1]
}

/** Sampling matrix: content grows by s around c. */
export function scaleAbout(c: Pt, s: number): Mat3 {
  const k = 1 / s
  return [k, 0, 0, 0, k, 0, c.x - c.x * k, c.y - c.y * k, 1]
}

/** Sampling matrix: content rotates by a (radians) around c. */
export function rotateAbout(c: Pt, a: number): Mat3 {
  const cos = Math.cos(a), sin = Math.sin(a)
  return [cos, -sin, 0, sin, cos, 0, c.x - (cos * c.x + sin * c.y), c.y - (-sin * c.x + cos * c.y), 1]
}
```

- [ ] **Step 4: Implement `lib/geometry/view.ts`**

```ts
import { clamp } from '@/lib/util/math'
import type { Mat3, Pt } from './mat3'

export type { Pt }
export interface View { zoom: number; panX: number; panY: number }
export interface Viewport { width: number; height: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const DEFAULT_VIEW: View = { zoom: 1, panX: 0, panY: 0 }
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8

export function viewScale(vp: Viewport, size: number, view: View): number {
  return (Math.min(vp.width, vp.height) / size) * view.zoom
}

export function paintingToScreen(p: Pt, vp: Viewport, size: number, view: View): Pt {
  const s = viewScale(vp, size, view)
  return { x: vp.width / 2 + (p.x - size / 2) * s + view.panX, y: vp.height / 2 + (p.y - size / 2) * s + view.panY }
}

export function screenToPainting(p: Pt, vp: Viewport, size: number, view: View): Pt {
  const s = viewScale(vp, size, view)
  return { x: (p.x - vp.width / 2 - view.panX) / s + size / 2, y: (p.y - vp.height / 2 - view.panY) / s + size / 2 }
}

export function paintingRect(vp: Viewport, size: number, view: View): Rect {
  const tl = paintingToScreen({ x: 0, y: 0 }, vp, size, view)
  const s = viewScale(vp, size, view) * size
  return { x: tl.x, y: tl.y, w: s, h: s }
}

export function panView(view: View, dx: number, dy: number): View {
  return { ...view, panX: view.panX + dx, panY: view.panY + dy }
}

/** Keeps the painting point under the previous finger midpoint under the new midpoint. */
export function pinchView(view: View, vp: Viewport, size: number, prev: [Pt, Pt], next: [Pt, Pt]): View {
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
  const anchor = screenToPainting(mid(...prev), vp, size, view)
  const nm = mid(...next)
  const zoom = clamp(view.zoom * (dist(...next) / Math.max(1, dist(...prev))), MIN_ZOOM, MAX_ZOOM)
  const s = (Math.min(vp.width, vp.height) / size) * zoom
  return {
    zoom,
    panX: nm.x - vp.width / 2 - (anchor.x - size / 2) * s,
    panY: nm.y - vp.height / 2 - (anchor.y - size / 2) * s,
  }
}

/** a_pos in [0,1]² → clip for a rect given in CSS px of the viewport (y flipped for the screen). */
export function rectToClip(r: Rect, vp: Viewport): Mat3 {
  return [
    (2 * r.w) / vp.width, 0, 0,
    0, (-2 * r.h) / vp.height, 0,
    (2 * r.x) / vp.width - 1, 1 - (2 * r.y) / vp.height, 1,
  ]
}
```

- [ ] **Step 5: Implement `lib/geometry/place.ts`**

```ts
import type { Placement } from '@/lib/doc/types'
import type { Mat3, Pt } from './mat3'
import type { Rect } from './view'

export type { Rect }

export function layerToPainting(p: Pt, place: Placement, size: number): Pt {
  return { x: (p.x - size / 2) * place.scale + size / 2 + place.x, y: (p.y - size / 2) * place.scale + size / 2 + place.y }
}

export function paintingToLayer(p: Pt, place: Placement, size: number): Pt {
  return { x: (p.x - size / 2 - place.x) / place.scale + size / 2, y: (p.y - size / 2 - place.y) / place.scale + size / 2 }
}

/** Shader form: (x/size, y/size, scale). Matches toLayer() in shaders.ts. */
export function placeUniform(place: Placement, size: number): [number, number, number] {
  return [place.x / size, place.y / size, place.scale]
}

/** Fit an image inside `frac` of the canvas, centered. */
export function fitContain(w: number, h: number, size: number, frac = 0.8): Rect {
  const s = Math.min((size * frac) / w, (size * frac) / h)
  const rw = w * s, rh = h * s
  return { x: (size - rw) / 2, y: (size - rh) / 2, w: rw, h: rh }
}

/** a_pos in [0,1]² → clip for a rect in target px (row 0 = top, no flip). */
export function rectToTargetClip(r: Rect, size: number): Mat3 {
  return [(2 * r.w) / size, 0, 0, 0, (2 * r.h) / size, 0, (2 * r.x) / size - 1, (2 * r.y) / size - 1, 1]
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/geometry`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/geometry
git commit -m "feat(geometry): view, pinch, placement and clip matrices"
```

---

### Task 4: Brush stamps and pointer rules

**Files:**
- Create: `lib/brush/stamps.ts`, `lib/input/pointers.ts`
- Test: `lib/brush/stamps.test.ts`, `lib/input/pointers.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/brush/stamps.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizePressure, radiusAt, stampSegment, stampStroke } from './stamps'

const pt = (x: number, pressure = 1) => ({ x, y: 0, pressure })

describe('pressure', () => {
  it('uses pen pressure, full pressure otherwise', () => {
    expect(normalizePressure('pen', 0.4)).toBe(0.4)
    expect(normalizePressure('pen', 0)).toBe(1)
    expect(normalizePressure('touch', 0.5)).toBe(1)
    expect(normalizePressure('mouse', 0.5)).toBe(1)
  })
  it('scales radius', () => {
    expect(radiusAt(20, 1)).toBe(10)
    expect(radiusAt(20, 0.5)).toBeCloseTo(6, 6)
  })
})

describe('stampStroke', () => {
  it('a tap is one dab', () => {
    const d = stampStroke([pt(5)], 20, 1)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ x: 5, y: 0, radius: 10 })
  })
  it('evenly spaces dabs (spacing = 12% of size)', () => {
    const d = stampStroke([pt(0), pt(100)], 20, 1)
    expect(d).toHaveLength(42)
    expect(d[1].x - d[0].x).toBeCloseTo(2.4, 6)
  })
  it('carries spacing across segments', () => {
    expect(stampStroke([pt(0), pt(50), pt(100)], 20, 1)).toHaveLength(42)
  })
  it('matches incremental stamping (live drawing == replay)', () => {
    const pts = [pt(0), pt(13, 0.3), pt(40, 0.9), pt(41), pt(90, 0.5)]
    let r = stampSegment(pts[0], pts[0], 16, 0.6, 0)
    const live = [...r.dabs]
    for (let i = 1; i < pts.length; i++) {
      r = stampSegment(pts[i - 1], pts[i], 16, 0.6, r.carry)
      live.push(...r.dabs)
    }
    expect(stampStroke(pts, 16, 0.6)).toEqual(live)
  })
  it('lower opacity means lower per-dab alpha', () => {
    expect(stampStroke([pt(0)], 20, 0.3)[0].alpha).toBeLessThan(stampStroke([pt(0)], 20, 1)[0].alpha)
  })
})
```

`lib/input/pointers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { modeOnDown } from './pointers'

describe('modeOnDown', () => {
  it('pen and mouse start the tool', () => {
    expect(modeOnDown({ mode: 'idle', penSeen: true, touchCount: 0 }, 'pen')).toEqual({ mode: 'tool', cancelStroke: false })
    expect(modeOnDown({ mode: 'idle', penSeen: false, touchCount: 0 }, 'mouse')).toEqual({ mode: 'tool', cancelStroke: false })
  })
  it('a finger paints until a pencil has been seen', () => {
    expect(modeOnDown({ mode: 'idle', penSeen: false, touchCount: 1 }, 'touch').mode).toBe('tool')
    expect(modeOnDown({ mode: 'idle', penSeen: true, touchCount: 1 }, 'touch').mode).toBe('idle')
  })
  it('second finger turns a finger stroke into a gesture and cancels it', () => {
    expect(modeOnDown({ mode: 'tool', penSeen: false, touchCount: 2 }, 'touch')).toEqual({ mode: 'gesture', cancelStroke: true })
  })
  it('palm touches never interrupt a pencil stroke', () => {
    expect(modeOnDown({ mode: 'tool', penSeen: true, touchCount: 2 }, 'touch')).toEqual({ mode: 'tool', cancelStroke: false })
  })
  it('two fingers with no stroke is a gesture', () => {
    expect(modeOnDown({ mode: 'idle', penSeen: true, touchCount: 2 }, 'touch').mode).toBe('gesture')
  })
  it('pen during a gesture does not start painting', () => {
    expect(modeOnDown({ mode: 'gesture', penSeen: true, touchCount: 2 }, 'pen').mode).toBe('gesture')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/brush lib/input`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `lib/brush/stamps.ts`**

```ts
export interface StrokePoint { x: number; y: number; pressure: number }
export interface Dab { x: number; y: number; radius: number; alpha: number }

export function normalizePressure(pointerType: string, pressure: number): number {
  return pointerType === 'pen' && pressure > 0 ? Math.min(1, pressure) : 1
}

export function radiusAt(size: number, pressure: number): number {
  return Math.max(0.5, (size / 2) * (0.2 + 0.8 * pressure))
}

export function spacingFor(size: number): number {
  return Math.max(0.5, size * 0.12)
}

/** Per-dab alpha so a straight stroke lands near `opacity` despite overlapping dabs. */
export function dabAlpha(opacity: number, step: number, radius: number): number {
  const o = Math.min(Math.max(opacity, 0), 0.999)
  return 1 - Math.pow(1 - o, Math.min(1, step / (2 * radius)))
}

/** Dabs from a to b. `carry` = distance along the segment where the next dab goes. */
export function stampSegment(a: StrokePoint, b: StrokePoint, size: number, opacity: number, carry: number): { dabs: Dab[]; carry: number } {
  const step = spacingFor(size)
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const dabs: Dab[] = []
  let d = carry
  while (d <= len) {
    const t = len === 0 ? 0 : d / len
    const radius = radiusAt(size, a.pressure + (b.pressure - a.pressure) * t)
    dabs.push({ x: a.x + dx * t, y: a.y + dy * t, radius, alpha: dabAlpha(opacity, step, radius) })
    d += step
  }
  return { dabs, carry: d - len }
}

/** Same dabs as live drawing (begin = segment(p0, p0), then each segment with carry). */
export function stampStroke(points: StrokePoint[], size: number, opacity: number): Dab[] {
  if (points.length === 0) return []
  let r = stampSegment(points[0], points[0], size, opacity, 0)
  const out = [...r.dabs]
  for (let i = 1; i < points.length; i++) {
    r = stampSegment(points[i - 1], points[i], size, opacity, r.carry)
    out.push(...r.dabs)
  }
  return out
}
```

- [ ] **Step 4: Implement `lib/input/pointers.ts`**

```ts
export type Mode = 'idle' | 'tool' | 'gesture'

/**
 * Decide the interaction mode when a pointer goes down.
 * touchCount includes the new pointer. Once a pencil has been seen, lone
 * touches are treated as palms and ignored; two fingers still pinch/pan.
 */
export function modeOnDown(s: { mode: Mode; penSeen: boolean; touchCount: number }, pointerType: string): { mode: Mode; cancelStroke: boolean } {
  if (pointerType !== 'touch') return { mode: s.mode === 'idle' ? 'tool' : s.mode, cancelStroke: false }
  if (s.touchCount >= 2) {
    if (s.penSeen && s.mode === 'tool') return { mode: 'tool', cancelStroke: false }
    return { mode: 'gesture', cancelStroke: s.mode === 'tool' }
  }
  if (s.penSeen) return { mode: s.mode, cancelStroke: false }
  return { mode: s.mode === 'idle' ? 'tool' : s.mode, cancelStroke: false }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/brush lib/input`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/brush lib/input
git commit -m "feat(input): brush dab spacing and pencil/palm pointer rules"
```

---

### Task 5: Color — hex, Lab, blend-in statistics

**Files:**
- Create: `lib/color/hex.ts`, `lib/color/lab.ts`, `lib/harmonize/stats.ts`
- Test: `lib/color/color.test.ts`, `lib/harmonize/stats.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/color/color.test.ts`:

```ts
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
```

`lib/harmonize/stats.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/color lib/harmonize`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `lib/color/hex.ts`**

```ts
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`Bad color: ${hex}`)
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
```

- [ ] **Step 4: Implement `lib/color/lab.ts`**

```ts
import { clamp01 } from '@/lib/util/math'

export type Vec3 = [number, number, number]

// D65 white; constants must match LAB in lib/renderer/shaders.ts
const XN = 0.95047, YN = 1.0, ZN = 1.08883
const EPS = 216 / 24389
const KAPPA = 24389 / 27

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116)
const fInv = (t: number) => (t * t * t > EPS ? t * t * t : (116 * t - 16) / KAPPA)

export function rgbToLab([r, g, b]: Vec3): Vec3 {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b)
  const fx = f((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN)
  const fy = f((0.2126729 * R + 0.7151522 * G + 0.072175 * B) / YN)
  const fz = f((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / ZN)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function labToRgb([L, a, b]: Vec3): Vec3 {
  const fy = (L + 16) / 116
  const x = fInv(fy + a / 500) * XN, y = fInv(fy) * YN, z = fInv(fy - b / 200) * ZN
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z
  return [toSrgb(clamp01(R)), toSrgb(clamp01(G)), toSrgb(clamp01(B))]
}
```

- [ ] **Step 5: Implement `lib/harmonize/stats.ts`**

```ts
import { rgbToLab, type Vec3 } from '@/lib/color/lab'
import { clamp } from '@/lib/util/math'

export interface LabStats { mean: Vec3; std: Vec3; weight: number }
/** Shader applies: lab' = (lab - srcMean) * scale + dstMean */
export interface ColorTransfer { srcMean: Vec3; scale: Vec3; dstMean: Vec3 }

/** ≈ 8 fully opaque pixels of a 128² readback */
const MIN_WEIGHT = 8

/** Weighted Lab mean/std of premultiplied RGBA8 pixels. */
export function labStats(px: ArrayLike<number>, weight: (i: number) => number): LabStats {
  const n = px.length / 4
  let total = 0
  const s: Vec3 = [0, 0, 0], s2: Vec3 = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3]
    const w = weight(i)
    if (w <= 0 || a === 0) continue
    const lab = rgbToLab([Math.min(1, px[i * 4] / a), Math.min(1, px[i * 4 + 1] / a), Math.min(1, px[i * 4 + 2] / a)])
    total += w
    for (let k = 0; k < 3; k++) {
      s[k] += w * lab[k]
      s2[k] += w * lab[k] * lab[k]
    }
  }
  if (total === 0) return { mean: [0, 0, 0], std: [0, 0, 0], weight: 0 }
  const mean = s.map(v => v / total) as Vec3
  const std = s2.map((v, k) => Math.sqrt(Math.max(0, v / total - mean[k] * mean[k]))) as Vec3
  return { mean, std, weight: total }
}

/** Reinhard transfer from the layer's colors toward the backdrop under the layer's footprint. */
export function colorTransfer(layer: ArrayLike<number>, below: ArrayLike<number>): ColorTransfer | null {
  const footprint = (i: number) => layer[i * 4 + 3] / 255
  const src = labStats(layer, footprint)
  const dst = labStats(below, footprint)
  if (src.weight < MIN_WEIGHT || dst.weight < MIN_WEIGHT) return null
  const scale = src.std.map((s, k) => clamp(Math.max(dst.std[k], 1) / Math.max(s, 1), 0.4, 2.5)) as Vec3
  return { srcMean: src.mean, scale, dstMean: dst.mean }
}

/** Alpha-weighted center in uv (0–1), rows top-down. */
export function alphaCentroid(px: ArrayLike<number>, w: number, h: number): { x: number; y: number } | null {
  let sum = 0, sx = 0, sy = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3]
      if (!a) continue
      sum += a
      sx += a * (x + 0.5)
      sy += a * (y + 0.5)
    }
  }
  return sum === 0 ? null : { x: sx / sum / w, y: sy / sum / h }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/color lib/harmonize`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/color lib/harmonize
git commit -m "feat(harmonize): Lab conversion, color transfer and alpha centroid"
```

---

### Task 6: Motion math and analysis cache key

**Files:**
- Create: `lib/renderer/motion.ts`, `lib/renderer/analysisKey.ts`
- Test: `lib/renderer/motion.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/renderer/motion.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/renderer`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `lib/renderer/motion.ts`**

```ts
import { FLOW_RECIPES, type Flow, type Transform } from '@/lib/doc/types'
import { IDENTITY, rotateAbout, scaleAbout, translate, type Mat3, type Pt } from '@/lib/geometry/mat3'
import { clamp01 } from '@/lib/util/math'

export function dirVector(deg: number): Pt {
  const r = (deg * Math.PI) / 180
  return { x: Math.cos(r), y: -Math.sin(r) }
}

/** Matrix maps output painting uv → sample uv. `centroid` is in painting uv. */
export function transformAt(tr: Transform, t: number, centroid: Pt, baseOpacity: number): { matrix: Mat3; opacity: number } {
  const k = tr.intensity
  const w = t * tr.speed
  switch (tr.recipe) {
    case 'drift': {
      const d = dirVector(tr.direction)
      const amt = 0.08 * k * Math.sin(w * 0.6)
      return { matrix: translate(-d.x * amt, -d.y * amt), opacity: baseOpacity }
    }
    case 'pulse':
      return { matrix: scaleAbout(centroid, 1 + 0.12 * k * Math.sin(w * 2)), opacity: baseOpacity }
    case 'turn':
      return { matrix: rotateAbout(centroid, w * 0.3 * (0.25 + k)), opacity: baseOpacity }
    case 'breathe':
      return { matrix: IDENTITY, opacity: clamp01(baseOpacity * (1 + 0.6 * k * Math.sin(w * 1.5))) }
    default:
      return { matrix: IDENTITY, opacity: baseOpacity }
  }
}

export interface FlowUniforms {
  kind: number
  speed: number
  intensity: number
  dir: [number, number]
  seed: [number, number]
  origin: [number, number]
}

export function flowUniforms(f: Flow): FlowUniforms {
  const d = dirVector(f.direction)
  return {
    kind: FLOW_RECIPES.indexOf(f.recipe),
    speed: f.speed,
    intensity: f.intensity,
    dir: [d.x, d.y],
    // keep noise offsets small so GLSL float precision holds
    seed: [f.seed % 997, (f.seed * 7) % 991],
    origin: [f.originX, f.originY],
  }
}
```

- [ ] **Step 4: Implement `lib/renderer/analysisKey.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add lib/renderer
git commit -m "feat(renderer): transform/flow recipe math and analysis cache key"
```

---

### Task 7: Shaders

**Files:**
- Create: `lib/renderer/shaders.ts`

There are no unit tests for GLSL. It's verified by compiling in the browser (Task 12) and by eye (Task 16).

- [ ] **Step 1: Write `lib/renderer/shaders.ts`**

```ts
// All GLSL. Flow indices match FLOW_RECIPES; blend indices match BLEND_MODES.
// Look-tuning (Task 16) only edits numeric constants in this file.

export const QUAD_VS = `#version 300 es
in vec2 a_pos;
uniform mat3 u_toClip;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  vec3 p = u_toClip * vec3(a_pos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}`

export const STAMP_VS = `#version 300 es
in vec2 a_pos;
in vec4 a_dab; // x, y (layer px), radius, alpha
uniform float u_size;
out vec2 v_local;
out float v_alpha;
void main() {
  float pad = a_dab.z + 1.0;
  v_local = a_pos * pad / a_dab.z;
  v_alpha = a_dab.w;
  vec2 p = a_dab.xy + a_pos * pad;
  gl_Position = vec4(p / u_size * 2.0 - 1.0, 0.0, 1.0);
}`

export const STAMP_FS = `#version 300 es
precision highp float;
in vec2 v_local;
in float v_alpha;
uniform vec3 u_color;
out vec4 o;
void main() {
  float a = (1.0 - smoothstep(0.7, 1.0, length(v_local))) * v_alpha;
  o = vec4(u_color * a, a);
}`

export const IMAGE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main() { o = texture(u_tex, v_uv); }`

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
vec2 curl(vec2 p) {
  const float e = 0.02;
  float dy = fbm(p + vec2(0.0, e)) - fbm(p - vec2(0.0, e));
  float dx = fbm(p + vec2(e, 0.0)) - fbm(p - vec2(e, 0.0));
  return vec2(dy, -dx) / (2.0 * e);
}`

// Constants must match lib/color/lab.ts
const LAB = `
const vec3 WHITE = vec3(0.95047, 1.0, 1.08883);
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 labF(vec3 t) { return mix((24389.0 / 27.0 * t + 16.0) / 116.0, pow(t, vec3(1.0 / 3.0)), step(216.0 / 24389.0, t)); }
vec3 labFInv(vec3 t) { vec3 t3 = t * t * t; return mix((116.0 * t - 16.0) / (24389.0 / 27.0), t3, step(216.0 / 24389.0, t3)); }
vec3 rgb2lab(vec3 c) {
  vec3 xyz = mat3(0.4124564, 0.2126729, 0.0193339,
                  0.3575761, 0.7151522, 0.1191920,
                  0.1804375, 0.0721750, 0.9503041) * toLin(c) / WHITE;
  vec3 f = labF(xyz);
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}
vec3 lab2rgb(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  vec3 xyz = labFInv(vec3(fy + lab.y / 500.0, fy, fy - lab.z / 200.0)) * WHITE;
  vec3 l = mat3(3.2404542, -0.9692660, 0.0556434,
                -1.5371385, 1.8760108, -0.2040259,
                -0.4985314, 0.0415560, 1.0572252) * xyz;
  return toSrgb(clamp(l, 0.0, 1.0));
}`

// Sample outside the conditional so mip selection has valid derivatives.
const LAYER_SAMPLING = `
uniform sampler2D u_layer;
uniform vec3 u_place; // x/S, y/S, scale
vec2 toLayer(vec2 puv) { return (puv - 0.5 - u_place.xy) / u_place.z + 0.5; }
bool inside(vec2 l) { return l.x >= 0.0 && l.y >= 0.0 && l.x <= 1.0 && l.y <= 1.0; }
vec4 layerAt(vec2 l) { vec4 c = texture(u_layer, l); return inside(l) ? c : vec4(0.0); }
float softA(vec2 l, float lod) { float a = textureLod(u_layer, l, lod).a; return inside(l) ? a : 0.0; }`

const FLOWS = `
vec4 smoke(vec2 l, float t, float k) {
  vec2 q = l * 3.0 + u_seed + vec2(0.0, -t * 0.08);
  vec2 d = curl(q) * 0.012 * k + u_dir * k * 0.02 * sin(t * 0.3);
  vec4 c = vec4(0.0);
  for (int i = 0; i < 4; i++) c += layerAt(l - d * (1.0 + float(i) * 0.6));
  return c * 0.25;
}
vec4 melt(vec2 l, float t, float k) {
  vec2 perp = vec2(-u_dir.y, u_dir.x);
  float n = fbm(vec2(dot(l, perp) * 14.0, 0.0) + u_seed);
  float drip = pow(n, 3.0) * k * 0.18 * (0.55 + 0.45 * sin(t * 0.5 + n * 6.2831));
  vec4 c = vec4(0.0);
  for (int i = 0; i < 6; i++) c += layerAt(l - u_dir * drip * float(i) / 5.0);
  return c / 6.0;
}
vec4 streaks(vec2 l, float t, float k) {
  vec2 perp = vec2(-u_dir.y, u_dir.x);
  float band = noise(vec2(dot(l, perp) * 180.0, t * 0.4) + u_seed);
  float len = k * 0.22 * (0.25 + 0.75 * band);
  vec4 c = vec4(0.0);
  for (int i = 0; i < 12; i++) c += layerAt(l - u_dir * len * float(i) / 11.0);
  return c / 12.0;
}
vec4 shimmer(vec2 l, float t, float k) {
  vec2 d = vec2(noise(l * 40.0 + u_seed + t * 1.5), noise(l * 40.0 + u_seed.yx - t * 1.5)) - 0.5;
  return layerAt(l + d * 0.012 * k);
}
// Forward travel toward u_origin: two zoom phases cross-fade so the loop never jumps.
vec4 rush(vec2 l, float t, float k) {
  vec2 o = toLayer(u_origin);
  vec2 d = l - o;
  float r = length(d) + 1e-4;
  vec2 radial = d / r;
  float phase = fract(t * 0.12);
  vec4 acc = vec4(0.0);
  for (int ph = 0; ph < 2; ph++) {
    float f = fract(phase + float(ph) * 0.5);
    float w = 1.0 - abs(2.0 * f - 1.0);
    float zoom = exp(f * (0.2 + 0.5 * k));
    vec2 base = o + d / zoom;
    float cell = noise(radial * 9.0 + vec2(log(r) * 7.0 - f * 5.0) + u_seed + float(ph) * 17.0);
    float smear = k * 0.07 * r * (0.25 + cell);
    vec4 c = vec4(0.0);
    for (int i = 0; i < 8; i++) c += layerAt(base - radial * smear * float(i) / 7.0);
    acc += w * c / 8.0;
  }
  return acc;
}
vec4 flowSample(vec2 l) {
  float t = u_time * u_flow.x;
  float k = u_flow.y;
  if (u_flowKind == 1) return smoke(l, t, k);
  if (u_flowKind == 2) return melt(l, t, k);
  if (u_flowKind == 3) return streaks(l, t, k);
  if (u_flowKind == 4) return shimmer(l, t, k);
  if (u_flowKind == 5) return rush(l, t, k);
  return layerAt(l);
}`

// W3C separable blend modes; backdrop b is opaque, s is straight color.
const BLEND = `
vec3 blendFn(vec3 b, vec3 s) {
  if (u_blend == 1) return b * s;
  if (u_blend == 2) return b + s - b * s;
  if (u_blend == 3) return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  if (u_blend == 4) {
    vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
    return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
  }
  if (u_blend == 5) return min(b, s);
  if (u_blend == 6) return max(b, s);
  return s;
}`

export const LAYER_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_below;
uniform float u_time;
uniform float u_opacity;
uniform mat3 u_xform;
uniform int u_blend;
uniform int u_flowKind;
uniform vec2 u_flow; // speed, intensity
uniform vec2 u_dir;
uniform vec2 u_seed;
uniform vec2 u_origin; // painting uv
uniform float u_featherOn;
uniform float u_featherLod;
uniform float u_bleed;
uniform float u_match;
uniform vec3 u_srcMean;
uniform vec3 u_labScale;
uniform vec3 u_dstMean;
${NOISE}
${LAB}
${LAYER_SAMPLING}
${FLOWS}
${BLEND}
void main() {
  vec2 puv = (u_xform * vec3(v_uv, 1.0)).xy;
  vec2 l = toLayer(puv);
  if (u_bleed > 0.0) {
    float edge = 1.0 - smoothstep(0.55, 0.95, softA(l, max(u_featherLod, 3.0) + 1.0));
    vec2 w = vec2(noise(l * 55.0 + u_seed + u_time * 0.15), noise(l * 55.0 + u_seed.yx - u_time * 0.15)) - 0.5;
    l += w * edge * u_bleed * 0.035;
  }
  vec4 c = flowSample(l);
  if (u_featherOn > 0.5) c *= smoothstep(0.3, 0.9, softA(l, u_featherLod));
  if (u_match > 0.0 && c.a > 0.002) {
    vec3 rgb = min(c.rgb / c.a, vec3(1.0));
    vec3 moved = lab2rgb((rgb2lab(rgb) - u_srcMean) * u_labScale + u_dstMean);
    c.rgb = mix(rgb, moved, u_match) * c.a;
  }
  c *= u_opacity;
  vec3 b = texture(u_below, v_uv).rgb;
  vec3 s = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
  o = vec4(mix(b, blendFn(b, s), c.a), 1.0);
}`

export const PLACE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
${LAYER_SAMPLING}
void main() { o = layerAt(toLayer(v_uv)); }`

export const SCREEN_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;
uniform float u_grain;
uniform float u_time;
${NOISE}
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float g = hash(floor(v_uv * 2048.0) + floor(u_time * 12.0) * vec2(7.0, 3.0)) - 0.5;
  o = vec4(clamp(c + g * u_grain * 0.16, 0.0, 1.0), 1.0);
}`
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/renderer/shaders.ts
git commit -m "feat(renderer): GLSL for stamping, flows, blend-in, blend modes, grain"
```

---

### Task 8: GL core and painter

**Files:**
- Create: `lib/renderer/gl.ts`, `lib/renderer/painter.ts`

- [ ] **Step 1: Write `lib/renderer/gl.ts`**

```ts
export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false })
  if (!gl) throw new Error('WebGL2 is not available in this browser')
  return gl
}

export interface Program {
  prog: WebGLProgram
  u: (name: string) => WebGLUniformLocation | null
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader compile failed')
  return s
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const prog = gl.createProgram()!
  const v = compileShader(gl, gl.VERTEX_SHADER, vs)
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(prog, v)
  gl.attachShader(prog, f)
  gl.bindAttribLocation(prog, 0, 'a_pos')
  gl.bindAttribLocation(prog, 1, 'a_dab')
  gl.linkProgram(prog)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Program link failed')
  const cache = new Map<string, WebGLUniformLocation | null>()
  return {
    prog,
    u: name => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name))
      return cache.get(name)!
    },
  }
}

export interface Target { tex: WebGLTexture; fbo: WebGLFramebuffer; size: number; mips: boolean }

export function createTarget(gl: WebGL2RenderingContext, size: number, mips = false): Target {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texStorage2D(gl.TEXTURE_2D, mips ? Math.floor(Math.log2(size)) + 1 : 1, gl.RGBA8, size, size)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.viewport(0, 0, size, size)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { tex, fbo, size, mips }
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target) {
  gl.deleteFramebuffer(t.fbo)
  gl.deleteTexture(t.tex)
}

/** Bind a render target, or the screen when t is null. */
export function bindTarget(gl: WebGL2RenderingContext, t: Target | null, width = 0, height = 0) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null)
  gl.viewport(0, 0, t ? t.size : width, t ? t.size : height)
}

/** Triangle strip over [0,1]² at attribute 0. */
export function createQuad(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return vao
}
```

- [ ] **Step 2: Write `lib/renderer/painter.ts`**

```ts
import type { Dab } from '@/lib/brush/stamps'
import { rectToTargetClip, type Rect } from '@/lib/geometry/place'
import { bindTarget, createProgram, type Program, type Target } from './gl'
import { IMAGE_FS, QUAD_VS, STAMP_FS, STAMP_VS } from './shaders'

/** Draws dabs and images into layer targets. */
export class Painter {
  private stampProg: Program
  private imageProg: Program
  private dabVao: WebGLVertexArrayObject
  private dabBuf: WebGLBuffer

  constructor(private gl: WebGL2RenderingContext, private quad: WebGLVertexArrayObject) {
    this.stampProg = createProgram(gl, STAMP_VS, STAMP_FS)
    this.imageProg = createProgram(gl, QUAD_VS, IMAGE_FS)
    this.dabVao = gl.createVertexArray()!
    gl.bindVertexArray(this.dabVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.dabBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuf)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(1, 1)
    gl.bindVertexArray(null)
  }

  stamp(target: Target, dabs: Dab[], rgb: [number, number, number], erase: boolean) {
    if (dabs.length === 0) return
    const { gl } = this
    const data = new Float32Array(dabs.length * 4)
    dabs.forEach((d, i) => data.set([d.x, d.y, d.radius, d.alpha], i * 4))
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW)
    bindTarget(gl, target)
    gl.useProgram(this.stampProg.prog)
    gl.uniform1f(this.stampProg.u('u_size'), target.size)
    gl.uniform3fv(this.stampProg.u('u_color'), rgb)
    gl.enable(gl.BLEND)
    if (erase) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA)
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindVertexArray(this.dabVao)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, dabs.length)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  uploadImage(bitmap: ImageBitmap): WebGLTexture {
    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  image(target: Target, tex: WebGLTexture, rect: Rect) {
    const { gl } = this
    bindTarget(gl, target)
    gl.useProgram(this.imageProg.prog)
    gl.uniformMatrix3fv(this.imageProg.u('u_toClip'), false, rectToTargetClip(rect, target.size))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(this.imageProg.u('u_tex'), 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindVertexArray(this.quad)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(null)
  }

  dispose() {
    this.gl.deleteProgram(this.stampProg.prog)
    this.gl.deleteProgram(this.imageProg.prog)
    this.gl.deleteBuffer(this.dabBuf)
    this.gl.deleteVertexArray(this.dabVao)
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/renderer/gl.ts lib/renderer/painter.ts
git commit -m "feat(renderer): GL helpers and dab/image painter"
```

---

### Task 9: Layer surface (pixels, undo, replay, restore)

**Files:**
- Create: `lib/renderer/surface.ts`

- [ ] **Step 1: Write `lib/renderer/surface.ts`**

```ts
import { stampSegment, stampStroke, type StrokePoint } from '@/lib/brush/stamps'
import { hexToRgb } from '@/lib/color/hex'
import type { Rect } from '@/lib/geometry/place'
import { createTarget, deleteTarget, type Target } from './gl'
import type { Painter } from './painter'

export interface Stroke { color: string; size: number; opacity: number; erase: boolean; points: StrokePoint[] }
export type StrokeStyle = Omit<Stroke, 'points'>

/**
 * One layer's pixels, rebuilt from an optional image base plus a stroke list.
 * Plan 2 replaces `base` with the baked snapshot and keeps the same replay rule.
 */
export class LayerSurface {
  target: Target
  base: { bitmap: ImageBitmap; rect: Rect; tex: WebGLTexture | null } | null = null
  strokes: Stroke[] = []
  version = 0
  mipDirty = true
  private live: { stroke: Stroke; carry: number } | null = null

  constructor(private gl: WebGL2RenderingContext, private painter: Painter, readonly size: number) {
    this.target = createTarget(gl, size, true)
  }

  get drawing() {
    return this.live !== null
  }

  setBase(bitmap: ImageBitmap, rect: Rect) {
    if (this.base?.tex) this.gl.deleteTexture(this.base.tex)
    this.base = { bitmap, rect, tex: null }
    this.replay()
  }

  begin(style: StrokeStyle, p: StrokePoint) {
    const r = stampSegment(p, p, style.size, style.opacity, 0)
    this.painter.stamp(this.target, r.dabs, hexToRgb(style.color), style.erase)
    this.live = { stroke: { ...style, points: [p] }, carry: r.carry }
    this.touch()
  }

  extend(p: StrokePoint) {
    if (!this.live) return
    const { stroke } = this.live
    const prev = stroke.points[stroke.points.length - 1]
    const r = stampSegment(prev, p, stroke.size, stroke.opacity, this.live.carry)
    this.painter.stamp(this.target, r.dabs, hexToRgb(stroke.color), stroke.erase)
    stroke.points.push(p)
    this.live.carry = r.carry
    this.touch()
  }

  commit(): Stroke | null {
    const stroke = this.live?.stroke ?? null
    this.live = null
    if (stroke) this.strokes.push(stroke)
    return stroke
  }

  cancel() {
    if (!this.live) return
    this.live = null
    this.replay()
  }

  undo(): boolean {
    if (this.live || this.strokes.length === 0) return false
    this.strokes.pop()
    this.replay()
    return true
  }

  replay() {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo)
    gl.viewport(0, 0, this.size, this.size)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (this.base) {
      this.base.tex ??= this.painter.uploadImage(this.base.bitmap)
      this.painter.image(this.target, this.base.tex, this.base.rect)
    }
    for (const s of this.strokes) this.painter.stamp(this.target, stampStroke(s.points, s.size, s.opacity), hexToRgb(s.color), s.erase)
    this.touch()
  }

  ensureMips() {
    if (!this.mipDirty) return
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.target.tex)
    this.gl.generateMipmap(this.gl.TEXTURE_2D)
    this.mipDirty = false
  }

  /** After WebGL context loss: new GPU objects, same base + strokes. */
  restore(painter: Painter) {
    this.painter = painter
    this.target = createTarget(this.gl, this.size, true)
    if (this.base) this.base.tex = null
    this.live = null
    this.replay()
  }

  dispose() {
    deleteTarget(this.gl, this.target)
    if (this.base?.tex) this.gl.deleteTexture(this.base.tex)
  }

  private touch() {
    this.version++
    this.mipDirty = true
  }
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add lib/renderer/surface.ts
git commit -m "feat(renderer): layer surface with live strokes, undo and replay"
```

---

### Task 10: Compositor and analyzer

**Files:**
- Create: `lib/renderer/compositor.ts`, `lib/renderer/analyzer.ts`

- [ ] **Step 1: Write `lib/renderer/compositor.ts`**

```ts
import { BLEND_MODES, PAINTING_SIZE, type Layer } from '@/lib/doc/types'
import { FULLSCREEN, IDENTITY, type Pt } from '@/lib/geometry/mat3'
import { placeUniform } from '@/lib/geometry/place'
import type { ColorTransfer } from '@/lib/harmonize/stats'
import { bindTarget, createTarget, deleteTarget, type Program, type Target } from './gl'
import { flowUniforms, transformAt } from './motion'
import type { LayerSurface } from './surface'

export interface Analysis { centroid: Pt; transfer: ColorTransfer | null }
export interface LayerDraw { layer: Layer; surface: LayerSurface; analysis: Analysis | null }
export interface CompositeOptions {
  time: number
  background: [number, number, number]
  /** no motion, no bleed, no color match — used for analysis backdrops */
  still: boolean
}

/** Composites layers bottom→top, ping-ponging between two targets. */
export class Compositor {
  private targets: [Target, Target]

  constructor(private gl: WebGL2RenderingContext, private quad: WebGLVertexArrayObject, private prog: Program, readonly size: number, mips: boolean) {
    this.targets = [createTarget(gl, size, mips), createTarget(gl, size, mips)]
  }

  render(draws: LayerDraw[], o: CompositeOptions): Target {
    const { gl, prog } = this
    let [src, dst] = this.targets
    bindTarget(gl, src)
    gl.clearColor(o.background[0], o.background[1], o.background[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(prog.prog)
    gl.bindVertexArray(this.quad)
    gl.uniformMatrix3fv(prog.u('u_toClip'), false, FULLSCREEN)
    gl.uniform1i(prog.u('u_below'), 0)
    gl.uniform1i(prog.u('u_layer'), 1)
    gl.uniform1f(prog.u('u_time'), o.time)

    for (const { layer, surface, analysis } of draws) {
      if (!layer.visible || layer.opacity <= 0) continue
      surface.ensureMips()
      const motion = o.still
        ? { matrix: IDENTITY, opacity: layer.opacity }
        : transformAt(layer.transform, o.time, analysis?.centroid ?? { x: 0.5, y: 0.5 }, layer.opacity)
      const flow = flowUniforms(layer.flow)
      const transfer = o.still ? null : analysis?.transfer ?? null
      const h = layer.harmonize

      bindTarget(gl, dst)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, src.tex)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, surface.target.tex)
      gl.uniform3fv(prog.u('u_place'), placeUniform(layer.place, PAINTING_SIZE))
      gl.uniformMatrix3fv(prog.u('u_xform'), false, motion.matrix)
      gl.uniform1f(prog.u('u_opacity'), motion.opacity)
      gl.uniform1i(prog.u('u_blend'), BLEND_MODES.indexOf(layer.blend))
      gl.uniform1i(prog.u('u_flowKind'), o.still ? 0 : flow.kind)
      gl.uniform2f(prog.u('u_flow'), flow.speed, flow.intensity)
      gl.uniform2fv(prog.u('u_dir'), flow.dir)
      gl.uniform2fv(prog.u('u_seed'), flow.seed)
      gl.uniform2fv(prog.u('u_origin'), flow.origin)
      gl.uniform1f(prog.u('u_featherOn'), h.feather > 0 ? 1 : 0)
      gl.uniform1f(prog.u('u_featherLod'), Math.log2(Math.max(1, h.feather)))
      gl.uniform1f(prog.u('u_bleed'), o.still ? 0 : h.bleed)
      gl.uniform1f(prog.u('u_match'), transfer ? h.colorMatch : 0)
      if (transfer) {
        gl.uniform3fv(prog.u('u_srcMean'), transfer.srcMean)
        gl.uniform3fv(prog.u('u_labScale'), transfer.scale)
        gl.uniform3fv(prog.u('u_dstMean'), transfer.dstMean)
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      ;[src, dst] = [dst, src]
    }
    gl.bindVertexArray(null)
    return src
  }

  dispose() {
    this.targets.forEach(t => deleteTarget(this.gl, t))
  }
}
```

- [ ] **Step 2: Write `lib/renderer/analyzer.ts`**

```ts
import { FULLSCREEN } from '@/lib/geometry/mat3'
import { placeUniform } from '@/lib/geometry/place'
import { PAINTING_SIZE } from '@/lib/doc/types'
import { alphaCentroid, colorTransfer } from '@/lib/harmonize/stats'
import { Compositor, type Analysis, type LayerDraw } from './compositor'
import { bindTarget, createTarget, deleteTarget, type Program, type Target } from './gl'

const SMALL = 128

/** Reads a 128² version of a layer (and what is under it) to get centroid + color transfer. */
export class Analyzer {
  private small: Target
  private comp: Compositor
  private layerPx = new Uint8Array(SMALL * SMALL * 4)
  private belowPx = new Uint8Array(SMALL * SMALL * 4)

  constructor(private gl: WebGL2RenderingContext, private quad: WebGLVertexArrayObject, private placeProg: Program, layerProg: Program) {
    this.small = createTarget(gl, SMALL)
    this.comp = new Compositor(gl, quad, layerProg, SMALL, false)
  }

  analyze(draws: LayerDraw[], index: number, background: [number, number, number]): Analysis {
    const { gl, placeProg } = this
    const { layer, surface } = draws[index]
    surface.ensureMips()
    bindTarget(gl, this.small)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(placeProg.prog)
    gl.bindVertexArray(this.quad)
    gl.uniformMatrix3fv(placeProg.u('u_toClip'), false, FULLSCREEN)
    gl.uniform3fv(placeProg.u('u_place'), placeUniform(layer.place, PAINTING_SIZE))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, surface.target.tex)
    gl.uniform1i(placeProg.u('u_layer'), 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    gl.readPixels(0, 0, SMALL, SMALL, gl.RGBA, gl.UNSIGNED_BYTE, this.layerPx)

    const centroid = alphaCentroid(this.layerPx, SMALL, SMALL) ?? { x: 0.5, y: 0.5 }
    let transfer = null
    if (layer.harmonize.colorMatch > 0) {
      const below = this.comp.render(draws.slice(0, index), { time: 0, background, still: true })
      bindTarget(gl, below)
      gl.readPixels(0, 0, SMALL, SMALL, gl.RGBA, gl.UNSIGNED_BYTE, this.belowPx)
      transfer = colorTransfer(this.layerPx, this.belowPx)
    }
    return { centroid, transfer }
  }

  dispose() {
    deleteTarget(this.gl, this.small)
    this.comp.dispose()
  }
}
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add lib/renderer/compositor.ts lib/renderer/analyzer.ts
git commit -m "feat(renderer): layer compositor and 128px analysis readback"
```

---

### Task 11: Renderer and image loading

**Files:**
- Create: `lib/renderer/renderer.ts`, `lib/image/loadImage.ts`

- [ ] **Step 1: Write `lib/renderer/renderer.ts`**

```ts
import { hexToRgb } from '@/lib/color/hex'
import { elapsedSeconds } from '@/lib/doc/painting'
import { PAINTING_SIZE, type Painting } from '@/lib/doc/types'
import { paintingRect, rectToClip, type View } from '@/lib/geometry/view'
import { analysisKey } from './analysisKey'
import { Analyzer } from './analyzer'
import { Compositor, type Analysis, type LayerDraw } from './compositor'
import { bindTarget, createGL, createProgram, createQuad, type Program } from './gl'
import { Painter } from './painter'
import { LAYER_FS, PLACE_FS, QUAD_VS, SCREEN_FS } from './shaders'
import { LayerSurface } from './surface'

interface Resources {
  quad: WebGLVertexArrayObject
  painter: Painter
  layer: Program
  place: Program
  screen: Program
  comp: Compositor
  analyzer: Analyzer
}

function createResources(gl: WebGL2RenderingContext): Resources {
  const quad = createQuad(gl)
  const layer = createProgram(gl, QUAD_VS, LAYER_FS)
  const place = createProgram(gl, QUAD_VS, PLACE_FS)
  const screen = createProgram(gl, QUAD_VS, SCREEN_FS)
  return {
    quad, layer, place, screen,
    painter: new Painter(gl, quad),
    comp: new Compositor(gl, quad, layer, PAINTING_SIZE, true),
    analyzer: new Analyzer(gl, quad, place, layer),
  }
}

export class Renderer {
  private gl: WebGL2RenderingContext
  private res: Resources
  private surfaces = new Map<string, LayerSurface>()
  private analyses = new Map<string, { key: string; value: Analysis }>()
  private lost = false
  onLost: ((lost: boolean) => void) | null = null

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = createGL(canvas)
    this.res = createResources(this.gl)
    canvas.addEventListener('webglcontextlost', this.handleLost)
    canvas.addEventListener('webglcontextrestored', this.handleRestored)
  }

  surface(layerId: string): LayerSurface {
    let s = this.surfaces.get(layerId)
    if (!s) {
      s = new LayerSurface(this.gl, this.res.painter, PAINTING_SIZE)
      this.surfaces.set(layerId, s)
    }
    return s
  }

  dropSurface(layerId: string) {
    this.surfaces.get(layerId)?.dispose()
    this.surfaces.delete(layerId)
    this.analyses.delete(layerId)
  }

  frame(p: Painting, view: View, now: number) {
    const { gl, canvas, res } = this
    if (this.lost || gl.isContextLost()) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    const background = hexToRgb(p.background)
    const draws: LayerDraw[] = p.layers.map(layer => ({
      layer,
      surface: this.surface(layer.id),
      analysis: this.analyses.get(layer.id)?.value ?? null,
    }))
    this.refreshOneAnalysis(p, draws, background)

    const time = elapsedSeconds(p, now)
    const out = res.comp.render(draws, { time, background, still: false })
    gl.bindTexture(gl.TEXTURE_2D, out.tex)
    gl.generateMipmap(gl.TEXTURE_2D)

    const vp = { width: cssW, height: cssH }
    bindTarget(gl, null, w, h)
    gl.clearColor(0.07, 0.07, 0.07, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(res.screen.prog)
    gl.bindVertexArray(res.quad)
    gl.uniformMatrix3fv(res.screen.u('u_toClip'), false, rectToClip(paintingRect(vp, PAINTING_SIZE, view), vp))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, out.tex)
    gl.uniform1i(res.screen.u('u_tex'), 0)
    gl.uniform1f(res.screen.u('u_grain'), p.grain)
    gl.uniform1f(res.screen.u('u_time'), time)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }

  /** At most one readback per frame; skipped while that layer is mid-stroke. */
  private refreshOneAnalysis(p: Painting, draws: LayerDraw[], background: [number, number, number]) {
    const versionOf = (id: string) => this.surfaces.get(id)?.version ?? 0
    for (let i = 0; i < draws.length; i++) {
      const { layer, surface } = draws[i]
      const needs = layer.harmonize.colorMatch > 0 || layer.transform.recipe === 'pulse' || layer.transform.recipe === 'turn'
      if (!needs || surface.drawing) continue
      const key = analysisKey(p, i, versionOf)
      if (this.analyses.get(layer.id)?.key === key) continue
      const value = this.res.analyzer.analyze(draws, i, background)
      this.analyses.set(layer.id, { key, value })
      draws[i].analysis = value
      return
    }
  }

  private handleLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
    this.onLost?.(true)
  }

  private handleRestored = () => {
    try {
      this.res = createResources(this.gl)
      for (const s of this.surfaces.values()) s.restore(this.res.painter)
      this.analyses.clear()
      this.lost = false
      this.onLost?.(false)
    } catch {
      // stays lost; the UI keeps showing "Reload to restore the canvas"
    }
  }

  dispose() {
    const { gl, res } = this
    this.canvas.removeEventListener('webglcontextlost', this.handleLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored)
    for (const s of this.surfaces.values()) s.dispose()
    this.surfaces.clear()
    res.comp.dispose()
    res.analyzer.dispose()
    res.painter.dispose()
    ;[res.layer, res.place, res.screen].forEach(pr => gl.deleteProgram(pr.prog))
  }
}
```

- [ ] **Step 2: Write `lib/image/loadImage.ts`**

```ts
import { PAINTING_SIZE } from '@/lib/doc/types'

/** Decode an image file, downscaled so its longest side is ≤ maxSide. */
export async function loadImage(file: Blob, maxSide = PAINTING_SIZE): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  if (s === 1) return bmp
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * s)
  canvas.height = Math.round(bmp.height * s)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return createImageBitmap(canvas)
}
```

- [ ] **Step 3: Typecheck, run all tests, commit**

Run: `npm run typecheck && npm test`
Expected: no type errors; all suites PASS.

```bash
git add lib/renderer/renderer.ts lib/image
git commit -m "feat(renderer): frame loop, analysis cache, context-loss restore, image loading"
```

---

### Task 12: Studio shell — canvas, painting, pan/zoom

**Files:**
- Replace: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Delete: `app/page.module.css` (if present)
- Create: `app/studio/page.tsx`, `components/Studio.tsx`, `components/PaintCanvas.tsx`, `components/Slider.tsx`

- [ ] **Step 1: Replace `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '09tt',
  description: 'Paint layers, then tell them how to move.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: '09tt' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#111111',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Replace `app/page.tsx` and create `app/studio/page.tsx`**

`app/page.tsx`:

```tsx
import Link from 'next/link'

export default function Home() {
  return (
    <main className="landing">
      <h1>09tt</h1>
      <p>Paint layers. Tell them how to move.</p>
      <Link className="button primary" href="/studio">New painting</Link>
    </main>
  )
}
```

`app/studio/page.tsx`:

```tsx
import Studio from '@/components/Studio'

export default function StudioPage() {
  return <Studio />
}
```

```bash
rm -f app/page.module.css
```

- [ ] **Step 3: Replace `app/globals.css`**

```css
:root {
  --bg: #111;
  --panel: rgba(22, 22, 22, 0.94);
  --line: #2d2d2d;
  --text: #ececec;
  --muted: #8f8f8f;
  --accent: #ff5a36;
  --bar: 52px;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; height: 100%; overflow: hidden; overscroll-behavior: none;
  background: var(--bg); color: var(--text);
  font: 13px/1.3 ui-sans-serif, system-ui, -apple-system, sans-serif;
  -webkit-user-select: none; user-select: none;
}
button, select, .button {
  font: inherit; color: var(--text); background: #222; border: 1px solid var(--line);
  border-radius: 6px; padding: 6px 10px; cursor: pointer; text-decoration: none; display: inline-block;
}
button.on, .button.primary { background: var(--accent); border-color: var(--accent); color: #111; }
button:disabled { opacity: 0.35; cursor: default; }
button.danger { color: #ff8a7a; }
input[type='color'] { width: 34px; height: 30px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; }

.landing { height: 100%; display: grid; place-content: center; text-align: center; gap: 12px; }
.landing h1 { font-size: 56px; margin: 0; letter-spacing: -0.03em; }
.landing p { color: var(--muted); margin: 0 0 12px; }

.studio { position: fixed; inset: 0; }
.paint-canvas {
  position: absolute; left: 0; right: 0; bottom: 0; top: calc(var(--bar) + env(safe-area-inset-top, 0px));
  width: 100%; height: calc(100% - var(--bar) - env(safe-area-inset-top, 0px));
  display: block; touch-action: none;
}
.toolbar {
  position: absolute; left: 0; right: 0; top: 0; min-height: var(--bar);
  padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 8px;
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  background: var(--panel); border-bottom: 1px solid var(--line); z-index: 2;
}
.toolbar .group { display: flex; gap: 4px; }
.toolbar .spacer { flex: 1; }

.slider { display: flex; align-items: center; gap: 6px; }
.slider span { color: var(--muted); min-width: 58px; }
.slider input { width: 110px; }
.field { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
.field span { color: var(--muted); min-width: 58px; }

.layers {
  position: absolute; right: 0; bottom: 0; top: calc(var(--bar) + env(safe-area-inset-top, 0px)); width: 300px;
  overflow-y: auto; padding: 10px; background: var(--panel); border-left: 1px solid var(--line); z-index: 1;
}
.layers-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.layers ol { list-style: none; margin: 0; padding: 0; }
.layers li { display: flex; gap: 4px; align-items: center; padding: 3px; border-radius: 6px; }
.layers li.active { background: #2a2a2a; }
.layers li .name { flex: 1; text-align: left; background: none; border-color: transparent; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.layers .icon { padding: 4px 7px; background: none; }
.inspector { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 4px; }
.inspector h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 14px 0 6px; }
.inspector .slider { margin: 5px 0; }
.inspector .slider input { flex: 1; }
.inspector .row { display: flex; gap: 6px; margin: 6px 0; }

.status {
  position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 3;
  background: #3a1410; border: 1px solid #6d2a20; padding: 8px 14px; border-radius: 8px;
}
```

- [ ] **Step 4: Create `components/Slider.tsx`**

```tsx
interface Props {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

export default function Slider({ label, min, max, step, value, onChange }: Props) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  )
}
```

- [ ] **Step 5: Create `components/PaintCanvas.tsx`**

```tsx
'use client'

import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import { normalizePressure } from '@/lib/brush/stamps'
import { PAINTING_SIZE, type Layer, type Painting, type Placement } from '@/lib/doc/types'
import { paintingToLayer } from '@/lib/geometry/place'
import { DEFAULT_VIEW, panView, pinchView, screenToPainting, type Pt, type View } from '@/lib/geometry/view'
import { modeOnDown, type Mode } from '@/lib/input/pointers'
import { Renderer } from '@/lib/renderer/renderer'

export type Tool = 'paint' | 'erase' | 'move'
export interface BrushSettings { tool: Tool; color: string; size: number; opacity: number }

interface Props {
  painting: Painting
  activeLayer: Layer
  brush: BrushSettings
  rendererRef: MutableRefObject<Renderer | null>
  onPlace: (layerId: string, place: Placement) => void
  onStatus: (message: string | null) => void
}

export default function PaintCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  useLayoutEffect(() => {
    latest.current = props
  })
  const view = useRef<View>(DEFAULT_VIEW)
  const pointers = useRef(new Map<number, { pt: Pt; kind: string }>())
  const g = useRef({ mode: 'idle' as Mode, penSeen: false, strokeId: null as number | null, moveFrom: null as Pt | null, placeFrom: null as Placement | null })

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const viewport = () => ({ width: canvasRef.current!.clientWidth, height: canvasRef.current!.clientHeight })
  const toPainting = (pt: Pt) => screenToPainting(pt, viewport(), PAINTING_SIZE, view.current)
  const touchCount = () => [...pointers.current.values()].filter(p => p.kind === 'touch').length

  useEffect(() => {
    const canvas = canvasRef.current!
    let renderer: Renderer
    try {
      renderer = new Renderer(canvas)
    } catch (e) {
      latest.current.onStatus(e instanceof Error ? e.message : String(e))
      return
    }
    renderer.onLost = lost => latest.current.onStatus(lost ? 'Reload to restore the canvas' : null)
    latest.current.rendererRef.current = renderer

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const c = local(e)
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * 0.01)
        view.current = pinchView(view.current, viewport(), PAINTING_SIZE,
          [{ x: c.x - 50, y: c.y }, { x: c.x + 50, y: c.y }],
          [{ x: c.x - 50 * f, y: c.y }, { x: c.x + 50 * f, y: c.y }])
      } else {
        view.current = panView(view.current, -e.deltaX, -e.deltaY)
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    let raf = 0
    const loop = () => {
      renderer.frame(latest.current.painting, view.current, Date.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('wheel', onWheel)
      latest.current.rendererRef.current = null
      renderer.dispose()
    }
  }, [])

  function startTool(e: { pointerId: number; pointerType: string; pressure: number; clientX: number; clientY: number }) {
    const { activeLayer, brush, rendererRef } = latest.current
    const p = toPainting(local(e))
    g.current.strokeId = e.pointerId
    if (brush.tool === 'move') {
      g.current.moveFrom = p
      g.current.placeFrom = activeLayer.place
      return
    }
    const lp = paintingToLayer(p, activeLayer.place, PAINTING_SIZE)
    rendererRef.current?.surface(activeLayer.id).begin(
      { color: brush.color, size: brush.size / activeLayer.place.scale, opacity: brush.opacity, erase: brush.tool === 'erase' },
      { x: lp.x, y: lp.y, pressure: normalizePressure(e.pointerType, e.pressure) },
    )
  }

  function continueTool(e: PointerEvent) {
    const { activeLayer, rendererRef, onPlace } = latest.current
    const p = toPainting(local(e))
    const { moveFrom, placeFrom } = g.current
    if (moveFrom && placeFrom) {
      onPlace(activeLayer.id, { ...placeFrom, x: placeFrom.x + p.x - moveFrom.x, y: placeFrom.y + p.y - moveFrom.y })
      return
    }
    const lp = paintingToLayer(p, activeLayer.place, PAINTING_SIZE)
    rendererRef.current?.surface(activeLayer.id).extend({ x: lp.x, y: lp.y, pressure: normalizePressure(e.pointerType, e.pressure) })
  }

  function endTool() {
    const { activeLayer, rendererRef } = latest.current
    rendererRef.current?.surface(activeLayer.id).commit()
    g.current.strokeId = null
    g.current.moveFrom = null
    g.current.placeFrom = null
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.pointerType === 'pen') g.current.penSeen = true
    pointers.current.set(e.pointerId, { pt: local(e), kind: e.pointerType })
    const next = modeOnDown({ mode: g.current.mode, penSeen: g.current.penSeen, touchCount: touchCount() }, e.pointerType)
    if (next.cancelStroke) {
      latest.current.rendererRef.current?.surface(latest.current.activeLayer.id).cancel()
      g.current.strokeId = null
      g.current.moveFrom = null
      g.current.placeFrom = null
    }
    const wasIdle = g.current.mode === 'idle'
    g.current.mode = next.mode
    if (wasIdle && next.mode === 'tool') startTool(e)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    const entry = pointers.current.get(e.pointerId)
    if (!entry) return
    const cur = local(e)
    if (g.current.mode === 'gesture' && entry.kind === 'touch') {
      const touches = [...pointers.current.entries()].filter(([, p]) => p.kind === 'touch')
      if (touches.length >= 2) {
        const [a, b] = touches
        const prev: [Pt, Pt] = [a[1].pt, b[1].pt]
        const next: [Pt, Pt] = [a[0] === e.pointerId ? cur : a[1].pt, b[0] === e.pointerId ? cur : b[1].pt]
        view.current = pinchView(view.current, viewport(), PAINTING_SIZE, prev, next)
      } else {
        view.current = panView(view.current, cur.x - entry.pt.x, cur.y - entry.pt.y)
      }
    } else if (g.current.mode === 'tool' && e.pointerId === g.current.strokeId) {
      const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? []
      for (const ev of coalesced.length ? coalesced : [e.nativeEvent]) continueTool(ev)
    }
    entry.pt = cur
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (e.pointerId === g.current.strokeId) {
      endTool()
      if (g.current.mode === 'tool') g.current.mode = 'idle'
    }
    pointers.current.delete(e.pointerId)
    if (g.current.mode === 'gesture' && touchCount() === 0) g.current.mode = 'idle'
    if (pointers.current.size === 0) g.current.mode = 'idle'
  }

  return (
    <canvas
      ref={canvasRef}
      className="paint-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  )
}
```

- [ ] **Step 6: Create a minimal `components/Studio.tsx`**

Task 13 replaces this file with the full version.

```tsx
'use client'

import { useReducer, useRef, useState } from 'react'
import { createPainting, DocError, reduce, type Action } from '@/lib/doc/painting'
import type { Painting } from '@/lib/doc/types'
import type { Renderer } from '@/lib/renderer/renderer'
import PaintCanvas, { type BrushSettings } from './PaintCanvas'

const newId = () => crypto.randomUUID()

function safeReduce(p: Painting, a: Action): Painting {
  try {
    return reduce(p, a)
  } catch (e) {
    if (e instanceof DocError) {
      console.warn(e.message)
      return p
    }
    throw e
  }
}

export default function Studio() {
  const [painting, dispatch] = useReducer(safeReduce, null, () => createPainting(Date.now(), newId()))
  const [brush] = useState<BrushSettings>({ tool: 'paint', color: '#e2482d', size: 32, opacity: 1 })
  const [status, setStatus] = useState<string | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const active = painting.layers[painting.layers.length - 1]

  return (
    <main className="studio">
      <PaintCanvas
        painting={painting}
        activeLayer={active}
        brush={brush}
        rendererRef={rendererRef}
        onPlace={(layerId, place) => dispatch({ type: 'patchLayer', layerId, patch: { place } })}
        onStatus={setStatus}
      />
      {status && <div className="status">{status}</div>}
    </main>
  )
}
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, then open `http://localhost:3000/studio`.
Expected:
- The canvas shows a cream square (`#f3efe6`), letterboxed on dark grey.
- Mouse drag paints red strokes that follow the cursor.
- Trackpad pinch (ctrl+wheel) zooms around the cursor, and scrolling pans.
- The browser console has no shader compile or WebGL errors.

If a shader fails to compile, the thrown message shows in the red status pill. Fix the GLSL in `shaders.ts`.

- [ ] **Step 8: Commit**

```bash
git add app components
git commit -m "feat(studio): WebGL canvas with painting, pinch zoom and pan"
```

---

### Task 13: Toolbar, layer panel, motion and blend-in controls

**Files:**
- Create: `components/Toolbar.tsx`, `components/LayerPanel.tsx`
- Replace: `components/Studio.tsx`

- [ ] **Step 1: Create `components/Toolbar.tsx`**

```tsx
'use client'

import type { Dispatch } from 'react'
import type { Action } from '@/lib/doc/painting'
import type { Painting } from '@/lib/doc/types'
import type { BrushSettings, Tool } from './PaintCanvas'
import Slider from './Slider'

interface Props {
  brush: BrushSettings
  onBrush: (b: BrushSettings) => void
  painting: Painting
  dispatch: Dispatch<Action>
  onUndo: () => void
  onImport: (files: File[]) => void
  layersOpen: boolean
  onToggleLayers: () => void
}

const TOOLS: Tool[] = ['paint', 'erase', 'move']

export default function Toolbar({ brush, onBrush, painting, dispatch, onUndo, onImport, layersOpen, onToggleLayers }: Props) {
  return (
    <header className="toolbar">
      <div className="group">
        {TOOLS.map(t => (
          <button key={t} className={brush.tool === t ? 'on' : ''} onClick={() => onBrush({ ...brush, tool: t })}>{t}</button>
        ))}
      </div>
      <input type="color" aria-label="Brush color" value={brush.color} onChange={e => onBrush({ ...brush, color: e.target.value })} />
      <Slider label="Size" min={1} max={300} step={1} value={brush.size} onChange={size => onBrush({ ...brush, size })} />
      <Slider label="Opacity" min={0.05} max={1} step={0.05} value={brush.opacity} onChange={opacity => onBrush({ ...brush, opacity })} />
      <button onClick={onUndo}>Undo</button>
      <label className="button">
        Image
        <input type="file" accept="image/*" multiple hidden onChange={e => { onImport(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </label>
      <span className="spacer" />
      <Slider label="Grain" min={0} max={1} step={0.05} value={painting.grain} onChange={grain => dispatch({ type: 'setGrain', grain })} />
      <input type="color" aria-label="Background" title="Background" value={painting.background} onChange={e => dispatch({ type: 'setBackground', color: e.target.value })} />
      <button onClick={() => dispatch({ type: 'setPlayback', playing: !painting.playing, now: Date.now() })}>{painting.playing ? 'Pause' : 'Play'}</button>
      <button className={layersOpen ? 'on' : ''} onClick={onToggleLayers}>Layers</button>
    </header>
  )
}
```

- [ ] **Step 2: Create `components/LayerPanel.tsx`**

```tsx
'use client'

import type { Dispatch } from 'react'
import type { Action, LayerPatch } from '@/lib/doc/painting'
import { BLEND_IN_PRESET, NO_HARMONIZE, makeFlow, makeHarmonize, makeTransform } from '@/lib/doc/recipes'
import { BLEND_MODES, FLOW_RECIPES, TRANSFORM_RECIPES, type BlendMode, type Layer, type Painting } from '@/lib/doc/types'
import Slider from './Slider'

interface Props {
  painting: Painting
  activeId: string
  onActivate: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  dispatch: Dispatch<Action>
}

export default function LayerPanel({ painting, activeId, onActivate, onAdd, onRemove, dispatch }: Props) {
  const patch = (layerId: string, p: LayerPatch) => dispatch({ type: 'patchLayer', layerId, patch: p })
  const active = painting.layers.find(l => l.id === activeId)
  const last = painting.layers.length - 1

  return (
    <aside className="layers">
      <div className="layers-head">
        <strong>Layers</strong>
        <button onClick={onAdd}>+ Layer</button>
      </div>
      <ol>
        {[...painting.layers].reverse().map(layer => {
          const index = painting.layers.indexOf(layer)
          return (
            <li key={layer.id} className={layer.id === activeId ? 'active' : ''}>
              <button className="icon" aria-label="Toggle visibility" onClick={() => patch(layer.id, { visible: !layer.visible })}>{layer.visible ? '●' : '○'}</button>
              <button
                className="name"
                onClick={() => onActivate(layer.id)}
                onDoubleClick={() => {
                  const name = prompt('Layer name', layer.name)
                  if (name) patch(layer.id, { name })
                }}
              >
                {layer.name}
                {layer.flow.recipe !== 'none' ? ` · ${layer.flow.recipe}` : ''}
              </button>
              <button className={`icon ${painting.focusedLayerId === layer.id ? 'on' : ''}`} title="Focus for the agent" onClick={() => dispatch({ type: 'focus', layerId: layer.id })}>◎</button>
              <button className="icon" aria-label="Move up" disabled={index === last} onClick={() => dispatch({ type: 'moveLayer', layerId: layer.id, toIndex: index + 1 })}>↑</button>
              <button className="icon" aria-label="Move down" disabled={index === 0} onClick={() => dispatch({ type: 'moveLayer', layerId: layer.id, toIndex: index - 1 })}>↓</button>
            </li>
          )
        })}
      </ol>
      {active && <Inspector layer={active} canRemove={painting.layers.length > 1} onRemove={() => onRemove(active.id)} patch={p => patch(active.id, p)} />}
    </aside>
  )
}

function Inspector({ layer, canRemove, onRemove, patch }: { layer: Layer; canRemove: boolean; onRemove: () => void; patch: (p: LayerPatch) => void }) {
  const f = layer.flow
  const t = layer.transform
  const h = layer.harmonize
  return (
    <section className="inspector">
      <h3>Layer</h3>
      <Slider label="Opacity" min={0} max={1} step={0.01} value={layer.opacity} onChange={opacity => patch({ opacity })} />
      <label className="field">
        <span>Blend</span>
        <select value={layer.blend} onChange={e => patch({ blend: e.target.value as BlendMode })}>
          {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <Slider label="Scale" min={0.1} max={3} step={0.01} value={layer.place.scale} onChange={scale => patch({ place: { ...layer.place, scale } })} />
      <div className="row"><button onClick={() => patch({ place: { x: 0, y: 0, scale: 1 } })}>Reset place</button></div>

      <h3>Flow</h3>
      <select value={f.recipe} onChange={e => patch({ flow: makeFlow(e.target.value, { speed: f.speed, intensity: f.intensity, originX: f.originX, originY: f.originY }) })}>
        {FLOW_RECIPES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {f.recipe !== 'none' && (
        <>
          <Slider label="Speed" min={0} max={4} step={0.05} value={f.speed} onChange={speed => patch({ flow: makeFlow(f.recipe, { ...f, speed }) })} />
          <Slider label="Intensity" min={0} max={1} step={0.01} value={f.intensity} onChange={intensity => patch({ flow: makeFlow(f.recipe, { ...f, intensity }) })} />
          <Slider label="Direction" min={0} max={359} step={1} value={f.direction} onChange={direction => patch({ flow: makeFlow(f.recipe, { ...f, direction }) })} />
          {f.recipe === 'rush' && (
            <>
              <Slider label="Origin X" min={0} max={1} step={0.01} value={f.originX} onChange={originX => patch({ flow: makeFlow(f.recipe, { ...f, originX }) })} />
              <Slider label="Origin Y" min={0} max={1} step={0.01} value={f.originY} onChange={originY => patch({ flow: makeFlow(f.recipe, { ...f, originY }) })} />
            </>
          )}
        </>
      )}

      <h3>Transform</h3>
      <select value={t.recipe} onChange={e => patch({ transform: makeTransform(e.target.value, { speed: t.speed, intensity: t.intensity, direction: t.direction }) })}>
        {TRANSFORM_RECIPES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {t.recipe !== 'none' && (
        <>
          <Slider label="Speed" min={0} max={4} step={0.05} value={t.speed} onChange={speed => patch({ transform: makeTransform(t.recipe, { ...t, speed }) })} />
          <Slider label="Intensity" min={0} max={1} step={0.01} value={t.intensity} onChange={intensity => patch({ transform: makeTransform(t.recipe, { ...t, intensity }) })} />
          {t.recipe === 'drift' && (
            <Slider label="Direction" min={0} max={359} step={1} value={t.direction} onChange={direction => patch({ transform: makeTransform(t.recipe, { ...t, direction }) })} />
          )}
        </>
      )}

      <h3>Blend in</h3>
      <div className="row">
        <button onClick={() => patch({ harmonize: BLEND_IN_PRESET })}>Blend in</button>
        <button onClick={() => patch({ harmonize: NO_HARMONIZE })}>Reset</button>
      </div>
      <Slider label="Feather" min={0} max={64} step={1} value={h.feather} onChange={feather => patch({ harmonize: makeHarmonize({ ...h, feather }) })} />
      <Slider label="Color" min={0} max={1} step={0.01} value={h.colorMatch} onChange={colorMatch => patch({ harmonize: makeHarmonize({ ...h, colorMatch }) })} />
      <Slider label="Bleed" min={0} max={1} step={0.01} value={h.bleed} onChange={bleed => patch({ harmonize: makeHarmonize({ ...h, bleed }) })} />

      <div className="row"><button className="danger" disabled={!canRemove} onClick={onRemove}>Delete layer</button></div>
    </section>
  )
}
```

- [ ] **Step 3: Replace `components/Studio.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPainting, DocError, reduce, type Action } from '@/lib/doc/painting'
import { PAINTING_SIZE, type Painting } from '@/lib/doc/types'
import { fitContain } from '@/lib/geometry/place'
import { loadImage } from '@/lib/image/loadImage'
import type { Renderer } from '@/lib/renderer/renderer'
import LayerPanel from './LayerPanel'
import PaintCanvas, { type BrushSettings } from './PaintCanvas'
import Toolbar from './Toolbar'

const newId = () => crypto.randomUUID()

function safeReduce(p: Painting, a: Action): Painting {
  try {
    return reduce(p, a)
  } catch (e) {
    if (e instanceof DocError) {
      console.warn(e.message)
      return p
    }
    throw e
  }
}

export default function Studio() {
  const [painting, dispatch] = useReducer(safeReduce, null, () => createPainting(Date.now(), newId()))
  const [activeId, setActiveId] = useState(() => painting.layers[0].id)
  const [brush, setBrush] = useState<BrushSettings>({ tool: 'paint', color: '#e2482d', size: 32, opacity: 1 })
  const [layersOpen, setLayersOpen] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const active = painting.layers.find(l => l.id === activeId) ?? painting.layers[painting.layers.length - 1]

  const undo = useCallback(() => {
    rendererRef.current?.surface(active.id).undo()
  }, [active.id])

  const importFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      try {
        const bitmap = await loadImage(file)
        const id = newId()
        dispatch({ type: 'addLayer', id, name: file.name.replace(/\.[^.]+$/, '') || 'Image' })
        rendererRef.current?.surface(id).setBase(bitmap, fitContain(bitmap.width, bitmap.height, PAINTING_SIZE))
        setActiveId(id)
      } catch {
        setStatus(`Could not open ${file.name}`)
      }
    }
  }, [])

  const addLayer = () => {
    const id = newId()
    dispatch({ type: 'addLayer', id })
    setActiveId(id)
  }

  const removeLayer = (id: string) => {
    if (painting.layers.length <= 1) return
    dispatch({ type: 'removeLayer', layerId: id })
    rendererRef.current?.dropSurface(id)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      void importFiles(files)
    }
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      void importFiles(Array.from(e.dataTransfer?.files ?? []))
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [importFiles])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  return (
    <main className="studio">
      <PaintCanvas
        painting={painting}
        activeLayer={active}
        brush={brush}
        rendererRef={rendererRef}
        onPlace={(layerId, place) => dispatch({ type: 'patchLayer', layerId, patch: { place } })}
        onStatus={setStatus}
      />
      <Toolbar
        brush={brush}
        onBrush={setBrush}
        painting={painting}
        dispatch={dispatch}
        onUndo={undo}
        onImport={files => void importFiles(files)}
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen(o => !o)}
      />
      {layersOpen && (
        <LayerPanel painting={painting} activeId={active.id} onActivate={setActiveId} onAdd={addLayer} onRemove={removeLayer} dispatch={dispatch} />
      )}
      {status && (
        <div className="status" onClick={() => setStatus(null)}>{status}</div>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Typecheck and run tests**

Run: `npm run typecheck && npm test`
Expected: no errors; all suites PASS.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, then open `/studio`.

Check each item:
- Paint on Layer 1. Add a layer, paint something else on it, and toggle ● to hide and show it.
- Select Layer 2 → Flow `smoke`. The layer drifts like vapor, and Layer 1 stays still.
- Flow `streaks` at direction 0 gives a horizontal smear with banding.
- Flow `melt` makes paint drip downward in columns.
- Flow `rush` streams paint outward from the center, and moving Origin X/Y moves the vanishing point. The loop shows no visible jump.
- Transform `turn` rotates around the painted mass, not the canvas center. `breathe` pulses opacity.
- Pause freezes the motion, and Play resumes from the same frame without a jump.
- Undo (button and ⌘Z) removes the last stroke on the active layer.
- Blend mode `multiply` on the top layer darkens what is under it.

- [ ] **Step 6: Commit**

```bash
git add components
git commit -m "feat(studio): toolbar, layer panel, flow/transform/blend-in controls"
```

---

### Task 14: Image import and move tool check

This task only verifies, because the code landed in Tasks 11–13.

- [ ] **Step 1: Verify paste, drop and the picker**

In `/studio`:
- Copy an image (for example from Cosmos) and paste it with ⌘V. A new layer named after the file (or "image") appears, centered at ~80% of the canvas, and becomes active.
- Drag a PNG with transparency from Finder. The transparent areas stay transparent, with no dark fringe (premultiplied upload).
- Use the "Image" toolbar button with a 6000 px photo. It loads (downscaled) without errors.

- [ ] **Step 2: Verify placement**

- Select the pasted layer and choose the `move` tool. Dragging moves the image.
- Set Scale to 0.5. The image shrinks around the canvas center.
- Switch to `paint` and paint on the scaled layer. The stroke lands exactly under the cursor, and its width matches the brush size on screen.
- Reset place puts the image back.

- [ ] **Step 3: Verify blend in**

Paint a warm orange field on Layer 1, then paste a cool blue photo scrap on top.
- Tap **Blend in**. The scrap's hard edge softens, its colors shift toward the orange under it, and its edge slowly wobbles into the field.
- Color at 1 makes it take the backdrop's palette strongly. At 0 it returns to its original colors.
- Feather at 64 gives a very soft edge.
- Bleed at 0 means no edge wobble.
- Blend `soft-light` or `multiply` plus Grain 0.3 makes the scrap read as part of the same surface.
- Moving the scrap with `move` updates the color match within a frame or two of releasing.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(studio): import and blend-in polish from manual pass"
```

Skip the commit if nothing changed.

---

### Task 15: iPad Safari pass

- [ ] **Step 1: Serve on the LAN**

Run: `npm run dev -- -H 0.0.0.0`, then open `http://<mac-lan-ip>:3000/studio` on the iPad in Safari.

- [ ] **Step 2: Verify Pencil and gestures**

- The Pencil paints, and pressure changes stroke width.
- Resting a palm on the screen while drawing with the Pencil does not break or cancel the stroke.
- After the Pencil has been used, a single finger does not paint.
- Two-finger pinch zooms around the fingers, and a two-finger drag pans.
- The page never rubber-bands or zooms the whole UI, and the toolbar clears the status bar.
- Before any Pencil use (fresh load), a finger paints. Adding a second finger cancels that stroke and pinches instead.

- [ ] **Step 3: Verify performance and context loss**

- With 6 layers where 3 are animated (`rush`, `smoke`, `streaks`), motion stays smooth. Note the frame rate. If it's under ~40 fps, record it in the commit message for Plan 2 (the likely fix is compositing at display resolution).
- Switch to another app for 30 s and come back. The painting is intact. If Safari dropped the context, it restores without a reload, or the "Reload to restore the canvas" pill shows.

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix(ipad): pointer and viewport fixes from device pass"
```

Skip the commit if nothing changed.

---

### Task 16: Look-tuning against the references

Only numeric constants in `lib/renderer/shaders.ts` may change in this task. Record each change in the commit message.

- [ ] **Step 1: Rush (Bardou clip + zoom-burst street)**

Paste a landscape photo, apply Flow `rush` with intensity 0.7 and the origin on the horizon's vanishing point. Target: paint seems to stream toward the viewer in short brush-shaped smears. The centre stays readable and the edges smear more.

Knobs:
- `fract(t * 0.12)`: travel speed
- `exp(f * (0.2 + 0.5 * k))`: zoom depth per loop
- `k * 0.07 * r`: smear length
- `radial * 9.0` / `log(r) * 7.0`: dab size (higher = smaller dabs)

At intensity 1 on a night-street photo it should read as a zoom burst.

- [ ] **Step 2: Streaks (horizontal red/blue smear)**

Target: long horizontal light trails with bands of different lengths.

Knobs:
- `180.0`: band density
- `0.22`: max length

- [ ] **Step 3: Smoke and melt (watercolor bloom, drips)**

Smoke should stay soft, with no visible repeating tiles.
- Knobs: curl scale `3.0`, strength `0.012`

Melt should drip from roughly a third of the columns.
- Knobs: `pow(n, 3.0)`, `0.18`

- [ ] **Step 4: Blend in (torn collage)**

Default preset on a pasted scrap: the edge reads as torn or soft paper rather than a digital cut.

Knobs:
- `smoothstep(0.3, 0.9, …)`: feather curve
- `0.035`: bleed reach
- `l * 55.0`: bleed grain size

- [ ] **Step 5: Commit**

```bash
git add lib/renderer/shaders.ts
git commit -m "tune(shaders): recipe constants matched to 99tt reference board"
```

---

### Task 17: Final verification

- [ ] **Step 1: Full check**

Run: `npm run typecheck && npm test && npm run build`
Expected: no type errors, all tests PASS, and the production build succeeds.

- [ ] **Step 2: Update README**

Replace `README.md`:

```markdown
# 09tt

Paint layers, paste collage scraps, blend them in, and tell each layer how to move.

- `npm run dev` → http://localhost:3000/studio
- `npm test` — pure logic (recipes, geometry, brush, color, motion)
- Paste / drop / "Image" to add a layer from an image; `move` tool + Scale to place it
- Flow: smoke · melt · streaks · shimmer · rush — Transform: drift · pulse · turn · breathe
- Blend in: feather · color match · edge bleed; blend modes; painting grain

Spec: `docs/superpowers/specs/2026-08-28-flowing-abstract-canvas-design.md`
Plans: `docs/superpowers/plans/`
```

- [ ] **Step 2b: Commit**

```bash
git add README.md
git commit -m "docs: README for the local motion canvas"
```

---

## Out of scope for Plan 1 (covered in Plans 2–3)

- Convex, edit keys, live strokes across devices, snapshot bake, `/p/{id}` share viewer (Plan 2)
- Circle-to-point, extract-by-circle, chat, MCP, Playwright smoke (Plan 3)
- Persistence: refreshing `/studio` starts a new painting. That's expected until Plan 2.

## Known risks carried forward

- **GPU memory.** Each layer is ~21 MB with mips, plus ~42 MB for the compositor. Warn at 16 layers in Plan 2.
- **Per-frame cost.** One full 2048² pass per visible layer. If iPad fps is low (Task 15), composite at display resolution.
- **Undo.** Undo replays every stroke on the layer. Plan 2's snapshot bake keeps this bounded.
