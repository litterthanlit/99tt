# Flowing Abstract Canvas — v1 Design

Date: 2026-08-28  
Status: draft, pending user review  
Repo: `litterthanlit/99tt`

A web painting app (iPad Safari first, desktop included) for layered, moving abstracts. You paint the layers, circle one to point or extract, and tell an in-app agent — or an external agent over MCP — how that layer should flow. Everyone looks at the same live Convex document. A share URL lets someone else watch it live.

This spec is the v1 product, not a later native iPad app, particle system, brush engine, accounts, or video export.

## Locked decisions

| Choice | Decision |
| --- | --- |
| Core loop | You draw the layers, then circle and instruct motion |
| Surface | Web canvas tuned for iPad Safari (option B), not native Swift |
| Agent | In-app chat **and** MCP on the same tools (option C) |
| Motion | Living texture is the signature; transforms always available; particles later (option D) |
| Selection | Named layers **and** extract-by-circle (option C) |
| Document | One live cloud painting (option A) |
| v1 “real” | Paint, circle, animate, live doc, extract-by-circle, small recipe set, shareable URL (option B) |
| Stack | Next.js + WebGL2 + Convex + Vercel AI SDK + MCP adapter |

## Goals

A painter on iPad can:

1. Paint several named raster layers with a Pencil (finger works too).
2. Draw a loop around a mass and have the app focus the layer under that loop.
3. Lift that mass into a new layer when it was stuck on the wrong one.
4. Say “make this drift like smoke” in chat, or the same thing via MCP, and see the paint flow.
5. Send `/p/{id}` to someone who watches strokes and motion live but cannot edit.

Success is that loop on a real iPad Safari session plus a second browser on the share URL — not a renderer demo without a user-facing path.

## Non-goals (v1)

- Native Swift / PencilKit / App Store
- Particle emission
- Fancy brush engine, blend-mode encyclopedia, timeline editor
- Accounts, galleries, billing
- Video / GIF export
- Agent-painted strokes
- Invented shaders (the model may only pick named recipes)
- Real-time pixel streaming (WebRTC)

## Architecture

One Convex painting is the source of truth. iPad Safari, desktop, in-app chat, and MCP never talk to each other directly. They read and write that document.

```
iPad / desktop browser          Cursor / external agent
        |                                |
        | subscribe + mutations          | MCP tools
        v                                v
   Next.js app  ---- AI SDK tools --->  Convex
   WebGL renderer                       (painting, layers, strokes, files)
```

**Units** (one purpose each, testable alone):

| Unit | Does | Depends on |
| --- | --- | --- |
| Renderer | Layer textures, brush stamp, flow shaders, transforms, composite | WebGL2, recipe uniforms, not Convex |
| Gestures | Paint strokes, pinch pan/zoom, circle loop, hit-test | Renderer pixel readback |
| Document API | Paintings, layers, strokes, snapshots, focus, playback, recipes | Convex |
| Tool surface | `list_layers`, `select_layer`, `extract_region`, `set_flow`, `set_transform`, `clear_animation`, `set_playback`, `get_layer_preview` | Document API |
| Extract action | Feathered punch from snapshot PNGs (Node) | Convex storage, no WebGL |
| Chat | Natural language → tool calls, optional layer thumbnail | AI SDK, tool surface |
| MCP adapter | Same tools over MCP (stdio; painting id + edit key) | Tool surface / Convex HTTP client |
| Share route | `/p/{id}` view-only when no edit key | Document API (queries only) |

### Access

- Painting ids are unguessable Convex ids.
- An **edit key** (32 hex chars) is generated at create time. Convex stores `editKeyHash` (SHA-256 hex of the key), never the key.
- Mutations require `editKey` and compare hashes. Queries for the painting do not. Queries never return `editKeyHash`.
- The painter’s browser keeps the key in `localStorage` under `painting:{id}:editKey`. Optional `?k=` on first load is consumed, stored, then stripped from the URL.
- MCP config gets `PAINTING_ID` + `EDIT_KEY` (and Convex URL).
- No Clerk / accounts in v1.

### Canvas size

Fixed **2048×2048** painting. The view letterboxes with object-fit contain. Caps iPad retina memory and keeps shaders honest.

## Canvas, drawing, and gestures

The iPad screen is the painting. Chrome stays thin: tool strip, peekable layer stack, chat as a slide-over.

**Paint.** Always on the active layer. One round brush: color, size, opacity. Pencil pressure when Safari exposes it; otherwise constant full pressure. If a Pencil is in contact, ignore finger (palm rejection). Pinch-zoom and two-finger pan move the view; a one-finger or Pencil stroke never pans.

**Layers.** Named, ordered, show/hide, opacity. Add, rename, reorder. Blend mode is `normal` only. Two pointers, independent:

- **Active** (per browser): where new strokes go. Not stored on the server. Tap a layer name to paint on it.
- **Focused** (`focusedLayerId` on the painting): what “this” means to chat and MCP. Circle, `select_layer`, or the layer row’s target control sets it. Create starts with Layer 1 focused, so “this” works before anyone circles.

You can paint on layer 3 while the agent talks about layer 1.

**Circle to point.** Circle tool (or equivalent control). Draw a loop; auto-close on lift. Score each **visible** layer by opaque coverage inside the loop (sample the layer texture, alpha > ~8/255). Highest score becomes `focusedLayerId`. A light outline shows the pick. If the top two scores are within 10% and both non-zero: do not guess; leave focus unchanged and return `Which layer?` plus the short list.

**Circle to extract.** Same loop, then “Lift into new layer” (button or `extract_region`). Source is the focused layer, or an explicit layer id from the agent. Copy pixels inside the loop with an **8px feather**, punch them out of the source, create a new top layer, focus it, make it active on the calling client. Empty/transparent loop: no layer, `Nothing to lift in that loop`. Ambiguous scores: do not extract; `Which layer?`.

Extract runs as a Convex **Node action** on the latest **snapshot PNGs** (so MCP works with no iPad channel). The editor bakes a snapshot immediately before calling the action. MCP calling `extract_region` while the layer still has unbaked strokes gets `Layer has unsaved strokes; wait a moment and retry` — it does not invent pixels.

**Undo.** Stroke-level undo for paint (delete last stroke on the active layer, same generation). Extract undo is one-shot and **local to the editor session**: restore the source snapshot/generation the client remembered, delete the new layer. Refresh loses that undo. No timeline.

## Animation recipes

Each layer has two optional slots (not a node graph):

- **Flow:** `none` | `smoke` | `melt` | `streaks` | `shimmer`
- **Transform:** `none` | `drift` | `pulse` | `turn` | `breathe`

Knobs (all numbers, with defaults):

| Knob | Default | Meaning |
| --- | --- | --- |
| speed | 1 | Time scale |
| intensity | 0.5 | Displacement / effect amount, 0–1 |
| direction | 0 | Degrees; 0 = right, 90 = up. `melt` defaults to 270 (down) if unset |
| seed | random int at assign | Shared noise seed so clients match |

Looks:

- **smoke** — slow noisy drift, soft; vapor
- **melt** — gravity warp/drip
- **streaks** — directional smear (light-trail / pixel-sort read)
- **shimmer** — small in-place turbulence
- **drift** — intact layer translates along direction
- **pulse** — scale throb around the layer’s alpha centroid
- **turn** — slow rotation around that centroid
- **breathe** — opacity pulse (layer opacity is the midpoint)

No particles. One flow and one transform per layer. `clear_animation` sets both to `none`. Unknown recipe names are errors; the model does not invent shaders.

Playback is global on the painting: `playing` (boolean) and `startedAt` (ms, set inside the mutation when transitioning to playing). Clients derive `t` from `startedAt` and local clock. Queries never call `Date.now()`.

## Tool surface (chat and MCP)

Same Convex functions, same validators.

| Tool | Args | Result |
| --- | --- | --- |
| `list_layers` | painting id (no edit key) | id, name, order, visible, opacity, flow, transform, focused? |
| `get_layer_preview` | painting id, layer id | short-lived URL of snapshot PNG, or empty if none baked |
| `select_layer` | painting id, edit key, layer id | sets `focusedLayerId` |
| `extract_region` | painting id, edit key, optional layer id, polygon `[{x,y}]` in painting space | new layer id; Node action on snapshots |
| `set_flow` | painting id, edit key, optional layer id, recipe, knobs | patched layer |
| `set_transform` | painting id, edit key, optional layer id, recipe, knobs | patched layer |
| `clear_animation` | painting id, edit key, optional layer id | both slots `none` |
| `set_playback` | painting id, edit key, playing boolean | painting playback fields |

Omitted layer id means `focusedLayerId`. After create that field is always set. If a caller clears it somehow: `Which layer?` and a list. In-app chat attaches a thumbnail from `get_layer_preview` after a bake so the model can see fresh paint.

Chat: Next.js AI SDK route (vision-capable model, key on the server). User text plus optional focused-layer thumbnail. The model only calls these tools.

MCP: stdio server (`mcp/server.ts`) wrapping the same functions via `ConvexHttpClient`. Env: `CONVEX_URL`, `PAINTING_ID`, `EDIT_KEY`. It cannot reach the iPad. Cursor (or any MCP client) points at that server while the browser already has `/p/{id}` open.

## Data flow

**Create.** Mutation inserts painting (2048×2048, `playing: true`, `startedAt` now), one empty layer named “Layer 1”, sets `focusedLayerId` to that layer, returns `{ paintingId, editKey }`. Client stores the key and navigates to `/p/{id}`.

**Load.** Subscribe to painting + layers (indexed by `paintingId`). Download each layer’s snapshot file into a WebGL texture (clear texture if none). Replay strokes whose `generation` equals the layer’s `snapshotGeneration`.

**Paint.** Local stamp into the active layer texture on pointer move (zero-latency). On lift, insert a stroke: layer id, generation (= current `snapshotGeneration`), color, size, opacity, points `[{x,y,pressure}]` simplified to **≤512** points. Other clients replay onto that texture. After **1500ms** idle on that layer, the painter rasterizes PNG, uploads to Convex storage, patches `snapshotId` + increments `snapshotGeneration`. Further strokes use the new generation. Cold loads do not replay baked strokes.

**Circle → point.** Local hit-test; mutation sets `focusedLayerId`.

**Circle → extract.** Editor bakes the source layer snapshot immediately, then calls the extract action with the polygon. The action (Node) loads the source PNG, applies the feathered mask, writes punched source + new layer files, patches source `snapshotId` / `snapshotGeneration++`, inserts the new layer (generation 0, order max+1, its snapshot), sets focus. All clients reload those two textures and drop baked source strokes. MCP uses the same action; if strokes exist at the current generation, it throws `Layer has unsaved strokes; wait a moment and retry`.

**Animate.** Recipe patches are metadata. Renderers update uniforms/matrices every frame. All clients run the same shader with the same seed.

**Share.** `/p/{id}` without a stored edit key: same subscription, renderer, no mutations, no chat compose, no MCP from that browser. Watchers see live strokes and motion.

Stroke insert is the source of truth until a snapshot succeeds. Snapshot failure retries in the background; the local texture is not rewound.

## Schema (Convex)

Tables stay flat. Index foreign keys.

**paintings**

- `width`, `height`: number (2048, 2048)
- `playing`: boolean
- `startedAt`: number
- `focusedLayerId`: optional id `"layers"`
- `editKeyHash`: string
- `createdAt`: number

**layers**

- `paintingId`: id `"paintings"`
- `name`: string
- `order`: number
- `visible`: boolean
- `opacity`: number
- `snapshotId`: optional `v.id("_storage")`
- `snapshotGeneration`: number
- `flow`: `"none" | "smoke" | "melt" | "streaks" | "shimmer"`
- `flowSpeed`, `flowIntensity`, `flowDirection`, `flowSeed`: number
- `transform`: `"none" | "drift" | "pulse" | "turn" | "breathe"`
- `transformSpeed`, `transformIntensity`, `transformDirection`: number
- indexes: `by_painting` (`paintingId`), `by_painting_and_order` (`paintingId`, `order`)

**strokes**

- `paintingId`: id `"paintings"`
- `layerId`: id `"layers"`
- `generation`: number
- `color`: string (hex)
- `size`: number
- `opacity`: number
- `points`: array of `{ x, y, pressure }` (capped)
- indexes: `by_layer_and_generation` (`layerId`, `generation`)

Public queries/mutations: `args` + `returns` validators. Mutations that edit require `editKey`. Internal snapshot helpers are internal functions. Scheduler, if used, only calls `internal.*`.

## Errors

| Case | Behavior |
| --- | --- |
| Missing/wrong edit key | Throw `Unauthorized`. Canvas view-only. Chat/MCP show that message. |
| Unknown painting | Throw `Painting not found`. Route shows a not-found screen. |
| Unknown layer | Throw `Layer not found`. |
| Unknown recipe | Throw `Unknown recipe`. Model may retry with a named one; it must not invent a shader. |
| Snapshot upload fails | Keep strokes; retry PNG. Do not rewind local texture. |
| Empty extract | No new layer. `Nothing to lift in that loop`. |
| Extract with unbaked strokes (MCP) | Throw `Layer has unsaved strokes; wait a moment and retry`. |
| Ambiguous circle | No focus change. `Which layer?` + list. |
| WebGL context lost | Rebuild from snapshots + unbaked strokes. If that fails: `Reload to restore the canvas`. |
| No Pencil pressure | Full pressure. Not an error. |
| Viewer calls a mutation | `Unauthorized`. |

## UI surfaces (user-facing path)

- **Landing (`/`):** “New painting” creates a doc and enters it. No gallery.
- **Painting (`/p/[id]`):** Full-viewport canvas, tool strip (paint / circle / color / size / undo / lift), layer peek, play/pause, chat slide-over, copy-share-link.
- **Viewer:** Same canvas without edit chrome.
- **iPad Safari:** `viewport-fit=cover`, `touch-action: none` on the canvas, overscroll disabled, `apple-mobile-web-app-capable`. PWA install is optional sugar, not required for v1.

This is not complete until `/p/[id]` can paint, circle, lift, chat-animate, and share — Convex alone is not the feature.

## Testing

Prove the loop, not a Pencil farm.

**Convex (`convex-test`).** Create painting; reject bad edit keys; insert stroke; bump snapshot generation; extract writes two snapshots and a new layer; `set_flow` / `set_transform` accept only named recipes; play/pause writes `startedAt`; viewer queries work without the key.

**Hit-test and extract.** Fixture buffers: opaque blob on A, empty on B → circle picks A. Transparent loop → `Nothing to lift`. Extract punches source and focuses the new layer. Close scores → `Which layer?`.

**Tools.** Chat and MCP call the same functions. Unknown recipe errors. No focus and no layer id → `Which layer?`.

**Renderer.** Where WebGL is missing, test recipe → uniform mapping, transform matrices, and “replay strokes after snapshot.” No pixel-perfect shader stills in CI.

**Browser smoke (Playwright, desktop).** Paint a stroke, circle it, apply `smoke`, open the share URL in a second context, see the layer + motion, confirm the viewer cannot mutate.

**Manual.** iPad Safari + Pencil: draw, palm rejection, circle, lift, chat, second device on the share URL.

## File layout (target)

```
app/page.tsx                  landing
app/p/[id]/page.tsx           painting / viewer
app/api/chat/route.ts         AI SDK
convex/schema.ts
convex/paintings.ts
convex/layers.ts
convex/strokes.ts
convex/snapshots.ts           upload + generation bump
convex/extract.ts             "use node" extract_region action
convex/tools.ts               the shared tool functions
lib/renderer/                 WebGL only
lib/gestures/                 pointer, circle, hit-test
mcp/server.ts
```

## Implementation order (for the later plan, not this spec)

1. Convex schema + create/load painting + edit key + landing and empty `/p/[id]` canvas shell
2. WebGL canvas + brush + layer stack (local, then wired)
3. Live strokes + snapshot bake
4. Circle to point + focus
5. Extract-by-circle
6. Flow shaders + transforms + play/pause
7. In-app chat tools
8. MCP adapter
9. Share URL viewer + Playwright smoke

Each step must leave a user-visible path, not only backend.

## Risks

- **Safari WebGL context loss** — restore path is mandatory.
- **Snapshot vs stroke races** — generation number is the contract; never replay baked strokes.
- **iPad memory** — 2048 textures × N layers; keep layer count practical (warn at 16, do not hard-crash).
- **MCP without the browser** — recipes still persist; motion is visible when any client is open. MCP does not composite video.
- **Model misfires** — closed recipe enum + “which layer?” beats a clever compositor.

---

## Addendum — 2026-09-25 (after reference review)

References: the 99tt Cosmos board. It has a painterly forward-rush landscape clip (Benjamin Bardou, via cosmos.so/e/856982580), a horizontal light smear, a zoom-burst night street, a watercolor bloom, a torn collage, and scribble over paint. Also, Nick works in cut-and-paste layers that often don't sit into the painting.

1. **New flow recipe `rush`.** Forward travel toward a vanishing point. Adds knobs `originX` and `originY` (0–1, painting space, default 0.5). Content streams outward from the origin in brush-shaped radial smears, on a seamless two-phase zoom loop that never visibly resets. It covers the Bardou clip and the zoom-burst street.
2. **`streaks`** smears in bands that vary across the direction, for the light-trail / pixel-sort look.
3. **Image import.** Paste, drag-drop or the file picker creates a new layer from the image, downscaled to ≤2048 px and fit to 80% of the canvas. This is how collage material gets in.
4. **Layer placement.** `place {x, y, scale}` is non-destructive metadata, and the Move tool drags it. Strokes land in layer space.
5. **Blend modes.** `normal | multiply | screen | overlay | soft-light | darken | lighten` (replaces "normal only").
6. **Blend in (harmonize).** The fix for pasted layers that don't blend in. Per layer, non-destructive, live in the shader:
   - `feather` (0–64 px): softens the cut edge.
   - `colorMatch` (0–1): Reinhard Lab transfer of the layer's colors toward what sits beneath its footprint.
   - `bleed` (0–1): slow animated wobble only at the layer's edge, so the cut dissolves into its neighbours.
   - A one-tap **Blend in** preset: feather 12, colorMatch 0.4, bleed 0.35.
7. **Painting-wide `grain` (0–1) and `background` color.** One shared grain over every layer ties collage sources together.
8. **Playback.** `pausedElapsed` (seconds) lets pause freeze motion and play resume from the same frame. `t = playing ? pausedElapsed + (now − startedAt)/1000 : pausedElapsed`.
9. **Agent tools.** The agent gains `set_blend(mode)` and `blend_in(feather?, colorMatch?, bleed?)` on the same validators. `set_flow` accepts `rush` with `originX`/`originY`.
10. **Schema additions (Plan 2).** Layers get `blend`, `placeX`, `placeY`, `placeScale`, `flowOriginX`, `flowOriginY`, `harmonizeFeather`, `harmonizeColorMatch` and `harmonizeBleed`. Paintings get `grain`, `background` and `pausedElapsed`.
11. **Build order.** Renderer and motion come first, running locally (Plan 1), so the looks can be tuned against the references before the live document exists. Then Plan 2 (live Convex document + share URL), then Plan 3 (circle, extract, chat, MCP).
