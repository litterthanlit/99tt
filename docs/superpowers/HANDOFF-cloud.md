# Handoff — Plan 1 build (cloud session)

**Date:** 2026-09-25
**Repo:** `litterthanlit/99tt`
**Branch to create:** `feat/motion-canvas`. Open a PR into `main` when done.

## What this is

This is a web painting app, iPad Safari first. You paint or paste layers, make pasted scraps blend in, and give each layer a named motion recipe that plays live in WebGL2. Later, an agent (chat or MCP) sets those recipes on a layer you circle.

- **Spec:** `docs/superpowers/specs/2026-08-28-flowing-abstract-canvas-design.md`. Read the **2026-09-25 addendum** at the bottom: it adds the `rush` recipe, image import, placement, blend modes, "Blend in" and grain.
- **Plan to execute:** `docs/superpowers/plans/2026-09-25-plan-1-motion-canvas.md`. It's self-contained, with full code, tests and commands for every task.

The repo has only `README.md` and `docs/` at the start. Nothing is built yet.

## Your job in this session

Execute Plan 1 with **superpowers:subagent-driven-development**. Run the implementer, then the spec reviewer, then the quality reviewer, with fixes between.

| Run here (cloud) | Defer to the local session (needs a browser or iPad) |
| --- | --- |
| Tasks 0–13 and Task 17 | Task 14 (import / blend-in browser check), 15 (iPad + Pencil), 16 (look-tuning against the references) |

Suggested batching, one implementer per batch, each followed by both reviews:

1. Tasks 0–2: scaffold, document types and recipes, reducer
2. Tasks 3–6: geometry, brush and pointers, color and harmonize stats, motion math
3. Tasks 7–11: shaders, GL core, painter, surface, compositor, analyzer, renderer, image loading
4. Tasks 12–13: studio UI
5. Task 17: typecheck, tests, build, README

## Notes and gotchas

- **Task 0:** `create-next-app` refuses a folder containing `README.md`. The plan moves it to `/tmp` and back; keep that step. `docs/` is allowed.
- **Browser checks inside tasks.** Tasks 12 and 13 each end with a "Verify in the browser" step. In the cloud, replace that step with `npm run typecheck && npm test && npm run build`, then check that `npm run dev` serves `/` and `/studio` with HTTP 200 (`curl -sI`). Note in the PR that the visual checks are deferred to the local session.
- **Shader compile errors** only surface in a real browser. Keep GLSL exactly as written in the plan. If you change any GLSL, list it in the PR description so the local session checks it first.
- **Do not tune shader constants.** That's Task 16, done by eye later.
- **Commits:** one per task, as written in the plan. Don't squash.
- **Out of scope:** Convex, share URL, circle/extract, chat, MCP (Plans 2–3). Don't start them.

## When done

1. Push `feat/motion-canvas` and open a PR into `main`. The description should cover:
   - the tasks completed
   - test count and results
   - anything that deviated from the plan
   - the deferred list: Tasks 14, 15, 16 and the visual parts of 12 and 13
2. Leave a short status at the bottom of this file under **Status**.

## Next (local session, later)

1. Pull the branch and run `npm run dev`.
2. Do the browser checks in Tasks 12 and 13, then Tasks 14 and 16 against the 99tt Cosmos references (the Bardou rush clip, light streaks, zoom burst, watercolor, collage).
3. Do Task 15 on the iPad.
4. Then write Plan 2 (live Convex document + share URL).

## Status

**2026-09-26 — cloud session done.** Branch `claude/clever-hypatia-9x4qbt` (the session's assigned branch, used instead of `feat/motion-canvas`).

- Tasks 0–13 and 17 are committed, one commit per task. Code matches the plan verbatim. No GLSL or shader constants were changed.
- `npm run typecheck`, `npm test` (8 files, 58 tests), `npm run lint` and `npm run build` are all clean. `npm run dev` serves `/` and `/studio` with HTTP 200.
- Deviation: `@types/node` was bumped from `^20` to `^22`, because vitest 5 refuses `^20` as a peer dependency. The scaffold is Next 16.3 and React 19.2. `create-next-app` also added `AGENTS.md`/`CLAUDE.md`, and they're committed as-is.
- Extra check (not in the plan): headless Chromium on SwiftShader WebGL2 compiled every shader program with no errors. A mouse stroke painted under the cursor. Layer 2 ran `rush` + `multiply` + `turn`, and pause/play, undo, image import and **Blend in** all worked with no console errors. This is not a substitute for the real-GPU visual checks.
- Still to do locally: the browser checks in Tasks 12 and 13, then Tasks 14, 15 and 16.
