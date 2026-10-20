# Runtime UI in the existing games (M4.1, D51)

A read-only survey of how the portfolio's browser games build their in-game UI, taken on 2026-10-19 for M4.1 and M4.2. Paths are under `/home/user/rcjlabs/`:
- DB is `dirtbag/app/src`;
- SW is `space-wrecked/src`;
- CD is `chooser-of-the-dead/packages/ui/src`.

What was seen comes first; inferences are marked as such.

## Screens and how they switch

- **Dirtbag:**
  - React panels drawn over a canvas, with no router.
  - One `Ui` object holds the view, the open sheet and the talk (DB/game/game.ts:106-249).
  - There are about 45 kinds of sheet, built mostly from row data (DB/ui/sheets.ts). Some sheets can't be closed: dead, retired, encounter (game.ts:523-557).
  - Its one transition is a fade (DB/ui/App.tsx:313).
- **Space-Wrecked:**
  - Plain DOM.
  - `state.screen` names a screen module (SW/ui/screens.js:20-39). Each module mounts and returns `{resize, draw, unmount}`, drawing its own canvas (SW/ui/title.js:20-110).
- **Chooser:**
  - Preact with signals.
  - A `screen` signal of 12 values (CD/store.ts:681-696) feeds a switch (CD/App.tsx:55-78), and the campaign's screens load lazily.
  - Modals are `aria-modal` overlays (CD/shift/Shift.tsx:900,944).
- **Elsewhere:** landnam keeps a stack of modes (landnam/src/modes.ts:1-31).

## State into the UI, buttons into actions

- **Dirtbag:**
  - A small store read through `useSyncExternalStore`, kept as two stores: a slow one per action and a fast one per frame (DB/game/store.ts:1-35).
  - Buttons call `act()`, whose events become toasts and cards (game.ts:453-502).
- **Space-Wrecked:**
  - A Redux-like store whose reducer returns the same object when nothing changed (SW/core/store.js:1-37).
  - Buttons dispatch through `onTap` (title.js:52-72).
- **Chooser:** `act()` steps the pure engine and updates the signals in one batch (CD/store.ts:834-858). This is the closest to the engine's sim and stage: a session's actions in, its facts out as signals.

## Phones

- **Dirtbag:** a 360×740 logical screen scaled by one factor, wider in landscape (App.tsx:31-58), with the stage padded by the safe-area insets (DB/ui/styles.css:29-35). From 1080 px wide, sheets dock beside it (1134-1153). No rule on touch-target size was found.
- **Space-Wrecked:** landscape only. Buttons are at least 48 px (SW/ui/style.css:81-84), the insets are respected (48-55), and portrait shows a rotate overlay.
- **Chooser:**
  - a desk layout, or on phones a drawer (CD/layout.ts:6-8);
  - 44 px buttons, with a rule for touch screens (CD/styles.css:186-237);
  - insets taken with `max()` (270), and a landscape layout for heights up to 540 px (1178-1189).

## Themes and contrast

- **Dirtbag:** tokens (styles.css:49-74), and a check script that tests 8 colour pairs against AA and bans inline styles (dirtbag/scripts/check.mjs:126-154).
- **Space-Wrecked:** one palette module writes the colour variables at boot (SW/render/palette.js). No contrast check was found.
- **Chooser:** tokens with their ratios in comments (CD/styles.css:15-35), and an axe WCAG 2.2 AA test that also checks 44 px targets and 175% text (chooser-of-the-dead/tests/e2e/accessibility.spec.ts:7-62).
- **project-ascent:** contrast and colour-blindness arithmetic, tested (src/ui/contrast.ts, themes.test.ts:116-146).

## Spatial focus (for M4.2)

- **Dirtbag's** `nearest()` looks only at boxes wholly past the current one's centre. It scores distance ahead, plus twice the gap sideways, plus a small drift term (DB/ui/spatial.ts:13-56).
  - Layers take priority in order: sheet, bubble, form, screen (DB/ui/nav.ts:9-68).
  - Things drawn on the canvas get invisible buttons laid over them (DB/ui/Hots.tsx:12-16).
- **Chooser's** version allows 4 px of overlap, looks within a 45° cone, and scores ahead plus twice across (CD/spatial.ts:15-52). CD/gamepad.ts:20-175 adds:
  - skipping inert controls;
  - clipping to scroll areas;
  - remembering focus;
  - scrolling when nothing lies that way;
  - an editing mode for lists and sliders.
- **Inference:** the two are near twins, and Chooser's is the fuller starting point.

## Gestures (for M4.2)

Space-Wrecked's `createRecognizer` is a pure state machine (SW/ui/gestures.js:24-124):
- its states are idle, pending, drag, held, pinch and spent;
- a touch slops 10 px before it drags, and a long press takes 450 ms;
- its handlers are tap, long press, drag start, move, end and cancel, and pinch with spread and angle.

`attachGestures` captures the pointer (146-184), and `onTap` accepts keyboard clicks too (126-140).

## Toasts, logs and announcements (for M4.2)

- **Dirtbag:** one toast at a time, timed by length, with long lines made cards (game.ts:559-599). Each toast mounts a fresh `role="status"` (App.tsx:300-304).
- **Chooser:** `say()` shows a toast for 2.6 s in one region that stays mounted (CD/store.ts:811-819, App.tsx:44-50).
- **Announcers:**
  - spliceworld/ui/live.js:1-31 clears the region and fills it again on the next frame;
  - project-ascent/src/ui/Announce.tsx:1-103 has polite and assertive regions.
- **Inference:** a region made with its text already in it often isn't read out, which Chooser's own comment and spliceworld's live.js say. Dirtbag's fresh region per toast may be missing announcements.

## Stock screens (for M4.3)

| Screen | Dirtbag | Space-Wrecked | Chooser |
| --- | --- | --- | --- |
| Title and slots | name form and save files | Continue, New, Settings | title and slots |
| Settings | a sheet | its own module | a screen |
| Pause | none | none | in the shift |
| HUD | Hud.tsx | per screen | the sun bar |
| Journal | a sheet | none | a screen |
| Shop | the place sheets | campaign/shop.js | a screen |
| Dialogue | speech bubbles | the event card | in the shift |
| Credits | ui/credits.ts | none | none |
| Ending | the dead and retired sheets | none | a screen |

No UI code is shared between the repos.

## Size

The UI layers run 10.5k lines in Dirtbag, 17.1k in Space-Wrecked and 18.0k in Chooser, each counted with its tests and styles. The largest single files are Dirtbag's sheets (3.4k and 3.0k) and Space-Wrecked's stylesheet (4.7k).

## What M4.1 takes from this

- **Chooser's act-then-signals loop:** a session's actions in, facts out as signals; the stage reads facts by name, as the screens' bindings will.
- **Chooser's floor:** 44 px targets and its landscape layout for short screens. Space-Wrecked's 48 px is the one to beat where a widget allows it.
- **Both kinds of contrast check:** Dirtbag's check of a theme's token pairs, run in CI, and an axe run over every screen the gate plays.

## A second look, for M4.2

Read on 2026-10-19, read only, as above. `CP` is `chooser-of-the-dead/packages/ui/src`.

**Spatial focus.**
- **Chooser's rule** (CP/spatial.ts:24-52): `ahead` is the gap from the focused box's edge to the candidate's in the direction of travel, and a candidate with `ahead < -4` is behind. `across` is the gap between the spans on the other axis, 0 if they overlap; past `max(0, ahead) + 4` the candidate is outside a 45° cone. The score is `max(0, ahead) + 2 × across + centre offset / 10`.
- **Chooser's candidates** (CP/gamepad.ts:35-85): `tabIndex ≥ 0`, not disabled, no `inert` or `aria-hidden` above, visible; a container counts only if it holds no control, which is O(n²); boxes are clipped by their scrolling parents.
- **Layers and memory:** the top dialog, else the page (:22, :58-60). A WeakMap holds each layer's last focus (:109, :420-424); waking picks the control nearest it, else the primary button, else the first (:124-138).
- **Edges:** up and down scroll the nearest scroller by 40% (:150-155, :174); left and right do nothing; nothing wraps. Dirtbag's `move()` returns false and lets the browser scroll (DB/ui/App.tsx:121-125).

**Gamepads.**
- **Chooser** polls by animation frame only while a pad is connected, merges every pad, and uses the standard mapping (CP/gamepad.ts:383-409, CP/pad.ts:32-88). A presses, B goes back, LB and RB cycle tabs. The left stick counts past 0.5. A held direction repeats after 400 ms, then every 120 ms (pad.ts:55-56).
- **Chooser's Back** closes the innermost open `<details>`, else clicks the nearest `[data-back]`, else sends Escape (gamepad.ts:252-275).
- **Handing off:** pad use sets `data-input=gamepad` on the page, which draws the focus rings; a real key or pointer clears it (:360-368, :414-419).
- **Dirtbag** reads one pad, with hysteresis: on at 0.5, off at 0.35 (DB/ui/pad.ts:46-48, 107-108).

**Gestures.** Space-Wrecked has no swipe anywhere. Long press opens a details card, drag pans, and pinch zooms and turns (SW/fight/view.js:155-193, SW/builder/view.js:210-239). The board is `touch-action: none` and buttons `manipulation` (SW/ui/style.css:43, 73).

**Toasts.**
- **Dirtbag** keeps a queue: a toast lasts `max(2600, 45 × characters)` ms, cut to 1400 ms while others wait (DB/game/game.ts:559-600). It sits top-centre with taps going through it.
- **Chooser** shows one at a time, each replacing the last for a fixed 2.6 s, so a burst loses all but its last (CP/store.ts:811-819).

**Logs.**
- **Wasteland Protocol:** `role=log`, polite, additions only, with no cap (wasteland-protocol/index.html:323-324, game.js:12850-12864).
- **Space-Wrecked's fight:** the last 16 lines, with no role (SW/fight/view.js:47, 580-586).

**Announcers.**
- **Spliceworld** (spliceworld/ui/live.js) keeps one region that exists before its text. It empties the region, then fills it on the next frame, so a repeated sentence is still read.
- **Project Ascent** (project-ascent/src/ui/Announce.tsx) has a polite and an assertive region, emptied after 4 s. It keeps assertive for errors and timers.
- **Inference:** Ascent likely skips a repeat within those 4 s, since the text doesn't change.

**What M4.2 takes:**
- Chooser's spatial rule and its gamepad mapping;
- Dirtbag's hysteresis and toast timing;
- Space-Wrecked's recognizer, with a swipe added;
- Spliceworld's empty-then-fill announcer.

([specs/input.md](../specs/input.md))

## A third look, for M4.3

Read on 2026-10-20, read only, as above, by an agent with Read, Grep and Glob only. Paths are under each repo. `CP` is `chooser-of-the-dead/packages/ui/src`.

**Titles and slots.**
- **Slot counts:** three in Chooser (CP/saves.ts:41), Afterglass (slice/saves.js:9-35), 2060td (src/meta/save.ts:42-58), Wasteland Protocol and Ludus; four in Spliceworld (save/save.js:206); one campaign in Space-Wrecked.
- **What a slot shows** is a summary kept beside the save, so a list never reads a whole save: Afterglass keeps an index of season, day, rooms and time (slice/saves.js:9-35); Chooser shows the day and its counts (campaign/screens.tsx:564-578); none shows a thumbnail or playtime.
- **Continue:** no repo picks the newest save by its time. Afterglass remembers the keep last in play (page/screen.js:257, 319-323) and 2060td the active slot (src/meta/save.ts:54-86). Saving every step makes the newest save the slot played last.
- **New over a full slot** asks again: Space-Wrecked's second tap within 3 s (ui/title.js:18, 74-91), Afterglass's "replace which?" (page/screen.js:334-338).
- **A slot that can't be read** is shown as such, never as empty, with Copy and a confirmed Clear (Chooser, campaign/screens.tsx:829-879; Wasteland Protocol's "DAMAGED — ERASE", game.js:8120-8131).
- **Daily seeds:** Chooser counts days from a fixed date by the local calendar and seeds `daily:<n>`, and its engine reads no clock (engine/src/calendar.ts:2-4, 16, 59-73); it saves after every action so a reload can't reroll (store.ts:325-333). Rule-or-drool hashes the UTC date (src/meta/daily.ts:4-13), Afterglass the local one (slice/daily.js:8-18), Sandbagged the UTC one (src/engine.ts:3347-3356).

**Settings.**
- **Kept outside the save** under the game's own key, so a new game keeps them: Dirtbag (app/src/game/persist.ts:151-152), 2060td (`lastline_settings_v1`), Ludus, Chooser (store.ts:265-270).
- **Read field by field,** a bad field falling back alone (Dirtbag, persist.ts:180-197; rule-or-drool with a version, settings.ts:71-93).
- **Applied on the root** as attributes or variables: Chooser's `data-text` and `data-motion` (store.ts:294-302), Wasteland Protocol's `--text-scale` and `.motion-off` (game.js:8066-8071), Project Ascent's `--text-scale` (src/store/settings.ts:410-412).
- **What they hold:** text size and less motion everywhere; volumes in Chooser, Dirtbag, 2060td and Wasteland Protocol; key remapping only in Dirtbag (Sheet.tsx:2815-2823). No language picker anywhere.

**Saves in and out.**
- **Codes:** Space-Wrecked's `PREFIX.version.base64url.checksum`, spaces ignored, checked before a second tap on "Replace save?" (core/save.js:502-524, ui/settings.js:117-131). Ours is its descendant ([specs/saves.md](../specs/saves.md)).
- **Set the current save aside before an import,** and refuse the import if that can't be written (Spliceworld, slots.js:295-329; Dirtbag's `save.replaced`, persist.ts:13-17).
- **Two taps, not `confirm()`,** which some browsers suppress (Wasteland Protocol, game.js:8082-8102).

**Pause.**
- **Chooser:** Escape, `p` or a button; pause is a sim action that stops its clock, and it pauses itself when the page is hidden or loses focus (store.ts:1517-1567). Dirtbag has none: Escape puts down what is open (ui/input.ts:7).

**Crash.**
- **Dirtbag** draws its crash screen in plain DOM, since React may be what broke, offers the raw save as a file without loading it, and ignores ResizeObserver and "Script error" noise (ui/crash.ts:1-5, 55-57, 113-131).
- **Chooser** pauses first, then offers Reload and a copyable report (crash-ui.tsx:88-165). Afterglass stops its clock and offers the keep as a file (page/clock.js:275-319).

**Updates.**
- **Never skip waiting by itself; reload on `controllerchange` only when a worker controlled the page before** (Space-Wrecked, src/platform/serviceWorker.js:1-38; rule-or-drool).
- **Never mid-run:** Chooser shows the prompt on its title only (screens.tsx:352-359); Project Ascent never while a session is live (src/engine/offline.ts:22-40); Afterglass hides it during the night watch (page/screen.js:67-93).

**What M4.3 takes** ([specs/shell.md](../specs/shell.md), D53): summaries beside saves; Continue as the slot played last; a second press for New over a save, Delete and replacing in an import; unreadable slots shown and kept; Chooser's Daily; settings outside the save, per field, on the root; Dirtbag's plain-DOM crash screen with the raw save; the update prompt on the title only.

## Open questions

1. **A screen's escape hatch.** What data can't say (a map drawn on a canvas, a custom widget) needs a way out; D51 leaves it for later.
2. **Logical pixels.** Dirtbag scales a fixed 360×740 screen, so its targets change size with the screen. Should screens lay out in CSS pixels, as Chooser's do?
3. **Fast state.** Dirtbag keeps a store per frame for motion. Does M4.1's binding need one before Phase 5's 3D?
