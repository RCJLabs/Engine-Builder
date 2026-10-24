# Performance (M5.7, D69)

M5.7 is Phase 5's seventh milestone. It gives the 3D view quality tiers that start from the device's hints and step down when frames run long, a perf overlay, and budgets CI enforces. Settled by D69: tiers, the overlay and the budgets now, the frame-rate targets from the M1.10 reading on Evan's phone when it comes; hints then step down; tiers change the renderer and the heavy extras; CI enforces sizes and counts.

Nothing here runs in a game yet: the editor's Scene panel is the only 3D view until M5.8 draws spaces in play, and then a game takes the same tiers and the shell's settings gain Quality.

## The tiers

| | Low | Medium | High |
| --- | --- | --- | --- |
| Pixel ratio | 1 | the device's, at most 1.5 | the device's, at most 2 |
| Antialiasing | off | off | on (4× MSAA) |
| The sun's shadows | none | a 1,024 map | a 2,048 map, foliage casting too |
| The sky | a physical sky drawn as its gradient | as the environment says | as the environment says |
| Foliage drawn to | half its reach | three quarters | its reach |
| Foliage thinned to | half | three quarters | all |
| Weather's drops | a quarter | a half | all |

- **Nothing a tier changes moves anything.** A plant stands at a lower tier only where its draw is below the density times the tier's share, so a lower tier's plants are a subset of a higher's. Drops are taken from the first of the same seeded list.
- **Never the sim's:** a tier changes how the view draws, not the space's files, the records or what a game's sim reads.
- **Shadows:** placed objects and models cast and receive; the terrain receives; foliage casts on High only. The sun's shadow camera covers the terrain, or the objects when there is none. three's WebGPURenderer has no soft shadow map (it falls back to PCF), so High's are sharper, not softer.
- **Antialiasing restarts the view,** since three's renderer takes it only as it is made; the camera and the objects chosen are kept.

## Choosing a tier

- **Quality** in the Scene panel's toolbar: Auto, Low, Medium or High, kept per device (`localStorage`, `eb-quality`). A tier picked by hand is used as it is: no step down.
- **Auto starts from the device's hints** (`perf/hints.ts`, a plain function with tests):
  - a software renderer (SwiftShader, llvmpipe, Microsoft Basic Render) is Low;
  - a coarse pointer (a phone or a tablet) is Medium, or Low for a GPU the table names as low-end;
  - a fine pointer is High with at least 8 cores and, where the browser says, 8 GB; Medium otherwise.
  - The GPU's name comes from WebGPU's adapter info (asked for apart from three's, which keeps its adapter to itself), or WebGL's unmasked renderer string; memory from `navigator.deviceMemory` where there is one.
- **Auto steps down** (`perf/stepDown.ts`, a plain function with tests). The view draws only when something changes, so it counts only frames drawn back to back, each asked for while the one before was drawing (an orbit, a stroke, falling weather). When the 95th percentile of the last 3 seconds of those frames is longer than 50 ms, it steps down one tier and starts counting again. It never steps up by itself; a reload starts from the hints again.
- **50 ms is provisional:** a frame rate under 20 is too slow at any tier. The targets per tier come from the M1.10 reading (D69).

## The perf overlay

**Stats** in the Scene panel's toolbar shows it, over the view's corner, kept per device:
- the tier and why: "Auto: Medium (a phone's GPU)", "Auto: Low, stepped down from Medium", "Chosen: High";
- the backend, WebGPU or WebGL2;
- frames per second, and the median and 95th-percentile frame of the last 120 drawn back to back;
- draw calls and triangles of the last frame, from three's renderer.

The hook (`window.__ebViewport.perf()`) gives the same, with the settings the tier set: pixel ratio, antialiasing, shadows, the sky drawn, foliage's and weather's shares.

## The budgets

- **`budgets.json`** at the repo's root holds each budget with the reading it was set from and its date.
- **Sizes**, checked by `pnpm budgets` after the build, in `pnpm check` and in CI: the editor's start (its module and every chunk it imports statically, gzip -9), the 3D view's chunks (`SceneView`, `modelsView`), the precache's total, and the exports the e2e already builds (Space-Wrecked's web export). Over its budget fails.
- **Counts**, checked by the gate's e2e: draw calls and triangles for the grove fixture's glade and the workshop's yard, framed, at each tier. Over its budget fails.
- **A budget is a reading plus a margin** (5% for sizes, 10% for counts). A milestone that adds weight on purpose raises the budget in the same change, with its reading.
- **Frame times stay readings** (D69).

## The gate

- **`perf.spec.ts`** on desktop, by mouse and keys, and **`perfPhone.spec.ts`** by touch at 360×740, 390×844 and 844×390:
  - import the grove fixture, open the glade, and show Stats;
  - on Auto in CI's software WebGL, find Low and its reason;
  - pick Low, Medium and High in turn, and read back each tier's settings from three (pixel ratio, antialiasing, shadows, the sky drawn), the foliage drawn (a subset at each lower tier: every plant drawn at Low drawn at High), and the draw calls and triangles within their budgets;
  - reload, and find the tier picked and Stats as they were.
- **Unit tests** hold the hints table, the step down (frames drawn apart never counted, one step at a time, never up), the tiers' shares, and the budgets' reader.
- **`pnpm budgets`** fails a build over a size budget, seen failing once with a budget set below its reading.

## Open questions

1. **The targets:** each tier's frame rate on a phone, from the M1.10 reading.
2. **The hints table** needs real phones: which GPUs are Low.
3. **A game's settings** gain Quality once M5.8 draws spaces in play; should a game's author be able to cap the tiers it offers?
4. **Post-processing** (SSAO, bloom) on High, left out by D69.
5. **Baked foliage and LOD** in an export (models.md question 2, foliage.md question 6), if phones find the scatter or the simplifier dear as a space opens.
