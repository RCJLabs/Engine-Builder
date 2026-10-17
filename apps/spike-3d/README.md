# 3D spike (M1.10)

A throwaway page that measures what [D8](../../docs/decisions.md) assumes: that a phone can draw a small open world with three.js, on WebGPU or WebGL2, at a usable frame rate, and can load Rapier in reasonable time. Its phone readings set the 3D frame-rate targets, and Phase 5 builds on D8 only after them.

It is served at [`engine.rcjlabs.com/spikes/3d/`](https://engine.rcjlabs.com/spikes/3d/), beside the editor but not part of it. Nothing in `packages/` imports it, the editor's bundle and offline cache leave it out, and Phase 5's own scenes replace it.

## Taking a reading on a phone

1. Open the page on the phone. Charge it above half, close other apps, and let it cool first if it has been busy.
2. Tap **Measure all tiers** and leave the phone face up on a table. The run reloads the page once per step, about 15 s each: 6 steps on a phone with WebGPU, 3 without.
3. When the reading appears, tap **Copy reading** and send it on. It goes into ROADMAP's Readings as written.

The tier links redraw the scene at one tier, and `?backend=webgl` forces WebGL2 on a phone that has WebGPU. The live line shows frames per second over the last 2 s.

## What it draws

The same scene at every tier, so the tiers compare like with like:
- **Terrain:** a 256 × 256 heightmap of seeded value noise, 510 units across, coloured by height. 130,050 triangles.
- **Trees:** 5,000, placed by a seeded stream on gentle ground in a height band, drawn as one instanced mesh of 38 triangles each.
- **A walker:** one skinned mesh on 11 bones, walking a 36-unit circle at 1.6 units a second. The camera circles it.
- **Light:** a hemisphere light, and a sun whose 90-unit shadow box follows the walker. Sky colour and fog.

That makes 4 draw calls and 321k triangles a frame without shadows, and 6 and 511k with them. These are three's own counts, shown on the overlay.

| Tier | Pixel ratio, at most | Shadow map | Soft shadow edges | 4× MSAA |
| --- | --- | --- | --- | --- |
| Low | 1 | none | | no |
| Medium | 1.5 | 1024² | no | no |
| High | 2 | 2048² | yes | yes |

A tier draws at its own pixel ratio or the screen's, whichever is less.

## The protocol

- **One step per page load.** A step is one tier on one backend. Each starts from a fresh page, so no step inherits another's GPU state, and antialiasing can change, which needs a new renderer.
- **Order.** WebGPU comes first when the browser offers an adapter, then WebGL2. Tiers run low to high within each.
- **Timing.** Each step waits for Rapier to load and start, settles for 3 s, then records every frame's time for 10 s. A run started from a page with `?warmup=0.2&measure=1.5` uses those times instead; the e2e test runs it that way.
- **The reading gives:**
  - frames per second;
  - the median, 95th-percentile and worst frame, by nearest rank, so each is a frame that happened;
  - N frames;
  - the canvas in device pixels;
  - the backend that actually ran.
- **Rapier,** by page load: ms to import and ms to start. The first load may include the download; later ones come from the browser's cache.

The run lives in sessionStorage, so closing the tab drops it.

## What the tests prove, and what they can't

- **Physics stands on the drawn ground.**
  - Rays cast down onto Rapier's heightfield land within 0.001 of the drawn triangles, in Node and in Chromium; in practice the worst is 8.4e-6.
  - The 64 rays sit inside cells, half in each triangle and off the grid's diagonal. So a transposed field misses by up to 20 units and one split on the other diagonal by up to 0.024, and either fails.
- **`heightAt`** lies on the triangles `scene.ts` draws, tested against the mesh's own index.
- **Placement and motion.**
  - Trees stand on the ground, in the band and on gentle slopes.
  - The walker's soles ride its shins.
  - The camera keeps clear of the ground.
- **Goldens.** The terrain and the forest have golden hashes. A change to either means readings before and after it measure different scenes.
- **In the e2e tests:**
  - the page draws, and its physics check passes;
  - the overlay fits phones 360, 390 and 844 px wide, with 44 px targets;
  - a three-step run ends in a reading;
  - an installed editor's service worker leaves the page alone.
- **Not proved: speed.** Headless Chromium has no WebGPU adapter and draws the page in software (SwiftShader's WebGL2) at 2–5 fps. CI shows that the page works, never how fast. Frame rates come only from real phones.

Thirty-four planted bugs were each caught by the unit and e2e tests, and an e2e test caught the missing service-worker exclusion. The first run let four through, and each got a test that fails it:
- a tolerance loose enough to pass the wrong diagonal;
- trees allowed above the band;
- trees allowed on steep ground;
- a camera allowed to sink into hills.

The middle two never trigger on the spike's own terrain, so they are tested on small maps built for it.

## Findings for Phase 5

- **Rapier's heightfield.**
  - `ColliderDesc.heightfield(nrows, ncols, heights, scale)` takes cell counts, not vertex counts.
  - `heights` holds (nrows + 1)(ncols + 1) values column by column, with rows along z and columns along x. The field spans ±scale/2.
  - Our row-by-row grid goes in transposed (`rapierHeights`).
- **Both sides must split cells the same way.** Rapier splits each cell on the diagonal from (x, z + 1) to (x + 1, z). three draws whatever the index says, so the terrain mesh's index order follows Rapier's.
- **Scene queries need a step.** Rays hit nothing until `world.step()` has run once after a collider is added.
- **A ray straight down a triangle's edge can miss.** Of 64 rays aimed at exact vertices, 28 found nothing; moved 0.01 into a cell, all 64 hit. Ground probes should not aim at grid points.
- **Rapier's weight.**
  - `@dimforge/rapier3d-compat` inlines its 3.08 MB of WebAssembly as base64: a 4.33 MB chunk, 1.67 MB gzipped.
  - In headless Chromium, on a page drawing nothing, importing it took 217–233 ms and starting it 75–90 ms (N=5).
  - On the spike's page, while drawing in software, the same steps took about 0.9 s and 0.45 s.
  - A separate `.wasm` would be 1.17 MB gzipped against 1.65 MB, with no base64 to decode.
  - None of these is a phone number.
- **Detecting WebGPU.** Chromium can offer `navigator.gpu` with no adapter behind it, as headless Chromium does, and three then falls back to WebGL2. Count WebGPU only when `requestAdapter()` returns an adapter.

## Files

| File | Role |
| --- | --- |
| `heightmap.ts`, `props.ts` | the terrain, and where the trees stand: seeded and arithmetic only, so the same everywhere |
| `scene.ts`, `character.ts`, `view.ts` | three.js: the meshes, the skinned walker, the renderer and the frame loop |
| `motion.ts` | where the walker and the camera are at a given second |
| `physics.ts` | Rapier, loaded after the first frames, and the ray check |
| `tiers.ts`, `frames.ts`, `plan.ts`, `session.ts`, `reading.ts` | the tiers, frame statistics, the measuring run and its reading |
| `overlay.ts`, `main.ts`, `style.css` | the page |

`pnpm --filter @eb/spike-3d dev` serves the page on its own. `pnpm build` builds it into `apps/editor/dist/spikes/3d/` after the editor.

## Provenance

There are no asset files. The terrain, trees, character, colours and sky are made in code from a seed. The libraries are three.js 0.186.1 (MIT) and @dimforge/rapier3d-compat 0.21.0 (Apache-2.0).

## Open questions

1. **A separate `.wasm` for Rapier**, instead of the compat build's base64?
   - It is about 29% less to download, with no decode.
   - It needs the bundler's WebAssembly support, and whether Pages serves `.wasm` compressed is unchecked.
   - Measure both on a phone before Phase 5 picks one.
2. **three's classic `WebGLRenderer`** for the WebGL2 path, if the WebGPURenderer's WebGL2 backend proves slower on the same phone. The spike doesn't measure it.
3. **Heat.** Steps run low to high, so a phone that warms up handicaps the high tier. If a reading looks limited by heat, with frame times climbing through a step, repeat the run after a rest.
4. **Which phone is the reference?** D8 is judged on a mid-range phone. The targets come from it, so its choice is yours.
