# Screens (M4.1, D51)

A game's screens are data: widget trees in a project's `ui/` folder, checked as the project compiles. The runtime (`packages/ui`) renders them with Preact and signals in the editor's Play panel and in the player page. The sim decides and the screens show: a screen reads the game's facts and takes the actions the game offers, never running an effect itself.

## Files

- **`ui/<id>.json`** is the screen `<id>`, named as a record is: lowercase words joined by hyphens.
- **`ui/theme.json`** is the game's theme. Without one, the engine's own is used.
- **`ui/feedback.json`** is the words the game's beats are said in, as toasts, a log and to screen readers (M4.2, [input.md](input.md#feedback)).
- **A file elsewhere under `ui/`,** or one named as no screen, is ignored (W132), as under `scenes/`.

## A screen

```json
{
  "title": "The hut",
  "shows": ["hut"],
  "top": { "widget": "stack", "direction": "row", "children": [ … ] },
  "main": { "widget": "stack", "children": [ … ] },
  "bottom": { "widget": "stack", "direction": "row", "children": [ … ] }
}
```

- **`title`** is the screen's name, which screen readers hear as the page's heading.
- **`shows`** lists the game's modes it is the screen for: the game's own modes, such as the hut's `hut` and `closed`, and the kits' `shopping`, `talking`, `choosing` and `hiring`. A screen whose `shows` is empty is opened only by a button.
- **`top`, `main` and `bottom`** are its three regions:
  - `top` and `bottom` are bars that stay put;
  - `main` scrolls between them;
  - each region is one widget, usually a stack.
- **`modal: true`** draws the screen over the one below it, which stays in view behind it. Talks, events and the store are modal in the hut.

## The stack

The screens on show are a stack, worked out after every step:
- **From the game's modes, bottom to top.** Each mode's screen is the first screen whose `shows` names it, in id order.
- **A mode no screen shows** gets the fallback: a plain list of the actions on offer, so the game can still be played. The compiler warns of it (W133).
- **Screens opened by a button** sit above the modes' screens until closed. A step that changes the modes closes them.

Only the top screen and those below it up to the first that isn't modal are drawn. Focus and taps go to the top screen. Keys, a gamepad and swipes drive it too, and Back closes a screen a button opened ([input.md](input.md)). Feedback's checks, E051, E052 and W134, are input.md's.

## Widgets

Every widget has `widget`, its kind, and may have:
- **`shows-when`**, a condition in the engine's text form. The widget is drawn only while it holds.
- **`at`**, overrides by breakpoint (see Layout).

| Widget | Fields | Notes |
| --- | --- | --- |
| `stack` | `children`, `direction` (`column` or `row`), `gap`, `align`, `justify`, `wrap` | The layout widget. |
| `panel` | `children`, `direction`, `gap` | A stack drawn on the theme's surface colour, with padding. |
| `grid` | `children`, `columns`, `gap` | Columns of equal width. |
| `text` | `text`, `style` (`title`, `heading`, `body` or `caption`) | `text` is a template (see Bindings). |
| `image` | `asset`, `alt` | An asset of the project's. |
| `button` | `label`, `action`, `style` (`primary` or `plain`) | At least 44 px high and wide. Disabled while its action isn't on offer. |
| `progress` | `value`, `max`, `label` | `value` and `max` are numbers or bindings. |
| `list` | `of`, `item`, `empty` | One `item` per entry of the source `of` (see Lists); `empty` is the text shown when there are none. |
| `tabs` | `tabs`: each `{label, children}` | One tab's children shown at a time. A pad's LB and RB and a swipe turn them too (M4.2). |
| `log` | `lines` (1 to 100, default 10), `label`, `empty` | The lines the game's feedback said to the log, newest first (M4.2, [input.md](input.md#the-log)). |

## Bindings

- **A template** is text with facts in braces: `"Day {time.day}"` or `"{economy.amount(resource: coins)} coins"`. A fact is written as conditions write it, with its arguments named. Its value is shown as text; a missing value shows as `—`.
- **A number field** (`progress`'s `value` and `max`) takes a number or a fact in braces.
- **A list item's template** may also name the entry's own fields, as `{.label}` or `{.price}`.

The runtime never reads the sim's state itself. At the start of a session, the worker reads every fact and condition the pack's screens name. After every step, it sends back their values and the current views (see Session).

## Actions

A button's `action` is one of:
- **`{"take": "<module>/<action>", "args": {…}}`**: the game's action. The button is enabled only while an action of that type is on offer with those arguments; without `args`, it takes the first of that type on offer. This is how the sim decides: a screen can only ask for what the game offers, and the session refuses anything else before the sim sees it.
- **`{"open": "<screen>"}`**: opens a screen above the rest.
- **`{"close": true}`**: closes the top screen that a button opened.

In a list, an item's button can use `{"take": "entry"}`: the action that comes with the entry, such as a talk option's `dialogue/say`.

## Lists

`of` names where the entries come from:

| Source | Entries | Fields |
| --- | --- | --- |
| `talk` | the open talk's options, shown or locked, from the dialogue kit's view | `label`, `locked`, `why`, `cost`, `odds`; the action says it |
| `event` | the open event's choices, from the events kit's view | `label`, `locked`, `why`, `cost`, `odds`; the action chooses it |
| `shelf` | the open shop's shelf | `item`, `name`, `price`, `count`; the action buys it |
| `bag` | the items carried | `item`, `name`, `count`, `price` while a shop is open; the action sells it |
| `journal` | the quests started, as the quests kit's journal shows them | `quest`, `name`, `state`, `log`, `objectives` |
| `offered` | every action on offer | `type`, `label`; the action takes it |

The talk's own line, its speaker and the event's text are views too, read as `{talk.text}`, `{talk.speaker}` and `{event.text}` in templates.

## Layout

- **Regions keep clear of the safe area:** `top` is padded by the top inset, `bottom` by the bottom inset, and all three by the side insets.
- **Breakpoints:**
  - `landscape` is lower than 500 px and wider than it is high;
  - otherwise `phone` is narrower than 600 px;
  - `tablet` is up to 1,024 px wide;
  - `desktop` is wider.

  The sizes are the game's box, not the window's, so a game in the editor's Play panel lays out as it would on a phone of that width.

  A widget's `at` gives fields that apply at a breakpoint, such as a stack that is a row in landscape.
- **Nothing scrolls sideways.** Text wraps, and rows wrap when `wrap` is set.

## Theme

```json
{
  "colors": {
    "background": "#14161a",
    "surface": "#1f232a",
    "text": "#eef0f3",
    "muted": "#a9b0bb",
    "accent": "#7cc4ff",
    "on-accent": "#0b1220"
  },
  "font": "system-ui",
  "size": 16,
  "space": 8,
  "radius": 8
}
```

- **The colours become CSS variables** for the widgets.
- **The checked pairs:** text and muted on background and on surface, and on-accent on accent. Each must reach AA for body text, 4.5:1, or the theme is E050.
- **The e2e also runs axe** over every screen the gate shows.

## Session

A game plays in a worker, never on the page: its scripts run where `lockDown` has taken the page's powers away, as M3.2's checks and Run do.

- **`start`:** the page sends a pack, as a game file holds it, and a seed. The worker checks the pack (`readPack`), loads its game from its scripts with the kits it lists, and answers with the game's name, its screens and theme, and the first view. The editor's Play panel sends the project's files instead, which the worker compiles into that pack first, as Export game does.
- **`act`:** the page sends one of the offered actions. The worker refuses one that isn't on offer; otherwise it reduces it and answers with the next view and the step's beats. A script that throws ends the game, and the page is told why.
- **A view holds:**
  - `modes`, the stack of mode ids;
  - `offered`, the actions on offer;
  - `facts` and `conditions`, the values of what the screens name. A fact or condition the game can't read is no value;
  - `fields`, the views' own fields (`talk.text`, `event.text`, `shop.name`…) while they apply;
  - `lists`, each source's entries while it applies, each entry with its fields, its action and whether that action is on offer;
  - `turn`, and `ended`, true once nothing is offered.
- **The words in entries** come from the sim's reports: a locked choice's reason is the condition it needs in words (`describeCondition`) or the resource it is short of; its cost names each resource; its odds are the chances its preview gives.
- **Every view is JSON,** as the kernel's state and beats are, so nothing that crosses to the page can run there.

## Where it plays

- **The editor's Play panel:** the open project, compiled as Export game compiles it, played through its screens in a copy of the script worker of its own, so a check that runs too long never ends a game in play. It needs the game's scripts let to run, as Run does, and waits while the project has errors. Beside the game, its screens and theme, each opening in the inspector as JSON with its problems at their lines, and New screen and New theme. The game's box sets its breakpoint, so a narrow panel lays a game out as a phone. M4.4's designer replaces the JSON.
- **The player page,** at `/play/` on the editor's domain, plays an exported game: the `<id>-<version>.game.json` file that the Project panel's Export game writes, holding the records, the compiled scripts, the screens and the theme. The file is read in the browser and played in a worker whose ways out are taken away before the game's scripts run; nothing is sent anywhere. It is a page of the editor's own build, so the service worker holds it and a game opened once plays offline after. A page that is a single file comes with M4.9's export.

## Pack

Format 4 adds `ui`: `{ screens, theme? }`. A pack without screens is still written in the lowest format that holds it, so packs and their hashes are unchanged for projects without screens. Format 5 adds `ui.feedback` (M4.2, [input.md](input.md#pack)).

## Checks

| Code | When |
| --- | --- |
| E007 | A file under `ui/` isn't UTF-8 JSON. It is still a screen, so a button that opens it isn't E049 as well. |
| E018 | An image names a file that isn't in `assets/`. |
| E047 | A screen or the theme isn't valid: an unknown widget, a missing field, a field of the wrong kind, or a template whose braces don't close. Given at its JSON path. |
| E048 | A template, number or `shows-when` names a fact the game lacks, or gives it the wrong arguments; a binding compares (that belongs in `shows-when`); or `{.field}` is outside a list, or names a field its source lacks. |
| E049 | A button takes an action the game lacks, opens a screen that isn't there, or uses `entry` outside a list or in a journal's. A list's `of`, or a view's field such as `{talk.text}`, needs a kit that is off. A screen `shows` a mode the game lacks. |
| E050 | The theme's pairs fall short of 4.5:1. |
| W132 | A file under `ui/` that is no screen and isn't `theme.json` or `feedback.json`: ignored. |
| W133 | A mode of the game's, or of a kit it has on, that no screen shows: it is played with the fallback. Only once the project has a screen: before that, every mode is. |

- **Facts** are checked as records' conditions are (D36): against the game's once its scripts have run, otherwise against the engine's and the kits', with any other taken as written.
- **Actions and modes** are known only once the game has run. Without them, a button's `take`, a screen's `shows` and W133 go unchecked, as W120 does without the time module. `eb validate` runs a project's game; `--types` gives no actions, so it leaves them unchecked.

## Open questions

1. **Settings widgets.** A toggle, a slider and a select need settings to bind to, which aren't facts. They come with M4.3's settings screen.
2. **An escape hatch.** Data can't draw a map or a custom gauge. D51 leaves that for later.
3. **Assets in the player page.** The pack holds no assets yet, so an image widget shows only in the editor until the export carries them (M4.9).
4. **`eb schemas` for `ui/`.** VS Code could check screens as it checks records, from the same zod. Not in M4.1.
