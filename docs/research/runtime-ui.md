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

## Open questions

1. **A screen's escape hatch.** What data can't say (a map drawn on a canvas, a custom widget) needs a way out; D51 leaves it for later.
2. **Logical pixels.** Dirtbag scales a fixed 360×740 screen, so its targets change size with the screen. Should screens lay out in CSS pixels, as Chooser's do?
3. **Fast state.** Dirtbag keeps a store per frame for motion. Does M4.1's binding need one before Phase 5's 3D?
