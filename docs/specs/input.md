# Input and feedback (M4.2, D52)

How a game's screens ([screens.md](screens.md)) are driven by keys, a gamepad and touch, and how what happens in the sim reaches the player: as toasts, as a log, and as words a screen reader speaks. The survey behind it is [research/runtime-ui.md](../research/runtime-ui.md).

## Feedback

The sim's beats carry no words (D22): `inventory/gained` is `{ item: "rope", count: 1 }`. A game words the beats it wants said in `ui/feedback.json` (Evan's call, D52):

```json
{
  "lines": [
    { "on": "inventory/gained", "say": "{.item} ×{.count} into the bag" },
    { "on": "economy/changed", "where": { "resource": "coins" }, "say": "Coins: {.by}", "to": "log" },
    { "on": "hut/visited", "where": { "who": "greta" }, "say": "Greta has news from the village.", "to": "toast" }
  ]
}
```

- **`on`** names an event the game declares: the engine's, a kit's or one its scripts declare. Undeclared beats such as `time/scheduled` are the sim's own business and can't be said.
- **`where`** (optional) holds some of the event's arguments. The line says only beats whose arguments equal these.
- **`say`** is a template whose holes are the event's arguments, written as a list entry's fields are: `{.item}`. An argument that is a record's id shows the record's name, or its id once the record is gone; a number or a text shows as it is. Facts aren't read here: what is said is what the beat carries.
- **`to`** (optional) is `toast`, `log` or `both`, the default. A line that only toasts is gone once it fades, so the default keeps it in the log too.
- **Each beat is said by the first line that matches it,** in the file's order, or not at all. A project without the file says nothing.
- **The editor's New feedback** starts the file with lines for the common events of the kits the project has on, worded plainly, for the author to change.

The worker words each step's beats with the step's records, so the page never reads the sim's state: the `stepped` reply carries `said`, each `{ text, to }` in the order the beats came. Beats from a game's start aren't heard (the kernel drops them), so the first step says nothing about the start.

## Toasts

- **One at a time,** first in first out. A toast stays `max(2600, 45 × characters)` ms, cut to 1400 ms while others wait (from Dirtbag's game.ts).
- **At the top of the game's box,** under the safe area, centred, at most 24rem wide, in the theme's surface and text colours (a pair E050 checks).
- **Taps go through it:** a toast can't be pressed or dismissed, and covers nothing a tap needs.
- **Not read from the screen:** it is hidden from screen readers, because the announcer speaks the step's lines once.
- **Still with reduced motion:** with `prefers-reduced-motion`, a toast appears and goes without moving.

## The log

The `log` widget shows the lines said to the log, newest first:

```json
{ "widget": "log", "lines": 3, "label": "Lately", "empty": "Nothing yet." }
```

- **`lines`** (1 to 100, default 10) is how many it shows; **`label`** (default "Log") names it for screen readers; **`empty`** is what it shows before anything is said.
- **The page keeps the last 100 lines** of the play, for every log widget on every screen. They aren't saved (Evan's call): a new play starts empty. M4.3's save slots can carry them.
- **It is a `role="log"` list** that doesn't announce, so a screen reader can read it back without hearing each line twice.

## Announcements

- **One region speaks,** a polite `role="status"` in the game's box, outside every screen, so it is never inert.
- **After a step that said something,** the region is emptied and, on the next frame, filled with the step's lines (from Spliceworld's live.js): the same line twice is still read, and a region made with its text already in it, which isn't, never happens.
- **Every line is spoken once,** whether it toasts, logs or both.
- **A screen that comes to the top** is still announced by its heading taking focus (M4.1).

## Focus

Arrow keys and a gamepad move focus to the nearest control in a direction, on the top screen only.

- **The rule** is Chooser's (chooser-of-the-dead's spatial.ts). From the focused control's box `from` and a direction:
  - `ahead` is the gap from `from`'s leading edge to a box's near edge in that direction; a box with `ahead < -4` is behind;
  - `across` is the gap between the two boxes on the other axis, 0 where they overlap; a box with `across > max(0, ahead) + 4` is outside the 45° cone;
  - the nearest is the box with the least `max(0, ahead) + 2 × across + offset / 10`, where `offset` is the distance between the boxes' centres on the other axis. Ties go to the first in the page's order.
- **What can take focus:** buttons and tabs in the top screen with `tabIndex ≥ 0`, not disabled, with a box, and with no `inert` or `aria-hidden` above them.
- **With nothing focused,** or with the screen's heading focused, a direction wakes focus instead of moving it: on the screen's first enabled primary button, else its first control. The control a screen last had is given back as the screen returns to the top (below), so waking never needs it.
- **At an edge,** with nothing that way: up and down scroll the main region by 40% of its height (Chooser's), left and right do nothing. Focus never wraps.
- **Tabs keep their keys:** left and right choose a tab, as the WAI-ARIA tabs pattern has it; up and down leave the tab list.
- **Tab, Enter and Space** do what they do on any page.
- **Each screen remembers** the control it last had. When a screen comes back to the top, because one over it closed or a talk ended, focus goes back to that control if it is still there and enabled, as a dialog gives focus back to what opened it; otherwise to the screen's heading, which announces it.

## Gamepad

- **Read each frame while a pad is connected,** every pad at once, in the standard mapping (Chooser's gamepad.ts).
- **Move:** the d-pad, or the left stick past 0.5 from the centre (and let go below 0.35, Dirtbag's pad.ts). Held, a direction repeats after 400 ms, then every 120 ms (Chooser's).
- **A** presses the focused control, or wakes focus if none is. **B** is Back. **LB and RB** choose the previous and the next tab, in the tab list that holds focus or else the top screen's first.
- **The other buttons do nothing yet.** Start opens M4.3's pause screen.
- **Focus rings for the pad:** the pad marks the game's box, and every focused control shows the theme's accent ring while it does. A key or a pointer clears the mark.

## Gestures

Touch and pen only; a mouse clicks. The recognizer is Space-Wrecked's gestures.js, a state machine fed pointer events: idle, pending, drag, held, spent. A press that moves 10 px drags; one held 450 ms without moving is a long press, which nothing uses yet.

- **A swipe** is a drag that ends at least 48 px to one side of where it began, at least twice as far sideways as up or down, within 800 ms.
- **On tabs,** a swipe left chooses the next tab and a swipe right the previous, as pages turn.
- **Elsewhere,** a swipe right on a screen a button opened is Back. A swipe left does nothing.
- **Scrolling wins:** screens let the browser pan up and down (`touch-action: pan-y`), so a vertical move scrolls and the gesture ends with no effect. The main region says so too: `touch-action` counts only up to the nearest element that scrolls, so without it the browser took a sideways move inside the main region as a pan and cancelled the swipe (found by the gate's specs).
- **A swipe presses nothing:** a touch that moves past the browser's own tap slop, as every swipe does, makes no click. A swallow for that click was written first; planted out, nothing failed, since it never had a click to swallow, and it had eaten a quick tap after a swipe. It went.
- **Each gesture has a button:** tabs are buttons, and a screen a button opens should have a close button (W134).

## Back

Escape, a pad's B, a swipe right, and on the player page the browser's own back (Android's back gesture and button) close the top screen a button opened. With none open, Back does nothing in the game; on the player page the browser's back then leaves the page, as on any page.

- **On the player page,** each screen a button opens adds an entry to the page's history, and the browser's back closes it. Closing it any other way, or a step that changes the modes, takes history back to match, so the page never holds entries for screens that are gone.
- **The page counts its own entries** rather than reading `history.state`: `history.go` is answered later, and a screen opened in between would find the old entry's state there and add none for itself, so the next back left the game. The gate's spec slows `history.go` to show it.
- **Entries are added before the page paints:** added after it, a back pressed as the screen showed found none and left the game (found by the gate's specs, about one run in ten).
- **In the editor's Play panel** the history is the editor's, so only Escape, B and the swipe go back.

## Pack

Format 5 adds `ui.feedback`, the file's lines as written. A pack without feedback is still written in the lowest format that holds it, so format 4 for screens alone.

## Checks

| Code | When |
| --- | --- |
| E047 | `ui/feedback.json` isn't valid: a missing or unknown field, a field of the wrong kind, or a template whose braces don't close. A `log` widget's `lines` outside 1 to 100. |
| E048 | A feedback line's template names a fact or a view's field: only its event's arguments, as `{.item}`, are read. |
| E051 | A feedback line is `on` an event the game doesn't declare. |
| E052 | A feedback line names an argument its event doesn't have, in `say` or `where`, or a `where` value its argument can't take. |
| W132 | Now also not for `feedback.json`, which is a game's feedback, not a screen. |
| W134 | A screen no mode shows, so only a button opens it, has no close button: on touch, a swipe is the only way back. |

- **Events are known only once the game has run,** as actions and modes are. Without them, `on`, `where` and the holes go unchecked.

## Open questions

1. **Tones.** A toast for a quest failed looks like one for coins gained. Good and bad tones need two more theme colours and their contrast pairs.
2. **Signs.** `{.by}` shows `-5` but `5`, not `+5`. A sign format for holes waits for a game that needs it.
3. **Long press.** The recognizer knows it; nothing uses it. A details pop-up for a list's entry (why it's locked, its odds) is the likely first use, and M4.6's map will want drag and pinch.
4. **The right stick and Start.** The right stick could scroll; Start waits for M4.3's pause screen.
5. **Saved logs.** The log lasts for the play. If games want it back after a reload, it belongs in M4.3's save envelope, not the sim's state.
