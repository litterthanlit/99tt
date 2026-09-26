# Plan 2 — Live Document Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan 1's studio becomes one live Convex painting at `/p/{id}`. Every stroke, layer edit, recipe, blend-in setting and playback change syncs to every open browser. The painter holds an edit key. Anyone with the plain link watches strokes and motion live but cannot edit.

**Architecture:** Convex is the source of truth. One query, `paintings.load`, returns the painting, its layers and each layer's live (unbaked) strokes in one consistent read. Edits are mutations that take the Plan 1 shapes (`LayerPatch`, the reducer `Action`s) and check them with the Plan 1 validators (`makeFlow`, `makeTransform`, `makeHarmonize`), so the rules live in one place. Pixels still belong to the WebGL renderer. Each layer texture is a **snapshot PNG** (Convex storage) plus the **live strokes** of the snapshot's generation replayed on top. A pure `LiveSync` controller keeps every layer surface equal to snapshot + server strokes + local pending strokes, and bakes idle layers into new snapshots. The renderer, shaders and motion math from Plan 1 are unchanged.

**Tech Stack:** Plan 1 (Next.js 16, React 19, raw WebGL2, Vitest) + Convex (`convex`, `convex-test`, `@edge-runtime/vm`).

**Spec:** `docs/superpowers/specs/2026-08-28-flowing-abstract-canvas-design.md` (Access, Data flow, Schema, Errors) and the 2026-09-25 addendum, items 8 and 10.

**Built on:** Plan 1 as merged in litterthanlit/99tt#1 (`main` at `fa26fcb`).

---

## Roadmap

| Plan | Delivers | Status |
| --- | --- | --- |
| 1 — Motion canvas | Local studio: paint, paste, place, blend in, animate | Merged. Visual checks (Tasks 12–16) still to do locally |
| **2 — Live document (this file)** | Convex schema + edit key, live strokes, snapshot bake, `/p/{id}` editor and viewer | Ready |
| 3 — Circle + agent | Circle hit-test and focus, extract-by-circle (Node action on snapshots), shared tool surface (+ `set_blend`, `blend_in`), AI SDK chat, MCP stdio server, Playwright smoke | Written after Plan 2 |

## Where this plan departs from the spec, and why

| Spec says | Plan 2 does | Why |
| --- | --- | --- |
| Bake a layer after **1500 ms** idle | After 1.5 s idle, bake all but the **16 newest** strokes, and only once a layer has more than 32. After **20 s** idle, bake everything (`lib/live/bakePolicy.ts`). | Baked strokes can't be undone. A full bake every 1.5 s would make undo useless. Cold loads still replay at most a few dozen strokes, and Plan 3's extract gets a fully baked layer after 20 s. |
| Edit key "generated at create time" | The **browser** generates the key (`crypto.getRandomValues`) and sends it to `paintings.create`, which stores only its SHA-256 | Keeps the mutation deterministic. The client already holds the key to store before navigating. The server still never stores it. |
| Undo = "delete last stroke on the active layer" | Undo removes **this client's** newest live stroke on the active layer | With two editors, "last stroke" might be someone else's. |
| Snapshot commit bumps the generation | Commit names the strokes it baked (`bakedClientIds`). The server deletes those and **moves every other live stroke to the new generation**, and refuses the bake if any named stroke is gone | Closes the race where a stroke lands (or is undone) between the readback and the commit. Nothing is lost or drawn twice. |
| Strokes: color, size, opacity, points | Also `clientId` (stable id across clients) and `erase` | `clientId` dedupes a client's own strokes and targets undo. `erase` is Plan 1's eraser. |
| Subscribe to painting + layers | One `paintings.load` query returns painting + layers + live strokes | One consistent snapshot per update, so a layer's generation and its stroke list can never disagree. |
| Image import (addendum 3) | The browser draws the image onto a transparent 2048² canvas and uploads it as the new layer's **generation-0 snapshot** | Imports travel through the same path as baked paint, with no extra table. |
| `/studio` | Redirects to `/`. The landing page creates a live painting | One code path. |

## Conventions (additions to Plan 1)

- **Ids.** Convex ids are plain strings in the Plan 1 `Painting`/`Layer` shapes. The UI never parses them. `paintings.load` and `checkKey` take the id as a raw string, so a bad URL returns `null` rather than a validator error.
- **Errors.** User-facing errors are `ConvexError(message)`. The shared lib throws `RecipeError`, and `validated()` in `convex/model.ts` converts it. The client shows `errorMessage(e)` in the status pill.
- **Generation contract.** A layer at generation *g* is its snapshot (if any) plus its strokes with `generation === g`, oldest first. New strokes always get the layer's current generation, set on the server and never by the client. After a commit, strokes of an older generation no longer exist.
- **Snapshot PNG.** 2048×2048 in **layer space** (placement is metadata), straight alpha, row 0 = top. Encode by unpremultiplying the WebGL readback. Decode with `createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' })`. WebGL ignores `UNPACK_PREMULTIPLY_ALPHA_WEBGL` for ImageBitmaps (checked in Chromium: with `'none'` a half-alpha red texel comes back as `255,0,0,128`; with `'premultiply'` it round-trips exactly).
- **Random ids** come from `newId()` (`lib/util/id.ts`), never `crypto.randomUUID()`, which Safari only exposes on secure origins. Plan 1's iPad check (Task 15) runs on plain `http://<lan-ip>`.
- **Convex files.** Files in `convex/` import shared code from `../lib/...` (relative). The `lib` files keep their `@/` imports, which `convex/tsconfig.json` maps with `paths`. Convex skips files with more than one dot in the name, so `*.test.ts` and `test.setup.ts` are never deployed.

## File map

```
convex/tsconfig.json            Convex typecheck config (+ @/ paths)
convex/schema.ts                paintings / layers / strokes + shared field validators
convex/model.ts                 fail(), validated(), requireEditor(), requireLayer(), layersOf(), liveStrokes()
convex/paintings.ts             create, load, checkKey, setPlayback, setGrain, setBackground, focus
convex/layers.ts                add, remove, move, patch
convex/strokes.ts               add, remove (undo)
convex/snapshots.ts             generateUploadUrl, commit
convex/test.setup.ts            function modules for convex-test
convex/*.test.ts                convex-test suites
lib/doc/editKey.ts              generate / hash / check edit keys
lib/doc/wire.ts                 Plan 1 Layer ⇄ flat Convex fields, patch validation
lib/brush/capPoints.ts          ≤512 points per stored stroke
lib/live/strokeSync.ts          planSync: append vs replay
lib/live/bakePolicy.ts          when and how much to bake
lib/live/coalesce.ts            rate-limit drag edits
lib/live/sync.ts                LiveSync controller
lib/live/doc.ts                 load() result → Painting / sync layers
lib/live/keyStore.ts            localStorage key + ?k= handling
lib/live/errors.ts              user-facing error text
lib/live/useLiveApi.ts          mutations + optimistic updates
lib/image/pixels.ts             unpremultiply
lib/image/png.ts                encode / decode snapshots, image → snapshot
lib/util/id.ts                  newId()
lib/renderer/surface.ts         (replace) snapshot + stroke sync + readback
lib/renderer/renderer.ts        (edit) onRestored hook
components/ConvexClientProvider.tsx
components/NewPainting.tsx      landing button: create + store key + navigate
components/LivePainting.tsx     load query, key check, not-found
components/Studio.tsx           (replace) live editor / viewer
components/PaintCanvas.tsx      (replace) stroke ids, onStroke, pan tool, renderer callbacks
components/Toolbar.tsx          (replace) share links, view-only bar
app/layout.tsx, app/page.tsx, app/studio/page.tsx (replace), app/p/[id]/page.tsx (new), app/globals.css (append)
```

---

### Task 0: Convex project and test runner

**Files:**
- Modify: `package.json`, `vitest.config.mts`, `eslint.config.mjs`
- Create: `convex/tsconfig.json`, `convex/test.setup.ts`, `convex/_generated/*` (generated), `.env.local` (generated, gitignored)

- [ ] **Step 1: Install**

```bash
npm i convex
npm i -D convex-test @edge-runtime/vm
```

- [ ] **Step 2: Create the Convex deployment**

Run `npx convex dev` and follow the prompts. Either log in and create a project named `99tt`, or choose a local deployment. Stop it with Ctrl-C once it prints that functions are ready. It writes `.env.local` (`CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`) and `convex/_generated/`.

Cloud sessions without a Convex login can generate the types offline instead:

```bash
npx convex codegen --system-udfs --typecheck disable
```

(`--system-udfs` is a hidden CLI flag that skips the deployment. Use it only for codegen. Nothing is deployed.)

From Task 2 on, keep `npx convex dev` running in a second terminal: it regenerates `convex/_generated` and pushes functions on every save. Without it, re-run the codegen command after each change under `convex/`.

- [ ] **Step 3: Replace `convex/tsconfig.json`**

```jsonc
{
  /* This TypeScript project config describes the environment that
   * Convex functions run in and is used to typecheck them.
   * You can modify it, but some settings are required to use Convex.
   */
  "compilerOptions": {
    /* These settings are not required by Convex and can be modified. */
    "allowJs": true,
    "strict": true,
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    /* 99tt: Convex functions import shared logic from ../lib, which uses the @/ alias. */
    "paths": { "@/*": ["../*"] },

    /* These compiler options are required by Convex */
    "target": "ESNext",
    "lib": ["ES2023", "dom"],
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["./**/*"],
  "exclude": ["./_generated"]
}
```

- [ ] **Step 4: Create `convex/test.setup.ts`**

```ts
/// <reference types="vite/client" />
// Function modules for convex-test. (The `!(*.*.*)` pattern from the Convex docs matches nothing under Vite 8.)
export const modules = import.meta.glob(['./**/*.*s', '!./**/*.test.*s'])
```

- [ ] **Step 5: Replace `vitest.config.mts`**

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(fileURLToPath(new URL('.', import.meta.url))) } },
  test: {
    include: ['lib/**/*.test.ts', 'convex/**/*.test.ts'],
    server: { deps: { inline: ['convex-test'] } },
  },
})
```

- [ ] **Step 6: Replace `eslint.config.mjs`**

Ignore generated Convex code, and allow `_`-prefixed names (used to drop fields by destructuring).

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Convex codegen output
    "convex/_generated/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
]);

export default eslintConfig;
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test && npm run lint`
Expected: no errors, and Plan 1's 58 tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: add Convex, convex-test and edge-runtime test setup"
```

---

### Task 1: Edit keys and the wire format

**Files:**
- Create: `lib/doc/editKey.ts`, `lib/doc/wire.ts`
- Test: `lib/doc/editKey.test.ts`, `lib/doc/wire.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/doc/editKey.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateEditKey, hashEditKey, isEditKey } from './editKey'

describe('edit key', () => {
  it('generates 32 hex chars, different each time', () => {
    const a = generateEditKey()
    expect(isEditKey(a)).toBe(true)
    expect(generateEditKey()).not.toBe(a)
  })
  it('hashes with SHA-256', async () => {
    expect(await hashEditKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
  it('rejects junk', () => {
    expect(isEditKey('XYZ')).toBe(false)
    expect(isEditKey('a'.repeat(31))).toBe(false)
  })
})
```

`lib/doc/wire.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createLayer } from './painting'
import { BLEND_IN_PRESET, makeFlow } from './recipes'
import { checkBackground, layerFromFields, layerToFields, paintingFromFields, patchToFields } from './wire'

describe('layer fields', () => {
  it('round-trips a layer', () => {
    const layer = { ...createLayer('L', 'Sky'), flow: makeFlow('rush', { seed: 5, originX: 0.3 }), harmonize: BLEND_IN_PRESET }
    const { id, ...rest } = layer
    expect(layerFromFields(id, layerToFields(rest))).toEqual(layer)
  })
})

describe('patchToFields', () => {
  it('flattens and clamps', () => {
    expect(patchToFields({ opacity: 4, place: { x: 10, y: -5, scale: 99 } })).toEqual({ opacity: 1, placeX: 10, placeY: -5, placeScale: 10 })
  })
  it('validates recipes through the Plan 1 constructors', () => {
    const f = patchToFields({ flow: { recipe: 'melt', speed: 1, intensity: 2, direction: -90, seed: 3, originX: 0.5, originY: 0.5 } })
    expect(f).toMatchObject({ flow: 'melt', flowIntensity: 1, flowDirection: 270, flowSeed: 3 })
    expect(() => patchToFields({ flow: { ...makeFlow('smoke', {}, () => 1), recipe: 'vortex' as never } })).toThrow('Unknown recipe')
  })
  it('rejects bad names, blends and numbers', () => {
    expect(() => patchToFields({ name: '   ' })).toThrow('Bad name')
    expect(patchToFields({ name: '  Sky ' })).toEqual({ name: 'Sky' })
    expect(() => patchToFields({ blend: 'dissolve' as never })).toThrow('Unknown blend mode')
    expect(() => patchToFields({ opacity: NaN })).toThrow('Bad opacity')
  })
  it('leaves untouched fields out', () => {
    expect(patchToFields({ visible: false })).toEqual({ visible: false })
  })
})

describe('paintingFromFields', () => {
  it('builds the Plan 1 Painting', () => {
    const { id, ...rest } = createLayer('L1', 'Layer 1')
    const p = paintingFromFields(
      { width: 2048, height: 2048, playing: false, startedAt: 5, pausedElapsed: 2, grain: 0.2, background: '#ffffff' },
      [{ id, fields: layerToFields(rest) }],
    )
    expect(p).toMatchObject({ focusedLayerId: null, pausedElapsed: 2, grain: 0.2 })
    expect(p.layers[0].id).toBe('L1')
  })
})

describe('checkBackground', () => {
  it('accepts #rrggbb only', () => {
    expect(checkBackground('#AABBCC')).toBe('#aabbcc')
    expect(() => checkBackground('red')).toThrow('Bad color')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/doc`
Expected: FAIL, unresolved imports `./editKey` and `./wire`.

- [ ] **Step 3: Implement `lib/doc/editKey.ts`**

```ts
const KEY_RE = /^[0-9a-f]{32}$/

export const isEditKey = (s: string) => KEY_RE.test(s)

/** 32 lowercase hex chars (128 bits). */
export function generateEditKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 of the key, as lowercase hex. Convex stores only this. */
export async function hashEditKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 4: Implement `lib/doc/wire.ts`**

```ts
import { clamp, clamp01 } from '@/lib/util/math'
import type { LayerPatch } from './painting'
import { isBlendMode, makeFlow, makeHarmonize, makeTransform, RecipeError } from './recipes'
import type { BlendMode, FlowRecipe, Layer, Painting, TransformRecipe } from './types'

/** Flat layer fields as stored in Convex (see convex/schema.ts). */
export interface LayerFields {
  name: string
  visible: boolean
  opacity: number
  blend: BlendMode
  placeX: number
  placeY: number
  placeScale: number
  flow: FlowRecipe
  flowSpeed: number
  flowIntensity: number
  flowDirection: number
  flowSeed: number
  flowOriginX: number
  flowOriginY: number
  transform: TransformRecipe
  transformSpeed: number
  transformIntensity: number
  transformDirection: number
  harmonizeFeather: number
  harmonizeColorMatch: number
  harmonizeBleed: number
}

/** Painting fields every client may read (never the edit key hash). */
export interface PaintingFields {
  width: number
  height: number
  playing: boolean
  startedAt: number
  pausedElapsed: number
  focusedLayerId?: string
  grain: number
  background: string
}

export const MIN_SCALE = 0.05
export const MAX_SCALE = 10
const HEX_RE = /^#[0-9a-f]{6}$/i

export function layerToFields(l: Omit<Layer, 'id'>): LayerFields {
  return {
    name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend,
    placeX: l.place.x, placeY: l.place.y, placeScale: l.place.scale,
    flow: l.flow.recipe, flowSpeed: l.flow.speed, flowIntensity: l.flow.intensity, flowDirection: l.flow.direction,
    flowSeed: l.flow.seed, flowOriginX: l.flow.originX, flowOriginY: l.flow.originY,
    transform: l.transform.recipe, transformSpeed: l.transform.speed, transformIntensity: l.transform.intensity,
    transformDirection: l.transform.direction,
    harmonizeFeather: l.harmonize.feather, harmonizeColorMatch: l.harmonize.colorMatch, harmonizeBleed: l.harmonize.bleed,
  }
}

export function layerFromFields(id: string, f: LayerFields): Layer {
  return {
    id, name: f.name, visible: f.visible, opacity: f.opacity, blend: f.blend,
    place: { x: f.placeX, y: f.placeY, scale: f.placeScale },
    flow: {
      recipe: f.flow, speed: f.flowSpeed, intensity: f.flowIntensity, direction: f.flowDirection,
      seed: f.flowSeed, originX: f.flowOriginX, originY: f.flowOriginY,
    },
    transform: { recipe: f.transform, speed: f.transformSpeed, intensity: f.transformIntensity, direction: f.transformDirection },
    harmonize: { feather: f.harmonizeFeather, colorMatch: f.harmonizeColorMatch, bleed: f.harmonizeBleed },
  }
}

const finite = (v: number, what: string) => {
  if (!Number.isFinite(v)) throw new RecipeError(`Bad ${what}`)
  return v
}

/** Validates and clamps a patch; returns only the flat fields it touches. */
export function patchToFields(p: LayerPatch): Partial<LayerFields> {
  const out: Partial<LayerFields> = {}
  if (p.name !== undefined) {
    const name = p.name.trim().slice(0, 64)
    if (!name) throw new RecipeError('Bad name')
    out.name = name
  }
  if (p.visible !== undefined) out.visible = p.visible
  if (p.opacity !== undefined) out.opacity = clamp01(finite(p.opacity, 'opacity'))
  if (p.blend !== undefined) {
    if (!isBlendMode(p.blend)) throw new RecipeError(`Unknown blend mode: ${p.blend}`)
    out.blend = p.blend
  }
  if (p.place) {
    out.placeX = finite(p.place.x, 'place')
    out.placeY = finite(p.place.y, 'place')
    out.placeScale = clamp(finite(p.place.scale, 'place'), MIN_SCALE, MAX_SCALE)
  }
  if (p.flow) {
    const f = makeFlow(p.flow.recipe, p.flow)
    Object.assign(out, {
      flow: f.recipe, flowSpeed: f.speed, flowIntensity: f.intensity, flowDirection: f.direction,
      flowSeed: f.seed, flowOriginX: f.originX, flowOriginY: f.originY,
    })
  }
  if (p.transform) {
    const t = makeTransform(p.transform.recipe, p.transform)
    Object.assign(out, { transform: t.recipe, transformSpeed: t.speed, transformIntensity: t.intensity, transformDirection: t.direction })
  }
  if (p.harmonize) {
    const h = makeHarmonize(p.harmonize)
    Object.assign(out, { harmonizeFeather: h.feather, harmonizeColorMatch: h.colorMatch, harmonizeBleed: h.bleed })
  }
  return out
}

export function checkBackground(color: string): string {
  if (!HEX_RE.test(color)) throw new RecipeError(`Bad color: ${color}`)
  return color.toLowerCase()
}

/** Server docs → the Plan 1 Painting shape the renderer and UI already use. */
export function paintingFromFields(p: PaintingFields, layers: { id: string; fields: LayerFields }[]): Painting {
  return {
    width: p.width, height: p.height,
    layers: layers.map(l => layerFromFields(l.id, l.fields)),
    focusedLayerId: p.focusedLayerId ?? null,
    playing: p.playing, startedAt: p.startedAt, pausedElapsed: p.pausedElapsed,
    grain: p.grain, background: p.background,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/doc`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/doc
git commit -m "feat(doc): edit keys and flat Convex wire format for layers"
```

---

### Task 2: Schema, access and paintings

**Files:**
- Create: `convex/schema.ts`, `convex/model.ts`, `convex/paintings.ts`
- Test: `convex/paintings.test.ts`

- [ ] **Step 1: Write `convex/schema.ts`**

```ts
import { defineSchema, defineTable } from 'convex/server'
import { v, type Validator } from 'convex/values'
import { BLEND_MODES, FLOW_RECIPES, TRANSFORM_RECIPES } from '../lib/doc/types'

function literals<T extends string>(values: readonly T[]) {
  return v.union(...values.map(x => v.literal(x))) as Validator<T>
}

export const paintingFields = {
  width: v.number(),
  height: v.number(),
  playing: v.boolean(),
  startedAt: v.number(),
  pausedElapsed: v.number(),
  focusedLayerId: v.optional(v.id('layers')),
  grain: v.number(),
  background: v.string(),
}

/** Must match LayerFields in lib/doc/wire.ts. */
export const layerFields = {
  name: v.string(),
  visible: v.boolean(),
  opacity: v.number(),
  blend: literals(BLEND_MODES),
  placeX: v.number(),
  placeY: v.number(),
  placeScale: v.number(),
  flow: literals(FLOW_RECIPES),
  flowSpeed: v.number(),
  flowIntensity: v.number(),
  flowDirection: v.number(),
  flowSeed: v.number(),
  flowOriginX: v.number(),
  flowOriginY: v.number(),
  transform: literals(TRANSFORM_RECIPES),
  transformSpeed: v.number(),
  transformIntensity: v.number(),
  transformDirection: v.number(),
  harmonizeFeather: v.number(),
  harmonizeColorMatch: v.number(),
  harmonizeBleed: v.number(),
}

export const strokePoint = v.object({ x: v.number(), y: v.number(), pressure: v.number() })

export const strokeFields = {
  clientId: v.string(),
  color: v.string(),
  size: v.number(),
  opacity: v.number(),
  erase: v.boolean(),
  points: v.array(strokePoint),
}

export default defineSchema({
  paintings: defineTable({ ...paintingFields, editKeyHash: v.string(), createdAt: v.number() }),
  layers: defineTable({
    paintingId: v.id('paintings'),
    order: v.number(),
    snapshotId: v.optional(v.id('_storage')),
    snapshotGeneration: v.number(),
    ...layerFields,
  }).index('by_painting_and_order', ['paintingId', 'order']),
  strokes: defineTable({
    paintingId: v.id('paintings'),
    layerId: v.id('layers'),
    generation: v.number(),
    ...strokeFields,
  }).index('by_layer_and_generation', ['layerId', 'generation']),
})
```

- [ ] **Step 2: Write `convex/model.ts`**

```ts
import { ConvexError } from 'convex/values'
import { hashEditKey } from '../lib/doc/editKey'
import { RecipeError } from '../lib/doc/recipes'
import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'

/** Errors the UI, chat and MCP show as-is. */
export const fail = (message: string): never => {
  throw new ConvexError(message)
}

/** Runs shared lib validation and turns its errors into user-facing ones. */
export function validated<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof RecipeError) fail(e.message)
    throw e
  }
}

export async function requireEditor(ctx: QueryCtx, paintingId: Id<'paintings'>, editKey: string): Promise<Doc<'paintings'>> {
  const painting = await ctx.db.get(paintingId)
  if (!painting) return fail('Painting not found')
  if ((await hashEditKey(editKey)) !== painting.editKeyHash) return fail('Unauthorized')
  return painting
}

export async function requireLayer(ctx: QueryCtx, paintingId: Id<'paintings'>, layerId: Id<'layers'>): Promise<Doc<'layers'>> {
  const layer = await ctx.db.get(layerId)
  if (!layer || layer.paintingId !== paintingId) return fail('Layer not found')
  return layer
}

/** Bottom → top. */
export function layersOf(ctx: QueryCtx, paintingId: Id<'paintings'>) {
  return ctx.db
    .query('layers')
    .withIndex('by_painting_and_order', q => q.eq('paintingId', paintingId))
    .collect()
}

export function liveStrokes(ctx: QueryCtx, layer: Doc<'layers'>) {
  return ctx.db
    .query('strokes')
    .withIndex('by_layer_and_generation', q => q.eq('layerId', layer._id).eq('generation', layer.snapshotGeneration))
    .collect()
}
```

- [ ] **Step 3: Write the failing test**

`convex/paintings.test.ts`:

```ts
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

const KEY = 'a'.repeat(32)
const WRONG = 'b'.repeat(32)

async function setup() {
  const t = convexTest(schema, modules)
  const { paintingId, layerId } = await t.mutation(api.paintings.create, { editKey: KEY })
  return { t, paintingId, layerId, edit: { paintingId, editKey: KEY } }
}

describe('paintings', () => {
  it('creates a playing 2048² painting with Layer 1 focused, and never leaks the key hash', async () => {
    const { t, paintingId, layerId } = await setup()
    const doc = await t.query(api.paintings.load, { paintingId })
    expect(doc!.painting).toMatchObject({ width: 2048, height: 2048, playing: true, pausedElapsed: 0, focusedLayerId: layerId, grain: 0 })
    expect(doc!.painting).not.toHaveProperty('editKeyHash')
    expect(doc!.layers).toHaveLength(1)
    expect(doc!.layers[0]).toMatchObject({ name: 'Layer 1', snapshotGeneration: 0, snapshotUrl: null, strokes: [] })
  })
  it('stores only the SHA-256 of the key', async () => {
    const { t, paintingId } = await setup()
    const raw = await t.run(ctx => ctx.db.get(paintingId))
    expect(raw!.editKeyHash).toHaveLength(64)
    expect(raw!.editKeyHash).not.toContain(KEY)
  })
  it('rejects malformed keys at create', async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(api.paintings.create, { editKey: 'short' })).rejects.toThrow('Bad edit key')
  })
  it('load returns null for unknown or malformed ids', async () => {
    const { t } = await setup()
    expect(await t.query(api.paintings.load, { paintingId: 'nope' })).toBeNull()
  })
  it('checkKey tells editors from viewers', async () => {
    const { t, paintingId } = await setup()
    expect(await t.query(api.paintings.checkKey, { paintingId, editKey: KEY })).toBe(true)
    expect(await t.query(api.paintings.checkKey, { paintingId, editKey: WRONG })).toBe(false)
  })
  it('every edit needs the key', async () => {
    const { t, paintingId } = await setup()
    await expect(t.mutation(api.paintings.setGrain, { paintingId, editKey: WRONG, grain: 0.5 })).rejects.toThrow('Unauthorized')
  })
  it('pause freezes elapsed time, play restarts the clock', async () => {
    const { t, paintingId, edit } = await setup()
    await t.run(ctx => ctx.db.patch(paintingId, { startedAt: Date.now() - 4000 }))
    await t.mutation(api.paintings.setPlayback, { ...edit, playing: false })
    let p = (await t.query(api.paintings.load, { paintingId }))!.painting
    expect(p.playing).toBe(false)
    expect(p.pausedElapsed).toBeGreaterThanOrEqual(4)
    expect(p.pausedElapsed).toBeLessThan(5)
    await t.mutation(api.paintings.setPlayback, { ...edit, playing: true })
    p = (await t.query(api.paintings.load, { paintingId }))!.painting
    expect(p.playing).toBe(true)
    expect(Math.abs(p.startedAt - Date.now())).toBeLessThan(1000)
  })
  it('clamps grain and validates the background', async () => {
    const { t, paintingId, edit } = await setup()
    await t.mutation(api.paintings.setGrain, { ...edit, grain: 7 })
    await t.mutation(api.paintings.setBackground, { ...edit, color: '#112233' })
    expect((await t.query(api.paintings.load, { paintingId }))!.painting).toMatchObject({ grain: 1, background: '#112233' })
    await expect(t.mutation(api.paintings.setBackground, { ...edit, color: 'red' })).rejects.toThrow('Bad color')
  })
})
```

Run codegen (or let `npx convex dev` do it), then `npx vitest run convex`.
Expected: FAIL, `api.paintings` does not exist.

- [ ] **Step 4: Implement `convex/paintings.ts`**

```ts
import { v } from 'convex/values'
import { hashEditKey, isEditKey } from '../lib/doc/editKey'
import { createLayer, elapsedSeconds } from '../lib/doc/painting'
import { PAINTING_SIZE } from '../lib/doc/types'
import { checkBackground, layerToFields } from '../lib/doc/wire'
import { clamp01 } from '../lib/util/math'
import { mutation, query } from './_generated/server'
import { fail, layersOf, liveStrokes, requireEditor, requireLayer, validated } from './model'
import { layerFields, paintingFields, strokeFields } from './schema'

const DEFAULT_BACKGROUND = '#f3efe6'

const editArgs = { paintingId: v.id('paintings'), editKey: v.string() }

export const create = mutation({
  args: { editKey: v.string() },
  returns: v.object({ paintingId: v.id('paintings'), layerId: v.id('layers') }),
  handler: async (ctx, { editKey }) => {
    if (!isEditKey(editKey)) fail('Bad edit key')
    const now = Date.now()
    const paintingId = await ctx.db.insert('paintings', {
      width: PAINTING_SIZE, height: PAINTING_SIZE, playing: true, startedAt: now, pausedElapsed: 0,
      grain: 0, background: DEFAULT_BACKGROUND, editKeyHash: await hashEditKey(editKey), createdAt: now,
    })
    const { id: _, ...first } = createLayer('', 'Layer 1')
    const layerId = await ctx.db.insert('layers', { paintingId, order: 0, snapshotGeneration: 0, ...layerToFields(first) })
    await ctx.db.patch(paintingId, { focusedLayerId: layerId })
    return { paintingId, layerId }
  },
})

const liveLayer = v.object({
  _id: v.id('layers'),
  order: v.number(),
  snapshotGeneration: v.number(),
  snapshotUrl: v.union(v.string(), v.null()),
  ...layerFields,
  strokes: v.array(v.object({ _id: v.id('strokes'), ...strokeFields })),
})

/** Everything a client needs to draw the painting. Takes a raw string so a bad URL gives null, not a crash. */
export const load = query({
  args: { paintingId: v.string() },
  returns: v.union(v.null(), v.object({ painting: v.object({ _id: v.id('paintings'), ...paintingFields }), layers: v.array(liveLayer) })),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('paintings', args.paintingId)
    const doc = id && (await ctx.db.get(id))
    if (!doc) return null
    const { editKeyHash: _hash, createdAt: _created, _creationTime: _t, ...painting } = doc
    const layers = await Promise.all(
      (await layersOf(ctx, doc._id)).map(async layer => {
        const { paintingId: _p, snapshotId, _creationTime: _lt, ...rest } = layer
        const strokes = (await liveStrokes(ctx, layer)).map(({ _id, clientId, color, size, opacity, erase, points }) => ({
          _id, clientId, color, size, opacity, erase, points,
        }))
        return { ...rest, snapshotUrl: snapshotId ? await ctx.storage.getUrl(snapshotId) : null, strokes }
      }),
    )
    return { painting, layers }
  },
})

/** Lets a browser check a stored or pasted key before showing edit tools. */
export const checkKey = query({
  args: { paintingId: v.string(), editKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('paintings', args.paintingId)
    const doc = id && (await ctx.db.get(id))
    return !!doc && isEditKey(args.editKey) && (await hashEditKey(args.editKey)) === doc.editKeyHash
  },
})

export const setPlayback = mutation({
  args: { ...editArgs, playing: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { paintingId, editKey, playing }) => {
    const p = await requireEditor(ctx, paintingId, editKey)
    if (p.playing === playing) return null
    const now = Date.now()
    await ctx.db.patch(paintingId, playing ? { playing, startedAt: now } : { playing, pausedElapsed: elapsedSeconds(p, now) })
    return null
  },
})

export const setGrain = mutation({
  args: { ...editArgs, grain: v.number() },
  returns: v.null(),
  handler: async (ctx, { paintingId, editKey, grain }) => {
    await requireEditor(ctx, paintingId, editKey)
    if (!Number.isFinite(grain)) fail('Bad grain')
    await ctx.db.patch(paintingId, { grain: clamp01(grain) })
    return null
  },
})

export const setBackground = mutation({
  args: { ...editArgs, color: v.string() },
  returns: v.null(),
  handler: async (ctx, { paintingId, editKey, color }) => {
    await requireEditor(ctx, paintingId, editKey)
    await ctx.db.patch(paintingId, { background: validated(() => checkBackground(color)) })
    return null
  },
})

export const focus = mutation({
  args: { ...editArgs, layerId: v.id('layers') },
  returns: v.null(),
  handler: async (ctx, { paintingId, editKey, layerId }) => {
    await requireEditor(ctx, paintingId, editKey)
    await requireLayer(ctx, paintingId, layerId)
    await ctx.db.patch(paintingId, { focusedLayerId: layerId })
    return null
  },
})
```

- [ ] **Step 5: Regenerate and run the tests**

Run: `npx convex dev --once` (or the offline codegen), then `npx vitest run convex && npm run typecheck`
Expected: PASS (8 tests), with no type errors.

- [ ] **Step 6: Commit**

```bash
git add convex
git commit -m "feat(convex): schema, edit-key access and painting functions"
```

---

### Task 3: Layer mutations

**Files:**
- Create: `convex/layers.ts`
- Test: `convex/layers.test.ts`

- [ ] **Step 1: Write the failing test**

`convex/layers.test.ts`:

```ts
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { makeFlow } from '../lib/doc/recipes'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

const KEY = 'a'.repeat(32)

async function setup() {
  const t = convexTest(schema, modules)
  const { paintingId, layerId } = await t.mutation(api.paintings.create, { editKey: KEY })
  const edit = { paintingId, editKey: KEY }
  const load = async () => (await t.query(api.paintings.load, { paintingId }))!
  return { t, paintingId, layerId, edit, load }
}

describe('layers', () => {
  it('adds on top and focuses the new layer', async () => {
    const { t, edit, load } = await setup()
    const id = await t.mutation(api.layers.add, edit)
    const doc = await load()
    expect(doc.layers.map(l => l.name)).toEqual(['Layer 1', 'Layer 2'])
    expect(doc.painting.focusedLayerId).toBe(id)
  })
  it('refuses to remove the last layer', async () => {
    const { t, edit, layerId } = await setup()
    await expect(t.mutation(api.layers.remove, { ...edit, layerId })).rejects.toThrow('Cannot remove the last layer')
  })
  it('removing the focused layer focuses the new top and deletes its strokes and snapshot', async () => {
    const { t, edit, layerId, load } = await setup()
    const snapshotId = await t.run(ctx => ctx.storage.store(new Blob(['png'])))
    const l2 = await t.mutation(api.layers.add, { ...edit, name: 'Scrap', snapshotId })
    await t.run(ctx =>
      ctx.db.insert('strokes', {
        paintingId: edit.paintingId, layerId: l2, generation: 0,
        clientId: 's1', color: '#000000', size: 4, opacity: 1, erase: false, points: [{ x: 1, y: 1, pressure: 1 }],
      }),
    )
    await t.mutation(api.layers.remove, { ...edit, layerId: l2 })
    expect((await load()).painting.focusedLayerId).toBe(layerId)
    expect(await t.run(ctx => ctx.db.query('strokes').collect())).toEqual([])
    expect(await t.run(ctx => ctx.storage.get(snapshotId))).toBeNull()
  })
  it('moves a layer', async () => {
    const { t, edit, load } = await setup()
    const l2 = await t.mutation(api.layers.add, edit)
    await t.mutation(api.layers.move, { ...edit, layerId: l2, toIndex: 0 })
    expect((await load()).layers.map(l => l._id)[0]).toBe(l2)
  })
  it('patches with the same shape as the local reducer, clamped and validated', async () => {
    const { t, edit, layerId, load } = await setup()
    await t.mutation(api.layers.patch, {
      ...edit, layerId, patch: { opacity: 3, blend: 'multiply', flow: makeFlow('rush', { seed: 9, originX: 0.25 }) },
    })
    expect((await load()).layers[0]).toMatchObject({ opacity: 1, blend: 'multiply', flow: 'rush', flowSeed: 9, flowOriginX: 0.25 })
    await expect(t.mutation(api.layers.patch, { ...edit, layerId, patch: { transform: { recipe: 'wobble', speed: 1, intensity: 1, direction: 0 } } })).rejects.toThrow('Unknown recipe')
  })
  it('rejects a layer from another painting', async () => {
    const { t, edit } = await setup()
    const other = await t.mutation(api.paintings.create, { editKey: 'c'.repeat(32) })
    await expect(t.mutation(api.layers.patch, { ...edit, layerId: other.layerId, patch: { visible: false } })).rejects.toThrow('Layer not found')
  })
})
```

- [ ] **Step 2: Implement `convex/layers.ts`**

```ts
import { v } from 'convex/values'
import { createLayer } from '../lib/doc/painting'
import { layerToFields, patchToFields } from '../lib/doc/wire'
import { mutation } from './_generated/server'
import { fail, layersOf, requireEditor, requireLayer, validated } from './model'

const editArgs = { paintingId: v.id('paintings'), editKey: v.string() }
const knobs = { speed: v.number(), intensity: v.number(), direction: v.number() }

/** Same shape as LayerPatch in lib/doc/painting.ts; recipe names are checked by the Plan 1 constructors. */
const layerPatch = v.object({
  name: v.optional(v.string()),
  visible: v.optional(v.boolean()),
  opacity: v.optional(v.number()),
  blend: v.optional(v.string()),
  place: v.optional(v.object({ x: v.number(), y: v.number(), scale: v.number() })),
  flow: v.optional(v.object({ recipe: v.string(), ...knobs, seed: v.number(), originX: v.number(), originY: v.number() })),
  transform: v.optional(v.object({ recipe: v.string(), ...knobs })),
  harmonize: v.optional(v.object({ feather: v.number(), colorMatch: v.number(), bleed: v.number() })),
})

export const add = mutation({
  args: { ...editArgs, name: v.optional(v.string()), snapshotId: v.optional(v.id('_storage')) },
  returns: v.id('layers'),
  handler: async (ctx, { paintingId, editKey, name, snapshotId }) => {
    await requireEditor(ctx, paintingId, editKey)
    const layers = await layersOf(ctx, paintingId)
    const top = layers[layers.length - 1]
    const { id: _, ...layer } = createLayer('', `Layer ${layers.length + 1}`)
    const fields = { ...layerToFields(layer), ...(name !== undefined ? validated(() => patchToFields({ name })) : {}) }
    const layerId = await ctx.db.insert('layers', {
      paintingId, order: top ? top.order + 1 : 0, snapshotId, snapshotGeneration: 0, ...fields,
    })
    await ctx.db.patch(paintingId, { focusedLayerId: layerId })
    return layerId
  },
})

export const remove = mutation({
  args: { ...editArgs, layerId: v.id('layers') },
  returns: v.null(),
  handler: async (ctx, { paintingId, editKey, layerId }) => {
    const painting = await requireEditor(ctx, paintingId, editKey)
    const layer = await requireLayer(ctx, paintingId, layerId)
    const layers = await layersOf(ctx, paintingId)
    if (layers.length === 1) fail('Cannot remove the last layer')
    const strokes = await ctx.db.query('strokes').withIndex('by_layer_and_generation', q => q.eq('layerId', layerId)).collect()
    for (const s of strokes) await ctx.db.delete(s._id)
    if (layer.snapshotId) await ctx.storage.delete(layer.snapshotId)
    await ctx.db.delete(layerId)
    if (painting.focusedLayerId === layerId) {
      const rest = layers.filter(l => l._id !== layerId)
      await ctx.db.patch(paintingId, { focusedLayerId: rest[rest.length - 1]._id })
    }
    return null
  },
})

export const move = mutation({
  args: { ...editArgs, layerId: v.id('layers'), toIndex: v.number() },
  returns: v.null(),
  handler: async (ctx, { paintingId, editKey, layerId, toIndex }) => {
    await requireEditor(ctx, paintingId, editKey)
    await requireLayer(ctx, paintingId, layerId)
    const layers = await layersOf(ctx, paintingId)
    const i = layers.findIndex(l => l._id === layerId)
    const [layer] = layers.splice(i, 1)
    layers.splice(Math.max(0, Math.min(layers.length, Math.round(toIndex))), 0, layer)
    for (let j = 0; j < layers.length; j++) {
      if (layers[j].order !== j) await ctx.db.patch(layers[j]._id, { order: j })
    }
    return null
  },
})

export const patch = mutation({
  args: { ...editArgs, layerId: v.id('layers'), patch: layerPatch },
  returns: v.null(),
  handler: async (ctx, { paintingId, editKey, layerId, patch }) => {
    await requireEditor(ctx, paintingId, editKey)
    await requireLayer(ctx, paintingId, layerId)
    // Recipe and blend names arrive as plain strings; patchToFields rejects unknown ones.
    await ctx.db.patch(layerId, validated(() => patchToFields(patch as Parameters<typeof patchToFields>[0])))
    return null
  },
})
```

- [ ] **Step 3: Regenerate and run the tests**

Run: codegen, then `npx vitest run convex && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add convex
git commit -m "feat(convex): add, remove, reorder and patch layers with Plan 1 validation"
```

---

### Task 4: Strokes and snapshots

**Files:**
- Create: `lib/brush/capPoints.ts`, `convex/strokes.ts`, `convex/snapshots.ts`
- Test: `lib/brush/capPoints.test.ts`, `convex/strokes.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/brush/capPoints.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { capPoints } from './capPoints'

const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, pressure: 1 }))

describe('capPoints', () => {
  it('leaves short strokes alone', () => {
    const p = pts(512)
    expect(capPoints(p)).toBe(p)
  })
  it('resamples long strokes to the cap, keeping both ends', () => {
    const out = capPoints(pts(2000))
    expect(out).toHaveLength(512)
    expect(out[0].x).toBe(0)
    expect(out[511].x).toBe(1999)
    expect(out.every((p, i) => i === 0 || p.x > out[i - 1].x)).toBe(true)
  })
})
```

`convex/strokes.test.ts`:

```ts
// @vitest-environment edge-runtime
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { modules } from './test.setup'

const KEY = 'a'.repeat(32)

async function setup() {
  const t = convexTest(schema, modules)
  const { paintingId, layerId } = await t.mutation(api.paintings.create, { editKey: KEY })
  const edit = { paintingId, editKey: KEY }
  const stroke = (clientId: string) =>
    t.mutation(api.strokes.add, { ...edit, layerId, clientId, color: '#e2482d', size: 32, opacity: 1, erase: false, points: [{ x: 10, y: 10, pressure: 1 }] })
  const live = async () => (await t.query(api.paintings.load, { paintingId }))!.layers[0]
  const upload = () => t.run(ctx => ctx.storage.store(new Blob(['png'], { type: 'image/png' })))
  return { t, paintingId, layerId, edit, stroke, live, upload }
}

describe('strokes', () => {
  it('appear in load in insert order', async () => {
    const { stroke, live } = await setup()
    await stroke('a')
    await stroke('b')
    expect((await live()).strokes.map(s => s.clientId)).toEqual(['a', 'b'])
  })
  it('are validated', async () => {
    const { t, edit, layerId } = await setup()
    const base = { ...edit, layerId, clientId: 'x', color: '#000000', size: 4, opacity: 1, erase: false, points: [{ x: 0, y: 0, pressure: 1 }] }
    await expect(t.mutation(api.strokes.add, { ...base, points: [] })).rejects.toThrow('Bad stroke')
    await expect(t.mutation(api.strokes.add, { ...base, color: 'red' })).rejects.toThrow('Bad color')
    await expect(t.mutation(api.strokes.add, { ...base, opacity: 2 })).rejects.toThrow('Bad opacity')
    await expect(t.mutation(api.strokes.add, { ...base, editKey: 'b'.repeat(32) })).rejects.toThrow('Unauthorized')
  })
  it('undo removes a live stroke by client id', async () => {
    const { t, edit, layerId, stroke, live } = await setup()
    await stroke('a')
    expect(await t.mutation(api.strokes.remove, { ...edit, layerId, clientId: 'a' })).toBe(true)
    expect(await t.mutation(api.strokes.remove, { ...edit, layerId, clientId: 'a' })).toBe(false)
    expect((await live()).strokes).toEqual([])
  })
})

describe('snapshots', () => {
  it('commit bakes the named strokes and carries the rest to the new generation', async () => {
    const { t, edit, layerId, stroke, live, upload } = await setup()
    await stroke('a')
    await stroke('b')
    await stroke('c')
    const storageId = await upload()
    expect(await t.mutation(api.snapshots.commit, { ...edit, layerId, fromGeneration: 0, storageId, bakedClientIds: ['a', 'b'] })).toBe(true)
    const layer = await live()
    expect(layer.snapshotGeneration).toBe(1)
    expect(layer.snapshotUrl).toEqual(expect.any(String))
    expect(layer.strokes.map(s => s.clientId)).toEqual(['c'])
    expect(await t.run(ctx => ctx.db.query('strokes').collect())).toHaveLength(1)
  })
  it('new strokes land on the current generation', async () => {
    const { t, edit, layerId, stroke, upload } = await setup()
    await t.mutation(api.snapshots.commit, { ...edit, layerId, fromGeneration: 0, storageId: await upload(), bakedClientIds: [] })
    await stroke('late')
    const [s] = await t.run(ctx => ctx.db.query('strokes').collect())
    expect(s.generation).toBe(1)
  })
  it('replaces and deletes the previous snapshot file', async () => {
    const { t, edit, layerId, upload } = await setup()
    const first = await upload()
    await t.mutation(api.snapshots.commit, { ...edit, layerId, fromGeneration: 0, storageId: first, bakedClientIds: [] })
    await t.mutation(api.snapshots.commit, { ...edit, layerId, fromGeneration: 1, storageId: await upload(), bakedClientIds: [] })
    expect(await t.run(ctx => ctx.storage.get(first))).toBeNull()
  })
  it('a stale bake is refused and its upload deleted', async () => {
    const { t, edit, layerId, stroke, upload, live } = await setup()
    await stroke('a')
    const stale = await upload()
    expect(await t.mutation(api.snapshots.commit, { ...edit, layerId, fromGeneration: 3, storageId: stale, bakedClientIds: ['a'] })).toBe(false)
    expect(await t.run(ctx => ctx.storage.get(stale))).toBeNull()
    const undone = await upload()
    await t.mutation(api.strokes.remove, { ...edit, layerId, clientId: 'a' })
    expect(await t.mutation(api.snapshots.commit, { ...edit, layerId, fromGeneration: 0, storageId: undone, bakedClientIds: ['a'] })).toBe(false)
    expect((await live()).snapshotGeneration).toBe(0)
  })
})
```

- [ ] **Step 2: Implement `lib/brush/capPoints.ts`**

```ts
import type { StrokePoint } from './stamps'

export const MAX_STROKE_POINTS = 512

/** Keeps short strokes exact; evenly resamples long ones, always keeping both ends. */
export function capPoints(points: StrokePoint[], max = MAX_STROKE_POINTS): StrokePoint[] {
  if (points.length <= max) return points
  return Array.from({ length: max }, (_, i) => points[Math.round((i * (points.length - 1)) / (max - 1))])
}
```

- [ ] **Step 3: Implement `convex/strokes.ts`**

```ts
import { v } from 'convex/values'
import { MAX_STROKE_POINTS } from '../lib/brush/capPoints'
import { mutation } from './_generated/server'
import { fail, requireEditor, requireLayer } from './model'
import { strokeFields } from './schema'

const editArgs = { paintingId: v.id('paintings'), editKey: v.string() }
const HEX_RE = /^#[0-9a-f]{6}$/i
/** brush max 300 px / smallest placement scale 0.05, with headroom */
const MAX_SIZE = 8192

export const add = mutation({
  args: { ...editArgs, layerId: v.id('layers'), ...strokeFields },
  returns: v.id('strokes'),
  handler: async (ctx, { paintingId, editKey, layerId, ...stroke }) => {
    await requireEditor(ctx, paintingId, editKey)
    const layer = await requireLayer(ctx, paintingId, layerId)
    if (stroke.points.length === 0 || stroke.points.length > MAX_STROKE_POINTS) fail('Bad stroke')
    if (!HEX_RE.test(stroke.color)) fail(`Bad color: ${stroke.color}`)
    if (!(stroke.size > 0 && stroke.size <= MAX_SIZE)) fail('Bad size')
    if (!(stroke.opacity >= 0 && stroke.opacity <= 1)) fail('Bad opacity')
    if (!stroke.clientId || stroke.clientId.length > 64) fail('Bad stroke id')
    // Always the layer's current generation: a stroke can never be in a snapshot that was baked before it arrived.
    return await ctx.db.insert('strokes', { paintingId, layerId, generation: layer.snapshotGeneration, ...stroke })
  },
})

/** Undo. Only strokes that are not baked yet can be removed. */
export const remove = mutation({
  args: { ...editArgs, layerId: v.id('layers'), clientId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { paintingId, editKey, layerId, clientId }) => {
    await requireEditor(ctx, paintingId, editKey)
    const layer = await requireLayer(ctx, paintingId, layerId)
    const live = await ctx.db
      .query('strokes')
      .withIndex('by_layer_and_generation', q => q.eq('layerId', layerId).eq('generation', layer.snapshotGeneration))
      .collect()
    const stroke = live.find(s => s.clientId === clientId)
    if (!stroke) return false
    await ctx.db.delete(stroke._id)
    return true
  },
})
```

- [ ] **Step 4: Implement `convex/snapshots.ts`**

```ts
import { v } from 'convex/values'
import { mutation } from './_generated/server'
import { liveStrokes, requireEditor, requireLayer } from './model'

const editArgs = { paintingId: v.id('paintings'), editKey: v.string() }

export const generateUploadUrl = mutation({
  args: editArgs,
  returns: v.string(),
  handler: async (ctx, { paintingId, editKey }) => {
    await requireEditor(ctx, paintingId, editKey)
    return await ctx.storage.generateUploadUrl()
  },
})

/**
 * Makes an uploaded PNG the layer's new snapshot. `bakedClientIds` are the live strokes the PNG contains.
 * They are deleted; every other live stroke moves to the new generation and keeps replaying on top.
 * Returns false (and deletes the upload) when the bake is stale, so the caller just bakes again later.
 */
export const commit = mutation({
  args: {
    ...editArgs,
    layerId: v.id('layers'),
    fromGeneration: v.number(),
    storageId: v.id('_storage'),
    bakedClientIds: v.array(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { paintingId, editKey, layerId, fromGeneration, storageId, bakedClientIds }) => {
    await requireEditor(ctx, paintingId, editKey)
    const layer = await requireLayer(ctx, paintingId, layerId)
    const live = await liveStrokes(ctx, layer)
    const baked = new Set(bakedClientIds)
    const present = new Set(live.map(s => s.clientId))
    if (layer.snapshotGeneration !== fromGeneration || bakedClientIds.some(id => !present.has(id))) {
      await ctx.storage.delete(storageId)
      return false
    }
    const generation = fromGeneration + 1
    for (const s of live) {
      if (baked.has(s.clientId)) await ctx.db.delete(s._id)
      else await ctx.db.patch(s._id, { generation })
    }
    if (layer.snapshotId) await ctx.storage.delete(layer.snapshotId)
    await ctx.db.patch(layerId, { snapshotId: storageId, snapshotGeneration: generation })
    return true
  },
})
```

- [ ] **Step 5: Regenerate and run the tests**

Run: codegen, then `npm test && npm run typecheck`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add lib/brush convex
git commit -m "feat(convex): live strokes, undo and generation-safe snapshot commit"
```

---

### Task 5: Sync rules

**Files:**
- Create: `lib/live/strokeSync.ts`, `lib/live/bakePolicy.ts`, `lib/live/coalesce.ts`
- Test: `lib/live/live.test.ts`, `lib/live/coalesce.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/live/live.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BAKE_IDLE_MS, FULL_BAKE_IDLE_MS, UNDO_DEPTH, strokesToBake } from './bakePolicy'
import { planSync } from './strokeSync'

describe('planSync', () => {
  it('appends when drawn is a prefix', () => {
    expect(planSync(['a'], ['a', 'b', 'c'])).toEqual({ replay: false, append: ['b', 'c'] })
    expect(planSync([], [])).toEqual({ replay: false, append: [] })
  })
  it('replays when a stroke was removed or arrived out of order', () => {
    expect(planSync(['a', 'b'], ['a'])).toEqual({ replay: true, append: [] })
    expect(planSync(['a', 'mine'], ['a', 'theirs', 'mine'])).toEqual({ replay: true, append: [] })
  })
})

describe('strokesToBake', () => {
  it('waits while the layer is busy', () => {
    expect(strokesToBake(100, BAKE_IDLE_MS - 1)).toBe(0)
    expect(strokesToBake(0, FULL_BAKE_IDLE_MS)).toBe(0)
  })
  it('keeps the newest strokes live for undo', () => {
    expect(strokesToBake(2 * UNDO_DEPTH, BAKE_IDLE_MS)).toBe(0)
    expect(strokesToBake(2 * UNDO_DEPTH + 5, BAKE_IDLE_MS)).toBe(UNDO_DEPTH + 5)
  })
  it('bakes everything after a long idle', () => {
    expect(strokesToBake(3, FULL_BAKE_IDLE_MS)).toBe(3)
  })
})
```

`lib/live/coalesce.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coalescer } from './coalesce'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('coalescer', () => {
  it('sends the first value at once, then the latest once per window', () => {
    const sent: number[] = []
    const push = coalescer<number>(50, v => sent.push(v))
    push('a', 1)
    push('a', 2)
    push('a', 3)
    expect(sent).toEqual([1])
    vi.advanceTimersByTime(50)
    expect(sent).toEqual([1, 3])
    vi.advanceTimersByTime(50)
    expect(sent).toEqual([1, 3])
    push('a', 4)
    expect(sent).toEqual([1, 3, 4])
  })
  it('keeps keys independent', () => {
    const sent: string[] = []
    const push = coalescer<string>(50, v => sent.push(v))
    push('x', 'x1')
    push('y', 'y1')
    expect(sent).toEqual(['x1', 'y1'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/live`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement `lib/live/strokeSync.ts`**

```ts
/**
 * What a layer surface must do to show `desired` when it has drawn `drawn` (both stroke ids, in order).
 * Appending is only safe when what is drawn is an exact prefix; anything else needs a full replay.
 */
export function planSync(drawn: readonly string[], desired: readonly string[]): { replay: boolean; append: string[] } {
  if (drawn.length > desired.length) return { replay: true, append: [] }
  for (let i = 0; i < drawn.length; i++) {
    if (drawn[i] !== desired[i]) return { replay: true, append: [] }
  }
  return { replay: false, append: desired.slice(drawn.length) }
}
```

- [ ] **Step 4: Implement `lib/live/bakePolicy.ts`**

```ts
/** After this long with no stroke changes on a layer, bake everything. */
export const FULL_BAKE_IDLE_MS = 20_000
/** After this long, bake older strokes once a layer has many... */
export const BAKE_IDLE_MS = 1_500
/** ...but keep the newest strokes live so undo still reaches them. */
export const UNDO_DEPTH = 16

/** How many of a layer's oldest live strokes to bake into its snapshot now (0 = none). */
export function strokesToBake(count: number, idleMs: number): number {
  if (count === 0) return 0
  if (idleMs >= FULL_BAKE_IDLE_MS) return count
  if (idleMs >= BAKE_IDLE_MS && count > 2 * UNDO_DEPTH) return count - UNDO_DEPTH
  return 0
}
```

- [ ] **Step 5: Implement `lib/live/coalesce.ts`**

```ts
/**
 * Rate-limits "latest value wins" edits per key: the first call sends at once, then at most one send
 * per `ms`, and the last value is always sent. Used for drags (move tool, sliders, color pickers).
 */
export function coalescer<T>(ms: number, send: (value: T) => void) {
  const slots = new Map<string, { value: T | undefined; has: boolean; timer: ReturnType<typeof setTimeout> | null }>()
  const flush = (key: string) => {
    const slot = slots.get(key)!
    if (slot.has) {
      slot.has = false
      send(slot.value as T)
      slot.timer = setTimeout(() => flush(key), ms)
    } else {
      slots.delete(key)
    }
  }
  return (key: string, value: T) => {
    const slot = slots.get(key)
    if (!slot) {
      slots.set(key, { value: undefined, has: false, timer: null })
      send(value)
      slots.get(key)!.timer = setTimeout(() => flush(key), ms)
      return
    }
    slot.value = value
    slot.has = true
  }
}
```

- [ ] **Step 6: Run tests to verify they pass, then commit**

Run: `npx vitest run lib/live`
Expected: PASS.

```bash
git add lib/live
git commit -m "feat(live): stroke sync plan, bake policy and drag coalescing"
```

---

### Task 6: LiveSync controller

**Files:**
- Create: `lib/live/sync.ts`
- Test: `lib/live/sync.test.ts`

The controller never touches WebGL or Convex directly. It talks to a `SyncHost` (the renderer's surfaces, a decoder and a bake callback), so the tests drive it with fakes.

- [ ] **Step 1: Write the failing test**

`lib/live/sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BAKE_IDLE_MS, FULL_BAKE_IDLE_MS, UNDO_DEPTH } from './bakePolicy'
import { LiveSync, type ServerLayer, type SyncStroke, type SyncSurface } from './sync'

const stroke = (id: string): SyncStroke => ({ id })
const flush = () => new Promise(r => setTimeout(r, 0))

class FakeSurface implements SyncSurface<string> {
  drawing = false
  snapshot: string | null = null
  shown: string[] = []
  resets = 0
  reset(snapshot: string | null, strokes: SyncStroke[]) {
    this.snapshot = snapshot
    this.shown = strokes.map(s => s.id)
    this.resets++
  }
  setStrokes(strokes: SyncStroke[]) {
    if (this.drawing) return false
    this.shown = strokes.map(s => s.id)
    return true
  }
  readPixels(count: number) {
    return Uint8Array.of(count)
  }
}

function setup(editor = true) {
  const surfaces = new Map<string, FakeSurface>()
  const dropped: string[] = []
  const bakes: { layerId: string; gen: number; ids: string[] }[] = []
  let bakeResult = true
  const sync = new LiveSync<string>({
    surface: id => {
      if (!surfaces.has(id)) surfaces.set(id, new FakeSurface())
      return surfaces.get(id)!
    },
    drop: id => dropped.push(id),
    decode: async url => `bitmap:${url}`,
    bake: editor
      ? async (layerId, gen, _px, ids) => {
          bakes.push({ layerId, gen, ids })
          return bakeResult
        }
      : undefined,
  })
  const layer = (strokes: string[], generation = 0, snapshotUrl: string | null = null): ServerLayer => ({
    id: 'L', generation, snapshotUrl, strokes: strokes.map(stroke),
  })
  return { sync, surfaces, dropped, bakes, layer, s: () => surfaces.get('L')!, failBakes: () => (bakeResult = false) }
}

describe('LiveSync', () => {
  it('loads the snapshot before showing strokes of that generation', async () => {
    const { sync, layer, s } = setup()
    sync.update([layer(['a'], 2, 'u2')], 0)
    expect(s().resets).toBe(0)
    await flush()
    expect(s()).toMatchObject({ snapshot: 'bitmap:u2', shown: ['a'], resets: 1 })
  })
  it('appends remote strokes and keeps local pending ones on top', async () => {
    const { sync, layer, s } = setup()
    sync.update([layer([])], 0)
    await flush()
    sync.addLocal('L', stroke('mine'), 1)
    sync.update([layer(['theirs'])], 2)
    expect(s().shown).toEqual(['theirs', 'mine'])
    sync.update([layer(['theirs', 'mine'])], 3)
    expect(s().shown).toEqual(['theirs', 'mine'])
  })
  it('waits for the stroke in progress before changing the surface', async () => {
    const { sync, layer, s } = setup()
    sync.update([layer([])], 0)
    await flush()
    s().drawing = true
    sync.update([layer(['theirs'])], 1)
    expect(s().shown).toEqual([])
    s().drawing = false
    sync.tick(2)
    expect(s().shown).toEqual(['theirs'])
  })
  it('keeps showing the old snapshot until the new one is decoded', async () => {
    const { sync, layer, s } = setup()
    sync.update([layer(['a', 'b'], 0, null)], 0)
    await flush()
    sync.update([layer(['b'], 1, 'u1')], 1)
    expect(s().shown).toEqual(['a', 'b'])
    await flush()
    expect(s()).toMatchObject({ snapshot: 'bitmap:u1', shown: ['b'] })
  })
  it('undo hides own newest live stroke, and unhide brings it back', async () => {
    const { sync, layer, s } = setup()
    sync.update([layer([])], 0)
    await flush()
    sync.addLocal('L', stroke('x'), 1)
    sync.update([layer(['theirs', 'x'])], 2)
    expect(sync.undo('L', 3)).toBe('x')
    expect(s().shown).toEqual(['theirs'])
    sync.unhide('L', 'x')
    expect(s().shown).toEqual(['theirs', 'x'])
    expect(sync.undo('L', 4)).toBe('x')
    sync.update([layer(['theirs'])], 5)
    expect(sync.undo('L', 6)).toBeNull()
  })
  it('a rejected insert disappears', async () => {
    const { sync, layer, s } = setup()
    sync.update([layer([])], 0)
    await flush()
    sync.addLocal('L', stroke('x'), 1)
    sync.update([layer([])], 1)
    expect(s().shown).toEqual(['x'])
    sync.reject('L', 'x')
    expect(s().shown).toEqual([])
  })
  it('bakes old strokes after a short idle and everything after a long one', async () => {
    const { sync, layer, bakes } = setup()
    const many = Array.from({ length: 2 * UNDO_DEPTH + 3 }, (_, i) => `s${i}`)
    sync.update([layer(many)], 0)
    await flush()
    sync.tick(BAKE_IDLE_MS - 1)
    expect(bakes).toEqual([])
    sync.tick(BAKE_IDLE_MS)
    expect(bakes).toEqual([{ layerId: 'L', gen: 0, ids: many.slice(0, UNDO_DEPTH + 3) }])
    await flush()
    sync.update([layer(['z'], 1, 'u1')], BAKE_IDLE_MS + 1)
    await flush()
    sync.tick(BAKE_IDLE_MS + 1 + FULL_BAKE_IDLE_MS)
    expect(bakes[1]).toEqual({ layerId: 'L', gen: 1, ids: ['z'] })
  })
  it('never bakes with pending strokes, and viewers never bake', async () => {
    const e = setup()
    e.sync.update([e.layer(['a'])], 0)
    await flush()
    e.sync.addLocal('L', stroke('p'), 0)
    e.sync.tick(FULL_BAKE_IDLE_MS * 2)
    expect(e.bakes).toEqual([])
    const v = setup(false)
    v.sync.update([v.layer(['a'])], 0)
    await flush()
    v.sync.tick(FULL_BAKE_IDLE_MS)
    expect(v.bakes).toEqual([])
  })
  it('backs off after a refused bake', async () => {
    const { sync, layer, bakes, failBakes } = setup()
    failBakes()
    sync.update([layer(['a'])], 0)
    await flush()
    sync.tick(FULL_BAKE_IDLE_MS)
    await flush()
    sync.tick(FULL_BAKE_IDLE_MS + 1)
    expect(bakes).toHaveLength(1)
    sync.tick(FULL_BAKE_IDLE_MS + 5000)
    expect(bakes).toHaveLength(2)
  })
  it('drops layers that disappear, and reloads everything after context loss', async () => {
    const { sync, layer, s, dropped } = setup()
    sync.update([layer(['a'], 1, 'u1')], 0)
    await flush()
    sync.invalidate()
    await flush()
    expect(s().resets).toBe(2)
    sync.update([], 1)
    expect(dropped).toEqual(['L'])
  })
})
```

- [ ] **Step 2: Implement `lib/live/sync.ts`**

```ts
import { strokesToBake } from './bakePolicy'

/** Anything with a stable client id. In the app this is the renderer's Stroke. */
export interface SyncStroke { id: string }

/** One layer as the server sees it: snapshot generation + URL and its live (unbaked) strokes, oldest first. */
export interface ServerLayer<S extends SyncStroke = SyncStroke> {
  id: string
  generation: number
  snapshotUrl: string | null
  strokes: S[]
}

/** The slice of LayerSurface that sync needs (a fake in tests). */
export interface SyncSurface<B, S extends SyncStroke = SyncStroke> {
  readonly drawing: boolean
  reset(snapshot: B | null, strokes: S[]): void
  setStrokes(strokes: S[]): boolean
  readPixels(count: number): Uint8Array
}

export interface SyncHost<B, S extends SyncStroke = SyncStroke> {
  surface(layerId: string): SyncSurface<B, S>
  drop(layerId: string): void
  decode(url: string): Promise<B>
  /** Editors only. Resolves false when the server refused a stale bake. */
  bake?: (layerId: string, fromGeneration: number, pixels: Uint8Array, bakedIds: string[]) => Promise<boolean>
}

interface LayerState<S extends SyncStroke> {
  latest: ServerLayer<S>
  /** generation whose snapshot the surface shows; null = none yet */
  shown: number | null
  loading: number | null
  token: number
  ready: { generation: number; snapshot: unknown } | null
  /** committed here, not yet seen from the server */
  pending: S[]
  /** undone here, not yet gone from the server */
  hidden: Set<string>
  own: string[]
  idsKey: string
  lastChange: number
  retryAt: number
}

const RETRY_MS = 3000

/**
 * Keeps each layer surface equal to snapshot + server strokes + local pending strokes,
 * and (for editors) bakes idle layers into new snapshots.
 */
export class LiveSync<B, S extends SyncStroke = SyncStroke> {
  private layers = new Map<string, LayerState<S>>()
  private baking = false
  private now = 0

  constructor(private host: SyncHost<B, S>) {}

  update(layers: ServerLayer<S>[], now: number) {
    this.now = now
    const seen = new Set<string>()
    for (const layer of layers) {
      seen.add(layer.id)
      let st = this.layers.get(layer.id)
      if (!st) {
        st = {
          latest: layer, shown: null, loading: null, token: 0, ready: null, pending: [], hidden: new Set(),
          own: [], idsKey: '', lastChange: now, retryAt: 0,
        }
        this.layers.set(layer.id, st)
      }
      st.latest = layer
      const ids = new Set(layer.strokes.map(s => s.id))
      const idsKey = layer.strokes.map(s => s.id).join(',')
      if (idsKey !== st.idsKey) {
        st.idsKey = idsKey
        st.lastChange = now
      }
      st.pending = st.pending.filter(s => !ids.has(s.id))
      for (const h of st.hidden) if (!ids.has(h) && !st.pending.some(s => s.id === h)) st.hidden.delete(h)
      this.reconcile(layer.id, st)
    }
    for (const id of [...this.layers.keys()]) {
      if (seen.has(id)) continue
      this.layers.delete(id)
      this.host.drop(id)
    }
  }

  /** A stroke this client just finished. Call ack/reject when the insert settles. */
  addLocal(layerId: string, stroke: S, now: number) {
    const st = this.layers.get(layerId)
    if (!st) return
    st.pending.push(stroke)
    st.own.push(stroke.id)
    st.lastChange = now
  }

  ack(layerId: string, strokeId: string) {
    const st = this.layers.get(layerId)
    if (!st) return
    st.pending = st.pending.filter(s => s.id !== strokeId)
    this.reconcile(layerId, st)
  }

  reject(layerId: string, strokeId: string) {
    const st = this.layers.get(layerId)
    if (!st) return
    st.pending = st.pending.filter(s => s.id !== strokeId)
    st.own = st.own.filter(id => id !== strokeId)
    this.reconcile(layerId, st)
  }

  /** Hides this client's newest still-live stroke on the layer and returns its id (null if none). */
  undo(layerId: string, now: number): string | null {
    const st = this.layers.get(layerId)
    if (!st) return null
    const live = new Set([...st.latest.strokes.map(s => s.id), ...st.pending.map(s => s.id)])
    while (st.own.length) {
      const id = st.own.pop()!
      if (!live.has(id) || st.hidden.has(id)) continue
      st.hidden.add(id)
      st.lastChange = now
      this.reconcile(layerId, st)
      return id
    }
    return null
  }

  /** Server said the undo failed (already baked): show the stroke again. */
  unhide(layerId: string, strokeId: string) {
    const st = this.layers.get(layerId)
    if (!st) return
    st.hidden.delete(strokeId)
    st.own.push(strokeId)
    this.reconcile(layerId, st)
  }

  /** After WebGL context loss: every snapshot must be reloaded. */
  invalidate() {
    for (const [id, st] of this.layers) {
      st.shown = null
      st.loading = null
      st.ready = null
      st.token++
      this.reconcile(id, st)
    }
  }

  /** Call a few times a second: applies deferred work and schedules bakes. */
  tick(now: number) {
    this.now = now
    for (const [id, st] of this.layers) this.reconcile(id, st)
    if (!this.host.bake || this.baking) return
    for (const [id, st] of this.layers) {
      if (now < st.retryAt || st.shown !== st.latest.generation || st.loading !== null || st.ready) continue
      if (st.pending.length || st.hidden.size) continue
      const surface = this.host.surface(id)
      if (surface.drawing) continue
      const count = strokesToBake(st.latest.strokes.length, now - st.lastChange)
      if (count === 0) continue
      const generation = st.latest.generation
      const baked = st.latest.strokes.slice(0, count).map(s => s.id)
      const pixels = surface.readPixels(count)
      this.baking = true
      this.host
        .bake(id, generation, pixels, baked)
        .then(ok => {
          if (!ok) st.retryAt = this.now + RETRY_MS
        })
        .catch(() => {
          st.retryAt = this.now + RETRY_MS
        })
        .finally(() => {
          this.baking = false
        })
      return
    }
  }

  private desired(st: LayerState<S>): S[] {
    const server = new Set(st.latest.strokes.map(s => s.id))
    return [...st.latest.strokes, ...st.pending.filter(s => !server.has(s.id))].filter(s => !st.hidden.has(s.id))
  }

  private reconcile(id: string, st: LayerState<S>) {
    const surface = this.host.surface(id)
    const gen = st.latest.generation
    if (st.ready && st.ready.generation === gen && !surface.drawing) {
      surface.reset(st.ready.snapshot as B | null, this.desired(st))
      st.shown = gen
      st.ready = null
      return
    }
    if (st.shown !== gen) {
      if (st.loading !== gen && this.now >= st.retryAt) this.load(id, st)
      return
    }
    surface.setStrokes(this.desired(st))
  }

  private load(id: string, st: LayerState<S>) {
    const { generation, snapshotUrl } = st.latest
    const token = ++st.token
    st.loading = generation
    st.ready = null
    const done = (snapshot: B | null) => {
      if (token !== st.token) return
      st.loading = null
      st.ready = { generation, snapshot }
      this.reconcile(id, st)
    }
    ;(snapshotUrl ? this.host.decode(snapshotUrl) : Promise.resolve(null)).then(done, () => {
      if (token !== st.token) return
      st.loading = null
      st.retryAt = this.now + RETRY_MS
    })
  }
}
```

- [ ] **Step 3: Run tests to verify they pass, then commit**

Run: `npx vitest run lib/live && npm run typecheck`
Expected: PASS.

```bash
git add lib/live
git commit -m "feat(live): LiveSync keeps surfaces equal to snapshot + strokes and bakes idle layers"
```

---

### Task 7: Snapshot images and ids

**Files:**
- Create: `lib/image/pixels.ts`, `lib/image/png.ts`, `lib/util/id.ts`
- Test: `lib/image/pixels.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/image/pixels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { unpremultiply } from './pixels'

describe('unpremultiply', () => {
  it('divides color by alpha and zeroes clear pixels', () => {
    expect(Array.from(unpremultiply(Uint8Array.from([128, 64, 0, 128, 9, 9, 9, 0, 10, 20, 30, 255])))).toEqual([
      255, 128, 0, 128, 0, 0, 0, 0, 10, 20, 30, 255,
    ])
  })
})
```

- [ ] **Step 2: Implement `lib/image/pixels.ts`**

```ts
/** Premultiplied RGBA8 (what WebGL reads back) → straight RGBA8 (what ImageData and PNG expect). */
export function unpremultiply(src: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(src.length)
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]
    if (a === 0) continue
    const k = 255 / a
    out[i] = src[i] * k + 0.5
    out[i + 1] = src[i + 1] * k + 0.5
    out[i + 2] = src[i + 2] * k + 0.5
    out[i + 3] = a
  }
  return out
}
```

- [ ] **Step 3: Implement `lib/image/png.ts`**

```ts
import { unpremultiply } from './pixels'
import type { Rect } from '@/lib/geometry/place'

function canvas2d(size: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(size, size)
    return { ctx: c.getContext('2d')!, toPng: () => c.convertToBlob({ type: 'image/png' }) }
  }
  const c = document.createElement('canvas')
  c.width = c.height = size
  const toPng = () => new Promise<Blob>((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('PNG encode failed'))), 'image/png'))
  return { ctx: c.getContext('2d')!, toPng }
}

/** WebGL readback (premultiplied, row 0 = top) → PNG. */
export async function encodePng(premultiplied: Uint8Array, size: number): Promise<Blob> {
  const { ctx, toPng } = canvas2d(size)
  ctx.putImageData(new ImageData(unpremultiply(premultiplied), size, size), 0, 0)
  return toPng()
}

/** An imported image, placed at `rect` on a transparent layer, as a snapshot PNG. */
export async function imageToPng(image: ImageBitmap, rect: Rect, size: number): Promise<Blob> {
  const { ctx, toPng } = canvas2d(size)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h)
  return toPng()
}

/**
 * Snapshot URL → premultiplied ImageBitmap. WebGL ignores UNPACK_PREMULTIPLY_ALPHA for ImageBitmaps,
 * so the premultiply has to happen here.
 */
export async function decodeSnapshot(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Snapshot download failed (${res.status})`)
  return createImageBitmap(await res.blob(), { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' })
}
```

- [ ] **Step 4: Implement `lib/util/id.ts`**

```ts
/**
 * Random id for strokes. crypto.randomUUID only exists on secure origins, and the iPad test
 * serves over plain http on the LAN, so build it from getRandomValues (available everywhere).
 */
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npx vitest run lib/image && npm run typecheck`
Expected: PASS.

```bash
git add lib/image lib/util
git commit -m "feat(image): snapshot PNG encode/decode with explicit premultiply, secure-context-free ids"
```

---

### Task 8: Client glue

**Files:**
- Create: `lib/live/doc.ts`, `lib/live/keyStore.ts`, `lib/live/errors.ts`
- Test: `lib/live/doc.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/live/doc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createLayer } from '@/lib/doc/painting'
import { layerToFields } from '@/lib/doc/wire'
import { docToPainting, docToServerLayers, type LoadedDoc } from './doc'

const { id: _, ...layer } = createLayer('', 'Layer 1')
const doc = {
  painting: { _id: 'P', width: 2048, height: 2048, playing: true, startedAt: 1, pausedElapsed: 0, focusedLayerId: 'L', grain: 0, background: '#f3efe6' },
  layers: [{
    _id: 'L', order: 0, snapshotGeneration: 3, snapshotUrl: 'https://x/s.png', ...layerToFields(layer),
    strokes: [{ _id: 'S', clientId: 'c1', color: '#000000', size: 4, opacity: 1, erase: false, points: [{ x: 1, y: 2, pressure: 1 }] }],
  }],
} as unknown as LoadedDoc

describe('doc mapping', () => {
  it('builds the Plan 1 Painting', () => {
    const p = docToPainting(doc)
    expect(p.focusedLayerId).toBe('L')
    expect(p.layers).toEqual([{ ...layer, id: 'L' }])
  })
  it('builds sync layers keyed by client stroke id', () => {
    expect(docToServerLayers(doc)).toEqual([
      { id: 'L', generation: 3, snapshotUrl: 'https://x/s.png', strokes: [{ id: 'c1', color: '#000000', size: 4, opacity: 1, erase: false, points: [{ x: 1, y: 2, pressure: 1 }] }] },
    ])
  })
})
```

- [ ] **Step 2: Implement `lib/live/doc.ts`**

```ts
import type { FunctionReturnType } from 'convex/server'
import type { api } from '@/convex/_generated/api'
import { paintingFromFields } from '@/lib/doc/wire'
import type { Painting } from '@/lib/doc/types'

export type LoadedDoc = NonNullable<FunctionReturnType<typeof api.paintings.load>>

export function docToPainting(doc: LoadedDoc): Painting {
  return paintingFromFields(
    doc.painting,
    doc.layers.map(({ _id, order: _o, snapshotGeneration: _g, snapshotUrl: _u, strokes: _s, ...fields }) => ({ id: _id, fields })),
  )
}

/** Layers for LiveSync; strokes are keyed by their client id, the same shape as the renderer's Stroke. */
export function docToServerLayers(doc: LoadedDoc) {
  return doc.layers.map(l => ({
    id: l._id,
    generation: l.snapshotGeneration,
    snapshotUrl: l.snapshotUrl,
    strokes: l.strokes.map(({ clientId, color, size, opacity, erase, points }) => ({ id: clientId, color, size, opacity, erase, points })),
  }))
}
```

- [ ] **Step 3: Implement `lib/live/keyStore.ts`**

```ts
import { isEditKey } from '@/lib/doc/editKey'

const storageKey = (paintingId: string) => `painting:${paintingId}:editKey`

export function storeEditKey(paintingId: string, key: string) {
  try {
    localStorage.setItem(storageKey(paintingId), key)
  } catch {
    // private mode: editing still works until the tab closes
  }
}

/** Takes `?k=` from the URL (stores it, strips it), else returns the stored key. */
export function consumeEditKey(paintingId: string): string | null {
  const url = new URL(window.location.href)
  const k = url.searchParams.get('k')
  if (k !== null) {
    if (isEditKey(k)) storeEditKey(paintingId, k)
    url.searchParams.delete('k')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  try {
    const stored = localStorage.getItem(storageKey(paintingId))
    return stored && isEditKey(stored) ? stored : null
  } catch {
    return k && isEditKey(k) ? k : null
  }
}
```

- [ ] **Step 4: Implement `lib/live/errors.ts`**

```ts
import { ConvexError } from 'convex/values'

/** User-facing text for a failed Convex call. */
export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) return String(e.data)
  if (e instanceof Error) return e.message
  return String(e)
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add lib/live
git commit -m "feat(live): load() mapping, edit-key storage and error text"
```

---

### Task 9: The live studio

This task switches the app over, so it changes several files at once. Nothing typechecks between the steps. Do them all, then verify.

**Files:**
- Replace: `lib/renderer/surface.ts`, `components/PaintCanvas.tsx`, `components/Toolbar.tsx`, `components/Studio.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/studio/page.tsx`
- Modify: `lib/renderer/renderer.ts`, `app/globals.css`
- Create: `lib/live/useLiveApi.ts`, `components/ConvexClientProvider.tsx`, `components/NewPainting.tsx`, `components/LivePainting.tsx`, `app/p/[id]/page.tsx`

- [ ] **Step 1: Replace `lib/renderer/surface.ts`**

Strokes get an `id`. The surface keeps a snapshot texture instead of an image base, syncs to a desired stroke list, and can read back its pixels (optionally only the first *n* strokes, via a temporary target). Undo moves out to LiveSync.

```ts
import { stampSegment, stampStroke, type StrokePoint } from '@/lib/brush/stamps'
import { hexToRgb } from '@/lib/color/hex'
import { planSync } from '@/lib/live/strokeSync'
import { createTarget, deleteTarget, type Target } from './gl'
import type { Painter } from './painter'

/** `id` is the client stroke id (Convex `clientId`), unique per stroke across clients. */
export interface Stroke { id: string; color: string; size: number; opacity: number; erase: boolean; points: StrokePoint[] }
export type StrokeStyle = Omit<Stroke, 'points'>

/**
 * One layer's pixels: an optional snapshot (full 2048² in layer space) plus the live strokes on top.
 * The snapshot is uploaded once and the bitmap closed; after context loss the caller reloads it.
 */
export class LayerSurface {
  target: Target
  strokes: Stroke[] = []
  version = 0
  mipDirty = true
  private baseTex: WebGLTexture | null = null
  private live: { stroke: Stroke; carry: number } | null = null

  constructor(private gl: WebGL2RenderingContext, private painter: Painter, readonly size: number) {
    this.target = createTarget(gl, size, true)
  }

  get drawing() {
    return this.live !== null
  }

  /** New snapshot and stroke list in one replay. Takes ownership of the bitmap. */
  reset(snapshot: ImageBitmap | null, strokes: Stroke[]) {
    if (this.baseTex) this.gl.deleteTexture(this.baseTex)
    this.baseTex = snapshot ? this.painter.uploadImage(snapshot) : null
    snapshot?.close()
    this.strokes = [...strokes]
    this.replay()
  }

  /** Shows exactly `desired` on top of the snapshot. Returns false (and does nothing) mid-stroke. */
  setStrokes(desired: Stroke[]): boolean {
    if (this.live) return false
    const plan = planSync(this.strokes.map(s => s.id), desired.map(s => s.id))
    if (plan.replay) {
      this.strokes = [...desired]
      this.replay()
    } else if (plan.append.length) {
      for (const s of desired.slice(this.strokes.length)) this.stampWhole(this.target, s)
      this.strokes = [...desired]
      this.touch()
    }
    return true
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

  replay() {
    this.drawInto(this.target, this.strokes)
    this.touch()
  }

  /** Premultiplied RGBA8, row 0 = top: the snapshot plus the first `count` strokes. */
  readPixels(count = this.strokes.length): Uint8Array {
    const { gl, size } = this
    const out = new Uint8Array(size * size * 4)
    const whole = count >= this.strokes.length && !this.live
    const target = whole ? this.target : createTarget(gl, size)
    if (!whole) this.drawInto(target, this.strokes.slice(0, count))
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, out)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (!whole) deleteTarget(gl, target)
    return out
  }

  ensureMips() {
    if (!this.mipDirty) return
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.target.tex)
    this.gl.generateMipmap(this.gl.TEXTURE_2D)
    this.mipDirty = false
  }

  /** After WebGL context loss: new GPU objects, strokes only. The caller reloads the snapshot. */
  restore(painter: Painter) {
    this.painter = painter
    this.target = createTarget(this.gl, this.size, true)
    this.baseTex = null
    this.live = null
    this.replay()
  }

  dispose() {
    deleteTarget(this.gl, this.target)
    if (this.baseTex) this.gl.deleteTexture(this.baseTex)
  }

  private drawInto(target: Target, strokes: Stroke[]) {
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.viewport(0, 0, this.size, this.size)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (this.baseTex) this.painter.image(target, this.baseTex, { x: 0, y: 0, w: this.size, h: this.size })
    for (const s of strokes) this.stampWhole(target, s)
  }

  private stampWhole(target: Target, s: Stroke) {
    this.painter.stamp(target, stampStroke(s.points, s.size, s.opacity), hexToRgb(s.color), s.erase)
  }

  private touch() {
    this.version++
    this.mipDirty = true
  }
}
```

- [ ] **Step 2: Edit `lib/renderer/renderer.ts`**

Add the hook below `onLost`:

```ts
  /** Called after a context restore; snapshots must be reloaded (surfaces only replay their strokes). */
  onRestored: (() => void) | null = null
```

In `handleRestored`, call it after `this.onLost?.(false)`:

```ts
      this.onLost?.(false)
      this.onRestored?.()
```

- [ ] **Step 3: Create `lib/live/useLiveApi.ts`**

Optimistic updaters live at module level and read `args.paintingId`, which keeps the React Compiler lint rules happy (no impure calls in hook bodies).

```ts
'use client'

import type { OptimisticLocalStore } from 'convex/browser'
import { useMutation } from 'convex/react'
import { useMemo } from 'react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { capPoints } from '@/lib/brush/capPoints'
import { elapsedSeconds, type Action, type LayerPatch } from '@/lib/doc/painting'
import { patchToFields } from '@/lib/doc/wire'
import { clamp01 } from '@/lib/util/math'
import type { Stroke } from '@/lib/renderer/surface'
import type { LoadedDoc } from './doc'
import { coalescer } from './coalesce'
import { errorMessage } from './errors'

type LayerId = Id<'layers'>


type Store = OptimisticLocalStore

function patchPainting(store: Store, paintingId: string, patch: Partial<LoadedDoc['painting']>) {
  const cur = store.getQuery(api.paintings.load, { paintingId })
  if (cur) store.setQuery(api.paintings.load, { paintingId }, { ...cur, painting: { ...cur.painting, ...patch } })
}

function optimisticPatchLayer(store: Store, a: { paintingId: string; layerId: string; patch: object }) {
  const cur = store.getQuery(api.paintings.load, { paintingId: a.paintingId })
  if (!cur) return
  let fields
  try {
    fields = patchToFields(a.patch as LayerPatch)
  } catch {
    return
  }
  store.setQuery(api.paintings.load, { paintingId: a.paintingId }, { ...cur, layers: cur.layers.map(l => (l._id === a.layerId ? { ...l, ...fields } : l)) })
}

function optimisticPlayback(store: Store, a: { paintingId: string; playing: boolean }) {
  const cur = store.getQuery(api.paintings.load, { paintingId: a.paintingId })
  if (!cur || cur.painting.playing === a.playing) return
  const now = Date.now()
  patchPainting(store, a.paintingId, a.playing ? { playing: true, startedAt: now } : { playing: false, pausedElapsed: elapsedSeconds(cur.painting, now) })
}

function optimisticMove(store: Store, a: { paintingId: string; layerId: string; toIndex: number }) {
  const cur = store.getQuery(api.paintings.load, { paintingId: a.paintingId })
  if (!cur) return
  const layers = [...cur.layers]
  const i = layers.findIndex(l => l._id === a.layerId)
  if (i < 0) return
  const [l] = layers.splice(i, 1)
  layers.splice(Math.max(0, Math.min(layers.length, a.toIndex)), 0, l)
  store.setQuery(api.paintings.load, { paintingId: a.paintingId }, { ...cur, layers })
}

/**
 * Every edit as a Convex mutation. Painting-level and layer-level edits update the
 * `load` query optimistically, so sliders feel local.
 */
export function useLiveApi(paintingId: string, editKey: string | null, onError: (message: string) => void) {
  const pid = paintingId as Id<'paintings'>

  const patchLayer = useMutation(api.layers.patch).withOptimisticUpdate(optimisticPatchLayer)
  const setGrain = useMutation(api.paintings.setGrain).withOptimisticUpdate((s, a) => patchPainting(s, a.paintingId, { grain: clamp01(a.grain) }))
  const setBackground = useMutation(api.paintings.setBackground).withOptimisticUpdate((s, a) => patchPainting(s, a.paintingId, { background: a.color }))
  const focus = useMutation(api.paintings.focus).withOptimisticUpdate((s, a) => patchPainting(s, a.paintingId, { focusedLayerId: a.layerId }))
  const setPlayback = useMutation(api.paintings.setPlayback).withOptimisticUpdate(optimisticPlayback)
  const moveLayer = useMutation(api.layers.move).withOptimisticUpdate(optimisticMove)
  const removeLayer = useMutation(api.layers.remove)
  const addLayer = useMutation(api.layers.add)
  const addStroke = useMutation(api.strokes.add)
  const removeStroke = useMutation(api.strokes.remove)
  const uploadUrl = useMutation(api.snapshots.generateUploadUrl)
  const commitSnapshot = useMutation(api.snapshots.commit)

  return useMemo(() => {
    const key = editKey ?? ''
    const edit = { paintingId: pid, editKey: key }
    const report = (p: Promise<unknown>) => void p.catch(e => onError(errorMessage(e)))
    /** Drags send many edits; keep the newest per field at ~20/s. */
    const drag = coalescer<() => Promise<unknown>>(50, run => report(run()))

    return {
      canEdit: editKey !== null,
      /** Plan 1 reducer actions, sent to Convex. addLayer goes through addLayer() instead. */
      dispatch(a: Action) {
        if (!editKey) return
        switch (a.type) {
          case 'patchLayer':
            return drag(`${a.layerId}:${Object.keys(a.patch).sort().join()}`, () =>
              patchLayer({ ...edit, layerId: a.layerId as LayerId, patch: a.patch }))
          case 'focus': return report(focus({ ...edit, layerId: a.layerId as LayerId }))
          case 'moveLayer': return report(moveLayer({ ...edit, layerId: a.layerId as LayerId, toIndex: a.toIndex }))
          case 'removeLayer': return report(removeLayer({ ...edit, layerId: a.layerId as LayerId }))
          case 'setPlayback': return report(setPlayback({ ...edit, playing: a.playing }))
          case 'setGrain': return drag('grain', () => setGrain({ ...edit, grain: a.grain }))
          case 'setBackground': return drag('background', () => setBackground({ ...edit, color: a.color }))
          case 'addLayer': return report(addLayer({ ...edit, name: a.name }))
        }
      },
      addLayer: (opts: { name?: string; snapshotId?: Id<'_storage'> } = {}) => addLayer({ ...edit, ...opts }),
      addStroke: (layerId: string, s: Stroke) =>
        addStroke({
          ...edit, layerId: layerId as LayerId, clientId: s.id, color: s.color, size: s.size, opacity: s.opacity, erase: s.erase,
          points: capPoints(s.points),
        }),
      removeStroke: (layerId: string, clientId: string) => removeStroke({ ...edit, layerId: layerId as LayerId, clientId }),
      async uploadPng(blob: Blob): Promise<Id<'_storage'>> {
        const url = await uploadUrl(edit)
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob })
        if (!res.ok) throw new Error(`Upload failed (${res.status})`)
        return ((await res.json()) as { storageId: Id<'_storage'> }).storageId
      },
      commitSnapshot: (layerId: string, fromGeneration: number, storageId: Id<'_storage'>, bakedClientIds: string[]) =>
        commitSnapshot({ ...edit, layerId: layerId as LayerId, fromGeneration, storageId, bakedClientIds }),
    }
  }, [pid, editKey, onError, patchLayer, focus, moveLayer, removeLayer, setPlayback, setGrain, setBackground, addLayer, addStroke, removeStroke, uploadUrl, commitSnapshot])
}

export type LiveApi = ReturnType<typeof useLiveApi>
```

- [ ] **Step 4: Replace `components/PaintCanvas.tsx`**

Changes from Plan 1:
- strokes get `newId()`, and a committed stroke goes to `onStroke`;
- a `pan` tool (viewers) drags the view;
- the renderer is reported through `onRenderer` / `onRestored`.

```tsx
'use client'

import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import { normalizePressure } from '@/lib/brush/stamps'
import { PAINTING_SIZE, type Layer, type Painting, type Placement } from '@/lib/doc/types'
import { paintingToLayer } from '@/lib/geometry/place'
import { DEFAULT_VIEW, panView, pinchView, screenToPainting, type Pt, type View } from '@/lib/geometry/view'
import { modeOnDown, type Mode } from '@/lib/input/pointers'
import { Renderer } from '@/lib/renderer/renderer'
import type { Stroke } from '@/lib/renderer/surface'
import { newId } from '@/lib/util/id'

/** 'pan' is the viewer's only tool: a one-finger or mouse drag moves the view. */
export type Tool = 'paint' | 'erase' | 'move' | 'pan'
export interface BrushSettings { tool: Tool; color: string; size: number; opacity: number }

interface Props {
  painting: Painting
  activeLayer: Layer
  brush: BrushSettings
  rendererRef: MutableRefObject<Renderer | null>
  onRenderer: (renderer: Renderer | null) => void
  onRestored: () => void
  onPlace: (layerId: string, place: Placement) => void
  onStroke: (layerId: string, stroke: Stroke) => void
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
  const g = useRef({
    mode: 'idle' as Mode, penSeen: false, strokeId: null as number | null,
    moveFrom: null as Pt | null, placeFrom: null as Placement | null, panFrom: null as Pt | null,
  })

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
    renderer.onRestored = () => latest.current.onRestored()
    latest.current.rendererRef.current = renderer
    latest.current.onRenderer(renderer)

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
      latest.current.onRenderer(null)
      renderer.dispose()
    }
  }, [])

  function startTool(e: { pointerId: number; pointerType: string; pressure: number; clientX: number; clientY: number }) {
    const { activeLayer, brush, rendererRef } = latest.current
    const p = toPainting(local(e))
    g.current.strokeId = e.pointerId
    if (brush.tool === 'pan') {
      g.current.panFrom = local(e)
      return
    }
    if (brush.tool === 'move') {
      g.current.moveFrom = p
      g.current.placeFrom = activeLayer.place
      return
    }
    const lp = paintingToLayer(p, activeLayer.place, PAINTING_SIZE)
    rendererRef.current?.surface(activeLayer.id).begin(
      { id: newId(), color: brush.color, size: brush.size / activeLayer.place.scale, opacity: brush.opacity, erase: brush.tool === 'erase' },
      { x: lp.x, y: lp.y, pressure: normalizePressure(e.pointerType, e.pressure) },
    )
  }

  function continueTool(e: PointerEvent) {
    const { activeLayer, rendererRef, onPlace } = latest.current
    const { moveFrom, placeFrom, panFrom } = g.current
    if (panFrom) {
      const cur = local(e)
      view.current = panView(view.current, cur.x - panFrom.x, cur.y - panFrom.y)
      g.current.panFrom = cur
      return
    }
    const p = toPainting(local(e))
    if (moveFrom && placeFrom) {
      onPlace(activeLayer.id, { ...placeFrom, x: placeFrom.x + p.x - moveFrom.x, y: placeFrom.y + p.y - moveFrom.y })
      return
    }
    const lp = paintingToLayer(p, activeLayer.place, PAINTING_SIZE)
    rendererRef.current?.surface(activeLayer.id).extend({ x: lp.x, y: lp.y, pressure: normalizePressure(e.pointerType, e.pressure) })
  }

  function endTool() {
    const { activeLayer, rendererRef, onStroke } = latest.current
    const stroke = g.current.moveFrom || g.current.panFrom ? null : rendererRef.current?.surface(activeLayer.id).commit()
    if (stroke) onStroke(activeLayer.id, stroke)
    g.current.strokeId = null
    g.current.moveFrom = null
    g.current.placeFrom = null
    g.current.panFrom = null
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
      g.current.panFrom = null
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

- [ ] **Step 5: Replace `components/Toolbar.tsx`**

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
  canEdit: boolean
  onShare: (withEditKey: boolean) => void
}

const TOOLS: Tool[] = ['paint', 'erase', 'move']

export default function Toolbar({ brush, onBrush, painting, dispatch, onUndo, onImport, layersOpen, onToggleLayers, canEdit, onShare }: Props) {
  if (!canEdit) {
    return (
      <header className="toolbar">
        <strong>09tt</strong>
        <span className="muted">View only · pinch or drag to look around</span>
        <span className="spacer" />
        <button onClick={() => onShare(false)}>Copy link</button>
      </header>
    )
  }
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
      <button onClick={() => onShare(false)} title="Copy a view-only link">Share</button>
      <button onClick={() => onShare(true)} title="Copy a link that can edit (for your other devices)">Edit link</button>
      <button className={layersOpen ? 'on' : ''} onClick={onToggleLayers}>Layers</button>
    </header>
  )
}
```

- [ ] **Step 6: Replace `components/Studio.tsx`**

```tsx
'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PAINTING_SIZE, type Placement } from '@/lib/doc/types'
import { fitContain } from '@/lib/geometry/place'
import { loadImage } from '@/lib/image/loadImage'
import { decodeSnapshot, encodePng, imageToPng } from '@/lib/image/png'
import { docToPainting, docToServerLayers, type LoadedDoc } from '@/lib/live/doc'
import { errorMessage } from '@/lib/live/errors'
import { LiveSync } from '@/lib/live/sync'
import { useLiveApi, type LiveApi } from '@/lib/live/useLiveApi'
import type { Renderer } from '@/lib/renderer/renderer'
import type { Stroke } from '@/lib/renderer/surface'
import LayerPanel from './LayerPanel'
import PaintCanvas, { type BrushSettings } from './PaintCanvas'
import Toolbar from './Toolbar'

interface Props {
  paintingId: string
  doc: LoadedDoc
  /** null = view only */
  editKey: string | null
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    // clipboard needs a secure origin (the LAN iPad test is plain http)
    window.prompt('Copy this link', url)
    return false
  }
}

export default function Studio({ paintingId, doc, editKey }: Props) {
  const painting = useMemo(() => docToPainting(doc), [doc])
  const canEdit = editKey !== null
  const [activeId, setActiveId] = useState<string | null>(null)
  const [brush, setBrush] = useState<BrushSettings>({ tool: 'paint', color: '#e2482d', size: 32, opacity: 1 })
  const [layersOpen, setLayersOpen] = useState(true)
  const [status, setStatus] = useState<string | null>(null)
  const [sync, setSync] = useState<LiveSync<ImageBitmap, Stroke> | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const inserts = useRef(new Map<string, Promise<unknown>>())
  const active = painting.layers.find(l => l.id === activeId) ?? painting.layers[painting.layers.length - 1]
  const live = useLiveApi(paintingId, editKey, setStatus)

  const liveRef = useRef<LiveApi>(live)
  useLayoutEffect(() => {
    liveRef.current = live
  })

  /** Each renderer (first mount, StrictMode remount) gets a fresh sync, which loads every layer. */
  const onRenderer = useCallback((renderer: Renderer | null) => {
    setSync(
      renderer &&
        new LiveSync<ImageBitmap, Stroke>({
          surface: id => renderer.surface(id),
          drop: id => renderer.dropSurface(id),
          decode: decodeSnapshot,
          get bake() {
            const api = liveRef.current
            if (!api.canEdit) return undefined
            return async (layerId: string, fromGeneration: number, pixels: Uint8Array, bakedIds: string[]) => {
              const storageId = await api.uploadPng(await encodePng(pixels, PAINTING_SIZE))
              return api.commitSnapshot(layerId, fromGeneration, storageId, bakedIds)
            }
          },
        }),
    )
  }, [])

  useEffect(() => {
    if (!sync) return
    const timer = setInterval(() => sync.tick(Date.now()), 250)
    return () => clearInterval(timer)
  }, [sync])

  useEffect(() => {
    sync?.update(docToServerLayers(doc), Date.now())
  }, [doc, sync])

  const onStroke = useCallback(
    (layerId: string, stroke: Stroke) => {
      if (!sync) return
      sync.addLocal(layerId, stroke, Date.now())
      const insert = live.addStroke(layerId, stroke).then(
        () => sync.ack(layerId, stroke.id),
        e => {
          sync.reject(layerId, stroke.id)
          setStatus(errorMessage(e))
        },
      )
      inserts.current.set(stroke.id, insert)
    },
    [live, sync],
  )

  const undo = useCallback(async () => {
    if (!canEdit || !sync) return
    const id = sync.undo(active.id, Date.now())
    if (!id) return
    await inserts.current.get(id)
    inserts.current.delete(id)
    try {
      if (!(await live.removeStroke(active.id, id))) {
        sync.unhide(active.id, id)
        setStatus('That stroke is already saved into the layer and can no longer be undone')
      }
    } catch (e) {
      sync.unhide(active.id, id)
      setStatus(errorMessage(e))
    }
  }, [active.id, canEdit, live, sync])

  const importFiles = useCallback(
    async (files: File[]) => {
      if (!canEdit) return
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue
        try {
          const bitmap = await loadImage(file)
          const png = await imageToPng(bitmap, fitContain(bitmap.width, bitmap.height, PAINTING_SIZE), PAINTING_SIZE)
          bitmap.close()
          const snapshotId = await live.uploadPng(png)
          const id = await live.addLayer({ name: file.name.replace(/\.[^.]+$/, '') || 'Image', snapshotId })
          setActiveId(id)
        } catch (e) {
          setStatus(`Could not add ${file.name}: ${errorMessage(e)}`)
        }
      }
    },
    [canEdit, live],
  )

  const addLayer = async () => {
    try {
      setActiveId(await live.addLayer())
    } catch (e) {
      setStatus(errorMessage(e))
    }
  }

  const share = async (withEditKey: boolean) => {
    const url = new URL(`/p/${paintingId}`, window.location.origin)
    if (withEditKey && editKey) url.searchParams.set('k', editKey)
    if (await copyLink(url.toString())) setStatus(withEditKey ? 'Edit link copied — keep it private' : 'View link copied')
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
        void undo()
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
        brush={canEdit ? brush : { ...brush, tool: 'pan' }}
        rendererRef={rendererRef}
        onRenderer={onRenderer}
        onRestored={() => sync?.invalidate()}
        onPlace={(layerId: string, place: Placement) => live.dispatch({ type: 'patchLayer', layerId, patch: { place } })}
        onStroke={onStroke}
        onStatus={setStatus}
      />
      <Toolbar
        brush={brush}
        onBrush={setBrush}
        painting={painting}
        dispatch={live.dispatch}
        onUndo={() => void undo()}
        onImport={files => void importFiles(files)}
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen(o => !o)}
        canEdit={canEdit}
        onShare={withKey => void share(withKey)}
      />
      {canEdit && layersOpen && (
        <LayerPanel
          painting={painting}
          activeId={active.id}
          onActivate={setActiveId}
          onAdd={() => void addLayer()}
          onRemove={id => live.dispatch({ type: 'removeLayer', layerId: id })}
          dispatch={live.dispatch}
        />
      )}
      {status && (
        <div className="status" onClick={() => setStatus(null)}>{status}</div>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Create `components/ConvexClientProvider.tsx`, `components/NewPainting.tsx` and `components/LivePainting.tsx`**

`components/ConvexClientProvider.tsx`:

```tsx
'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
import type { ReactNode } from 'react'

const url = process.env.NEXT_PUBLIC_CONVEX_URL
const client = url ? new ConvexReactClient(url) : null

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!client) {
    return (
      <main className="landing">
        <h1>09tt</h1>
        <p className="error">NEXT_PUBLIC_CONVEX_URL is not set. Run <code>npx convex dev</code> first.</p>
      </main>
    )
  }
  return <ConvexProvider client={client}>{children}</ConvexProvider>
}
```

`components/NewPainting.tsx`:

```tsx
'use client'

import { useMutation } from 'convex/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { api } from '@/convex/_generated/api'
import { generateEditKey } from '@/lib/doc/editKey'
import { errorMessage } from '@/lib/live/errors'
import { storeEditKey } from '@/lib/live/keyStore'

export default function NewPainting() {
  const create = useMutation(api.paintings.create)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const editKey = generateEditKey()
      const { paintingId } = await create({ editKey })
      storeEditKey(paintingId, editKey)
      router.push(`/p/${paintingId}`)
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <>
      <button className="button primary" disabled={busy} onClick={() => void start()}>
        {busy ? 'Creating…' : 'New painting'}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  )
}
```

`components/LivePainting.tsx`:

```tsx
'use client'

import { useQuery } from 'convex/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api } from '@/convex/_generated/api'
import { consumeEditKey } from '@/lib/live/keyStore'
import Studio from './Studio'

export default function LivePainting({ paintingId }: { paintingId: string }) {
  const [editKey, setEditKey] = useState<string | null>(null)
  useEffect(() => {
    // localStorage and ?k= only exist in the browser
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditKey(consumeEditKey(paintingId))
  }, [paintingId])

  const doc = useQuery(api.paintings.load, { paintingId })
  const keyOk = useQuery(api.paintings.checkKey, editKey ? { paintingId, editKey } : 'skip')

  if (doc === undefined) {
    return <main className="landing"><p className="muted">Loading…</p></main>
  }
  if (doc === null) {
    return (
      <main className="landing">
        <h1>Not found</h1>
        <p>There is no painting at this address.</p>
        <Link className="button primary" href="/">New painting</Link>
      </main>
    )
  }
  return <Studio paintingId={paintingId} doc={doc} editKey={editKey && keyOk === true ? editKey : null} />
}
```

- [ ] **Step 8: Routes and layout**

`app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import ConvexClientProvider from '@/components/ConvexClientProvider'
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
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  )
}
```

`app/page.tsx`:

```tsx
import NewPainting from '@/components/NewPainting'

export default function Home() {
  return (
    <main className="landing">
      <h1>09tt</h1>
      <p>Paint layers. Tell them how to move.</p>
      <NewPainting />
    </main>
  )
}
```

`app/p/[id]/page.tsx` (Next 16 passes `params` as a Promise):

```tsx
import LivePainting from '@/components/LivePainting'

export default async function PaintingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LivePainting paintingId={id} />
}
```

`app/studio/page.tsx`:

```tsx
import { redirect } from 'next/navigation'

/** Plan 1's local studio is now a live painting; start one from the landing page. */
export default function StudioPage() {
  redirect('/')
}
```

Append to `app/globals.css`:

```css
.muted { color: var(--muted); }
.landing .error { color: #ff8a7a; }
```

- [ ] **Step 9: Verify the build**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: no errors, all suites pass, and the route table lists `ƒ /p/[id]`.

- [ ] **Step 10: Verify in two browsers**

Run `npx convex dev` and `npm run dev`, then open `http://localhost:3000`.

- **New painting** lands on `/p/{id}` with Layer 1 and the cream background. Refreshing keeps everything, including recipes and placement.
- Paint a few strokes. The Convex dashboard (Data → `strokes`) shows them with `generation` 0.
- **Share** copies `/p/{id}`. Open it in a private window: the view-only bar shows, there is no layer panel, and dragging pans. New strokes from the editor appear within a moment, and motion matches.
- **Edit link** copies `/p/{id}?k=…`. Open it in a second browser profile: the URL loses `?k=`, and both windows can paint the same layer. Strokes interleave the same way in both, and neither disappears.
- Flow `rush`, blend `multiply`, Grain, Background and Pause/Play all mirror in the viewer. Pause then Play resumes from the same frame everywhere.
- Paint 40+ quick strokes on one layer, then stop. After ~2 s the dashboard shows a `_storage` file, `snapshotGeneration` 1 and 16 live strokes. After 20 s idle: generation 2 and no live strokes. Reload: the layer looks identical.
- Undo (⌘Z) removes your newest stroke in both windows. After a full bake it says the stroke is already saved.
- Paste an image: a new layer appears in both windows at 80% size, with transparent areas intact (no dark fringe).
- Moving a layer with `move` and dragging sliders stays smooth, and the viewer follows at ~20 updates/s.
- Visiting `/p/doesnotexist` shows "Not found". Visiting `/p/{id}?k=` with a wrong 32-hex key opens view-only.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(studio): live Convex painting at /p/[id] with share and view-only modes"
```

---

### Task 10: README and deploy notes

- [ ] **Step 1: Update `README.md`**

```markdown
# 09tt

Paint layers, paste collage scraps, blend them in, and tell each layer how to move. One live painting, shared by link.

## Run it

1. `npm install`
2. `npx convex dev` — first run creates the Convex deployment and writes `.env.local`; keep it running
3. `npm run dev` → http://localhost:3000 → **New painting**

## Use it

- The address `/p/{id}` is the painting. **Share** copies a view-only link; **Edit link** copies one with `?k=` for your other devices (keep it private — anyone with it can edit).
- Paste / drop / "Image" adds a layer from an image; `move` tool + Scale places it
- Flow: smoke · melt · streaks · shimmer · rush — Transform: drift · pulse · turn · breathe
- Blend in: feather · color match · edge bleed; blend modes; painting grain
- Undo removes your own recent strokes. A layer bakes its strokes into a snapshot when idle (all but the newest 16 after a short pause, all of them after 20 s), and baked strokes can't be undone

## Develop

- `npm test` — pure logic plus Convex functions (convex-test)
- `npm run typecheck`, `npm run lint`, `npm run build`
- Deploy: `npx convex deploy`, then deploy the Next.js app with `NEXT_PUBLIC_CONVEX_URL` set to the production deployment

Spec: `docs/superpowers/specs/2026-08-28-flowing-abstract-canvas-design.md`
Plans: `docs/superpowers/plans/`
```

- [ ] **Step 2: Final check and commit**

Run: `npm run typecheck && npm test && npm run lint && npm run build`
Expected: all clean.

```bash
git add README.md
git commit -m "docs: README for the live document"
```

---

## Out of scope for Plan 2 (Plan 3)

- Circle to point, extract-by-circle (Convex Node action on snapshot PNGs), the shared agent tool surface, AI SDK chat, the MCP stdio server and the Playwright two-context smoke.
- Plan 3's extract can rely on snapshots. The editor forces a full bake before extracting. MCP gets `Layer has unsaved strokes; wait a moment and retry` while live strokes exist, which is at most ~20 s after the last stroke.

## Known risks carried forward

- **Main-thread PNG encode.** Baking a 2048² layer (readPixels + unpremultiply + PNG) may hitch for 100–300 ms on an iPad. Bakes only run when the layer is idle and never during a stroke. If Plan 1's Task 15 shows a hitch, move `encodePng` to a worker (OffscreenCanvas works there).
- **Clock skew.** Clients compute motion time from the server's `startedAt` and their own clock, so two devices can be a few hundred ms apart in the loop. Fine for watching. Fix later with a server-time offset if needed.
- **Drag traffic.** Move and slider drags send ~20 mutations/s per field. Well within Convex limits for one painter, but it adds up with many editors.
- **Storage growth.** Each commit deletes the previous snapshot, and removing a layer deletes its strokes and file. Stale bakes delete their upload. Abandoned paintings are never deleted (no accounts in v1).
- **GPU memory** (from Plan 1): each layer is ~21 MB with mips. Readback allocates a temporary 16 MB target when baking a partial stroke list.
