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
| The walk's view distance (M5.10, [streaming.md](streaming.md)) | 250 m | 400 m | 600 m |

- **Nothing a tier changes moves anything.** A plant stands at a lower tier only where its draw is below the density times the tier's share, so a lower tier's plants are a subset of a higher's. Drops are taken from the first of the same seeded list.
- **Never the sim's:** a tier changes how the view draws, not the space's files, the records or what a game's sim reads.
- **Shadows:** placed objects and models cast and receive; the terrain receives; foliage casts on High only. The sun's shadow camera covers a sphere round the space's origin that holds the terrain's corners and heights and every object, fitted again as either changes or the sun moves. three's WebGPURenderer has no soft shadow map (it falls back to PCF), so High's are sharper, not softer.
- **A new tier makes a new view,** on a new canvas, since three's renderer takes antialiasing only as it is made and a canvas keeps the context it was first given; the camera and the objects chosen are kept.
- **Models' levels are picked for the view's camera alone,** before each frame. three updates an LOD for every camera it renders with, and the sun's shadow camera, 50 m off, left the far level as the one read back and the one casting the shadow: the models specs, at High, found the hills never at their nearest level.
- **Low's gradient is a sphere** of 48 × 24 segments, 2,208 triangles, where the physical sky is a box: the glade at Low draws more triangles than at Medium (Readings). Its fragments are far cheaper than the physical sky's shader, which is the cost Low is for.

## Choosing a tier

- **Quality** in the Scene panel's toolbar opens a row of its own, as Terrain does, since the toolbar already fills four rows at 360 px: there, a list of Auto, Low, Medium or High, kept per device (`localStorage`, `eb-quality`), and Stats. A tier picked by hand is used as it is: no step down.
- **Auto starts from the device's hints** (`perf/hints.ts`, a plain function with tests):
  - a software renderer (SwiftShader, llvmpipe, Microsoft Basic Render) is Low;
  - a coarse pointer (a phone or a tablet) is Medium, or Low for a GPU the table names as low-end;
  - a fine pointer is High with at least 8 cores and, where the browser says, 8 GB; Medium otherwise.
  - The GPU's name comes from WebGPU's adapter info (asked for apart from three's, which keeps its adapter to itself), or WebGL's unmasked renderer string; memory from `navigator.deviceMemory` where there is one.
  - The device's screen, which D69 lists among the hints, is not read: the pointer stands for it, and a big phone's screen says nothing a small one's doesn't.
- **Auto steps down** (`perf/stepDown.ts`, a plain function with tests). The view draws only when something changes, so it counts only frames drawn back to back, each asked for within 20 ms of the one before ending (an orbit, a stroke, falling weather). When the 95th percentile of the last 3 seconds of those frames is longer than 50 ms, it steps down one tier and starts counting again. It never steps up by itself; a reload starts from the hints again.
- **A view's first 2 seconds are let by:** three compiles each material's shaders as it first draws it, and a new view's first frames took 350 to 480 ms in software WebGL however light its tier (Readings). The overlay still shows them.
- **50 ms is provisional:** a frame rate under 20 is too slow at any tier. The targets per tier come from the M1.10 reading (D69).

## The perf overlay

**Stats** in Quality's row shows it, over the view's corner, kept per device (`eb-perf-stats`):
- the tier and why: "Auto: Medium (a phone or a tablet)", "Auto: Low, stepped down from Medium", "Chosen: High";
- the backend, WebGPU or WebGL2, and the pixel ratio;
- frames per second, and the median and 95th-percentile frame of the last 120 drawn back to back, to a tenth of a millisecond;
- draw calls and triangles of the last frame, from three's `renderer.info.render`.

It reads twice a second, judges no frame rate, and lets every touch and click through to the view. The hook (`window.__ebViewport.perf()`) gives the same, with the settings as three holds them: the renderer's pixel ratio and samples, the sun's shadow map, whether objects and foliage cast and the ground takes shadows, how far the shadow camera reaches, the sky drawn, and foliage's reach and share and weather's share.

## The budgets

- **`budgets.json`** at the repo's root holds each budget with the reading it was set from and its date.
- **Sizes**, checked by `pnpm budgets` (`tools/budgets`) after the build, in `pnpm check` and in CI. Over its budget fails, naming it and by how much.
  - `editor-start`: index.html, its module, every chunk that module imports statically and its stylesheets, each file gzipped at level 9 on its own, as a server sends it.
  - `scene-view`: the `SceneView` chunk and the chunks it imports statically that the start doesn't, the same way: three, the view and its parts.
  - `models-view`: the `modelsView` chunk and what it adds to those: the loaders and decoders.
  - `precache`: every file the service worker's list names, in bytes, as a device keeps them.
  - `space-wrecked-web`: Space-Wrecked's web export, every file in bytes. `spaceWrecked.spec.ts` reads its budget from the same entry, M4.12's 540,000.
  - Chunks are followed by their static imports only: a dynamic import is loaded when it is asked for, so it belongs to whatever asks.
- **Counts**, checked by `perf.spec.ts`: draw calls and triangles for the grove fixture's glade with the gate's box, on a 1280 × 900 desktop, orbited 50° from its framing, at each tier, once every plant's model is drawn. Over its budget fails. A phone's view is framed to its own shape, so it draws other levels of the same plants: the phone spec holds its counts to nothing.
- **A budget is a reading plus a margin** (5% for sizes, 10% for counts); `tools/budgets`'s tests hold budgets.json to it. A milestone that adds weight on purpose raises the budget in the same change, with its reading.
- **Frame times stay readings** (D69).

## The gate

- **`perf.spec.ts`** on desktop, by mouse and keys, and **`perfPhone.spec.ts`** by touch at 360×740, 390×844 and 844×390, three device pixels a point:
  - import the grove fixture, its glade now under a shower (`glade-shower`, a physical sky and rain), open the glade, and show Stats;
  - on Auto in CI's software WebGL, find Low and "a software renderer";
  - pick Low, Medium and High in turn (Medium and High on phones), and read back each tier's settings from three (pixel ratio, held to the tier's most on a phone; antialiasing; the sun's shadow map and foliage's; the sky drawn; the drops falling), the camera as it was, and on desktop the draw calls and triangles within their budgets and each lower tier's plants a subset of the higher's: no circle of 1.5 m on a 2 m grid holds more of a type's plants at the lower;
  - reload, and find the tier picked and Stats as they were;
  - from the page's first frame, record every tier the view draws: on Auto, Low alone, never a guess drawn before the hints.
- **Auto's step down,** in `perf.spec.ts`: hints a computer Auto reads as High (16 cores, 8 GB, a named GPU, no WebGPU) start the glade at High; the software renderer's frames run long, and Auto steps down with the overlay saying from what. Picked by hand, High stays through 7 seconds of the same frames.
- **Unit tests** hold the hints table, the step down (frames drawn apart never counted, the warm-up, one step at a time, never up), the editor's tier state, the tiers' shares, the shadow camera's fit, and the budgets' reader on a made-up build.
- **`pnpm budgets`** fails a build over a size budget, seen failing once with a budget set below its reading.

## Open questions

1. **The targets:** each tier's frame rate on a phone, from the M1.10 reading.
2. **The hints table** needs real phones: which GPUs are Low.
3. **A game's settings** gain Quality once M5.8 draws spaces in play; should a game's author be able to cap the tiers it offers?
4. **Post-processing** (SSAO, bloom) on High, left out by D69.
5. **Baked foliage and LOD** in an export (models.md question 2, foliage.md question 6), if phones find the scatter or the simplifier dear as a space opens.
6. **The view's chunk:** a chunk of its own for what GLTFLoader uses of three's core (26 kB, M5.5), and Preetham's sky worked out per vertex instead of `three/tsl`'s shader (105 kB, M5.4), weighed once phones have read what the chunk and the sky cost.
7. **An import over a budget** (models.md question 1): the budgets hold the build, not a project's models; a model's own budget waits for a phone's reading of what a space can hold.
8. **Low's gradient sphere** could have fewer segments if a phone finds its triangles, not its fragments, the cost.
