# Decisions

Each decision is numbered and dated, with a status:

- **LOCKED** is settled. Changing it takes a new dated entry that says why.
- **PROPOSED** is the working plan until the milestone named in it confirms it.
- **OPEN** is waiting on a call.

Product decisions are Evan's. The others record what was chosen and why.

---

### D1. A browser-first TypeScript engine. LOCKED, 2026-10-17 (the brief)

**Decision.** Build a TypeScript engine and editor that run in the browser. Don't build on Godot, Unity or Unreal.

**Why.**
- The whole portfolio is web-first: PWAs on GitHub Pages and TWAs on Play.
- The editor has to work on a phone, including iOS, which a browser covers.
- The existing games' sims are TypeScript and can move over.
- Download size matters: 2060td dropped Phaser because it was three quarters of the download. A WebAssembly engine runtime would add megabytes to every game.

**Cost.** Everything an off-the-shelf engine provides has to be built or assembled from libraries. That is why the roadmap grows the engine only through proof games.

### D2. The sim decides, the stage renders. LOCKED, 2026-10-17

**Decision.**
- Game state changes only through `reduce(state, action, ctx) → { state, events }`, in packages marked `"eb": { "pure": true }`.
- `tools/lint-boundaries` (ported from chooser-of-the-dead, with a tokenizer in place of its comment regex) and a tsconfig without DOM or Node types enforce purity.
- Stages (DOM, 2D, 3D) render state and turn input and physics facts into actions.

**Why.** Every recent game already works this way. It is what makes saves, replays, daily seeds, golden tests and headless balance bots possible.

**Cost.** In 3D, frame-level motion is not deterministic. Replays re-run actions, not frames (see architecture.md).

### D3. Toolchain. LOCKED, 2026-10-17

**Decision.**
- pnpm 10 workspaces, TypeScript 7.0 strict (`erasableSyntaxOnly`, `noUncheckedIndexedAccess`), Vite 8, Vitest 5, Biome 2.5.
- Playwright 1.56.1 with axe.
- Node ≥ 22.18, so tools run with native TS stripping.

**Why.**
- These are the newest pinned toolchains in the most recent repos (chooser-of-the-dead, who-am-i-).
- Playwright 1.56.1 matches the Chromium preinstalled in Claude Code's cloud containers, so e2e runs there with no browser download. CI installs its own.

### D4. Preact + signals for the editor and in-game UI. LOCKED for the editor, PROPOSED for game UI until M4.1, 2026-10-17

**Decision.** Preact 11 with @preact/signals. Reach for React-only libraries through `preact/compat` only when unavoidable.

**Why.**
- Small, which matters for a game's download.
- React-compatible.
- Already the favoured stack in chooser-of-the-dead and climbing-world-traveler.

### D5. Project format: a folder of JSON, one record per file. PROPOSED until M1.4, 2026-10-17

**Why JSON rather than YAML.**
- The editor writes these files. JSON round-trips without losing formatting or comments that the editor would never see.
- Diffs stay small with one record per file and stable key order.
- JSON Schema still gives autocomplete when editing by hand.

**Revisit if** hand-writing long prose in JSON proves painful. Long-form text belongs in ink anyway.

### D6. One condition language, one effect vocabulary, all data. LOCKED, 2026-10-17

**Decision.** Quests, dialogue, events, triggers, achievements and UI bindings share one condition tree (with a text form that round-trips) and one effect list. `preview()` gives the exact odds shown on screen.

**Why.**
- wasteland-protocol's content is closures, so it can't be saved, validated or edited in an editor.
- space-wrecked's and dirtbag's data-only conditions and effects can.
- One vocabulary means one set of editor pickers.

### D7. Logic: no-code triggers plus TypeScript; node graphs later. LOCKED, 2026-10-17 (Evan's call)

"When / If / Do" trigger sheets cover most mission and level logic. TypeScript script components cover the rest. Node graphs come in Phase 8 and compile to the same runtime.

### D8. 3D: three.js WebGPURenderer with WebGL2 fallback; Rapier; recast-navigation-js. PROPOSED until the M1.10 spike readings, 2026-10-17

**Why.**
- three.js has the largest ecosystem, and its `WebGPURenderer` falls back to WebGL2 automatically.
- WebGPU is on by default in Chrome (Android 12+ on Qualcomm and ARM GPUs, with a compatibility mode for older phones since Chrome 146) and in Safari 26, including iOS 26.
- Rapier runs in browsers and in Node, so 3D quests can be bot-tested headless.
- All of it is lazy-loaded, so games without 3D never download it.

**What would change it.** Spike readings on a mid-range phone that miss the Low-tier target.

### D9. Dialogue: visual trees plus ink scenes. PROPOSED until M3.6, 2026-10-17

- Trees in dirtbag's `TalkDef` shape for most talk; they are editable as a graph on a phone.
- ink for long-form writing, with chooser-of-the-dead's stateless scene player.
- Both use the shared conditions and effects.

### D10. Editor storage: OPFS, "open folder", zip; GitHub sync in Phase 4. PROPOSED until M2.1, 2026-10-17

The domain it lives on is OPEN (ROADMAP open question 1). Browser storage is per origin, so moving domains later strands projects stored in the browser.

### D11. Export targets as a per-project matrix. PROPOSED until M4.8, 2026-10-17

The targets are Pages PWA, single-file HTML, itch.io, Play TWA, and later Electron/Steam. Each has an edition (demo, full, playtest), packs, a storage namespace and a leak check. The pattern comes from chooser-of-the-dead's `targets.ts`, and the TWA pipeline from dirtbag's `build-twa.yml`.

### D12. Build order: core + UI, then 3D, then 2D. LOCKED, 2026-10-17 (Evan's call)

The core and UI phases already ship menu- and map-driven games. 3D is the headline feature. 2D comes last, reusing the 3D viewport in orthographic mode.

### D13. Phone editing: every panel works on touch, tuned for PC and tablet. LOCKED, 2026-10-17 (Evan's call)

Data, missions, dialogue, UI and scripts must be comfortable on a phone. 3D layout works there, but it is best on a tablet or PC.

### D14. Proof #1 is Space-Wrecked, acts 1–2. LOCKED, 2026-10-17 (Evan's call)

Its JSON events, quests and contracts are the cleanest existing content data, so importing them tests the record, condition and effect model against real data. The ship builder and boarding tactics follow in Phase 7 as proof #3.

### D15. Work lands by pull request into `main`. LOCKED, 2026-10-17 (Evan's call)

`main` started as a one-file README commit, so the first real change could be reviewed as a draft PR.

### D16. Editor updates: prompt only, never forced. LOCKED, 2026-10-17

**Decision.**
- vite-plugin-pwa runs in `prompt` mode.
- The editor checks for a new version when it becomes visible, and every 6 hours while it stays visible.
- "Later" holds the prompt for 24 hours.
- "Reload" works even on the first launch after an install (`src/pwa/applyUpdate.ts`).

**Why.** These are project-ascent's measured rules (M19, M154, M302). An installed app is resumed rather than navigated, so the browser rarely checks on its own, and a forced reload loses work.

### D17. RNG: sfc32 seeded by splitmix32, with fork-by-label streams; FNV-1a over UTF-8. PROPOSED until M1.1, 2026-10-17

**Why.**
- sfc32 is chooser-of-the-dead's choice. It is statistically stronger than the mulberry32 copied through the other repos.
- Forking by label keeps a stream independent of how many numbers other systems drew.
- FNV-1a over UTF-8 bytes, rather than UTF-16 code units (landnam), matches the published test vectors, so C++ or C# ports agree.
- `@eb/core`'s `fnv1a32` already follows this.

### D18. One CI workflow verifies and deploys. LOCKED, 2026-10-17

**Decision.** `.github/workflows/ci.yml` verifies every push and PR. On `main` it deploys the same `dist` that passed, then waits until the live `version.json` names the commit.

**Why.** who-am-i- deploys the exact artifact it verified, and dirtbag confirms the live version. The plan's separate Pages workflow would have rebuilt what CI had already checked.

---

## Open

- **Editor domain** (ROADMAP open question 1).
- **Engine licence** (ROADMAP open question 2).
- **Theme of proof #2** (ROADMAP open question 3).
- **TWA package id scheme** (ROADMAP open question 4).
