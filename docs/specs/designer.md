# The UI designer (M4.5, D55)

A screen, `ui/<id>.json`, is designed in the inspector as it looks. The theme, `ui/theme.json`, is designed as colours and type. Each keeps a JSON tab over the same file and the same undo ([screens.md](screens.md) is the format the designer writes). `ui/shell.json` and `ui/feedback.json` stay JSON.

## The parts

A screen opened from the Play panel shows **Design** and **JSON** tabs, Design first. Design is three parts, stacked in the inspector's column and in the phone's sheet alike:

- **the frame:** the screen drawn as a device shows it;
- **the outline:** its widgets as a tree;
- **the form:** for the widget selected.

The selection is a JSON Pointer into the file (`/main/children/2`), kept per file while the editor is open, so switching tabs or devices keeps it.

A file the designer can't read is opened in the JSON tab with a line saying why. A file can't be read when it isn't JSON, or isn't an object with a `main`.

## The frame

- **Devices:**
  - 360×740 and 390×844 (phones);
  - 820×1180 (a tablet, 2060td's);
  - 1280×800 (a desktop, chooser's Steam Deck).

  Each turns to landscape by a button. The frame's size sets the breakpoint (`breakpointOf`), as a device's would, whatever the panel's width. 740×360 is landscape; 1180×820 lays out as a desktop, as such a tablet would.
- **Fitted** into the inspector's width and at most 60% of the window's height, by one scale. That is dirtbag's fit: `k = min(width / w, height / h)`, measured as the panel resizes. The game draws at the device's own size inside it.
- **One screen,** alone, in the project's theme as it stands (or the engine's). A modal screen is drawn as a sheet over the frame's background.
- **Inert:** nothing in it takes focus or acts. A tap selects the deepest widget whose box holds the point. A widget repeated in a list selects its item. The selected widget is ringed in the editor's colours, not the game's. The outline is the way in for keys and screen readers.

## What the frame draws

The frame draws a view, as the game does, from a game of the designer's own: a copy of the Play worker, so the Play panel's game is never disturbed.

- **Compiled without `ui/`,** so a half-made screen never stops it. It is compiled again only when a file outside `ui/` changes.
- **The moment:** the Play panel's last save in this session, loaded, or else a new game from seed 1. Saving under edition `design`, it keeps nothing.
- **Looked at, not played:** after each edit, the worker is asked for a view of the state it holds, reading the facts and conditions the screen names now (a `look` request). It takes no step. A fact the game can't read is "—", as in play.
- **Samples in the gaps:**
  - a list whose source doesn't apply at the moment (`shelf` with no shop open) gets three entries, each field reading its own name: `‹name›`, `‹price›`;
  - so do the credits, which a game compiled without `ui/` doesn't pack;
  - a view field the moment lacks (`talk.text`) reads `‹talk.text›`;
  - a log shows three sample lines.
- **Without a game:** when the scripts haven't run here, the game's scripts have problems, or the project has errors outside `ui/`, everything is a sample:
  - each fact reads its own name, `‹time.day›`;
  - each shows-when holds, so everything is drawn;
  - a line above the frame says why.

The line above the frame always says what it draws: "Day 3, as the Play panel left it", "The game's start", or why it is samples.

## The outline

A tree of rows, each a button at least 44 px tall:

- **the screen** (its title, the modes it shows, whether it is modal);
- **its slots:**
  - Top, Main and Bottom;
  - in a list, its Item, and a `records` list's Unknown;
- **its widgets**, with a tabs widget's tabs as rows of their own.

Each widget row says its kind and a summary: a text's words, a button's label, a list's source, a stack's direction. It is marked when its shows-when doesn't hold at the moment, when it has an override at the frame's size, and with its problem count.

An empty slot shows as "Empty" and takes Add.

**Actions** on the selected row, in a bar above the form:

- **Add**, a widget of one of the ten kinds:
  - inside a container (a stack, panel, grid or tab), as its last child;
  - into an empty slot;
  - otherwise after the row.

  The new widget is selected.
- **Duplicate:** after it, in its children.
- **Up** and **Down:** among its siblings.
- **In:** into the sibling before it, if that is a container, as its last child.
- **Out:** to just after its container.
- **Delete:** a slot's widget leaves its slot empty. The checks say so when the slot is Main or a list's Item.
- **A tabs widget:** Add tab, and its tabs move Up and Down.

**Drag:** a widget in a container's children has a handle, ⋮⋮, which drags it among its siblings, a line showing where it lands. Only the handle drags, as in 2060td, so a finger scrolling the outline never moves a row. The buttons do the same by keys and single taps (WCAG 2.5.7).

Each action is one step of the editor's undo.

## The form

Each widget kind's fields, through the record form's own field components (text, number, choice, condition), over the screen file. A field's problems are the checks' diagnostics at its path.

| Widget | Fields |
| --- | --- |
| stack | direction, gap, align, justify, wrap |
| panel | direction, gap |
| grid | columns, gap |
| text | text (with facts in braces), style |
| image | asset (picked from `assets/`), alt |
| button | label, action, style |
| progress | value, max (each a number, or a fact in braces), label |
| list | source; type and known (for `records`); empty |
| tabs | (each tab's label is its row's form) |
| log | lines, label, empty |

Every widget also has shows-when.

- **The action:** take, open, close or shell.
  - take: the game's actions, with arguments as names and values;
  - open: the project's screens;
  - shell: title or New game.
- **The screen's form:** its title, the modes it shows (the game's, once its scripts have run), and whether it is modal.
- **Layout at a size:** direction, gap, align, justify, wrap and columns change every size, unless the form's Sizes is set to "Only at <the frame's breakpoint>".
  - Then they read and write the widget's `at` for that breakpoint alone, showing the every-size value as the placeholder.
  - Clearing an override removes it, and `at` goes once empty.
- **Key order:** a written widget's keys follow one order, so the files read as the fixtures do:
  - `widget`;
  - its own fields, in the table's order;
  - `style`, `action`, `shows-when`, `at`;
  - its children (`children`, `item`, `unknown`, `tabs`).

  A screen's are `title`, `shows`, `modal`, `top`, `main`, `bottom`.

New widgets:

| Kind | Holds |
| --- | --- |
| stack, panel | no children |
| grid | 2 columns, no children |
| text | "Text" |
| image | an empty asset and alt, for the form to fill |
| button | "Button", taking an action not yet chosen |
| progress | 0 of 10, "Progress" |
| list | the actions on offer, each as a text of its label |
| tabs | one tab |
| log | nothing |

The checks show what is left to fill in.

## The theme

The Design tab of `ui/theme.json` holds:

- **the six colours** as colour pickers, with beside each text pair its contrast ratio and whether it reaches 4.5:1, as `contrast()` and E050 compute it;
- **the font, size, space and radius;**
- **a sample** in the phone frame: a title, body text, a caption, a primary and a plain button, a panel and a progress bar, drawn by the renderer in the theme as it stands.

## Where it lives

- `packages/ui/src/session/play.ts`: `look`, a view of the state in play for other wants.
- `packages/ui/src/session/protocol.ts` and `host.ts`: the `look` request.
- `packages/ui/src/render/Widget.tsx`: in a frame being designed, each widget is wrapped in a box with no layout of its own, carrying its pointer.
- `packages/ui/src/render/DesignFrame.tsx`: one screen drawn from a view at a breakpoint, inert.
- `apps/editor/src/designer/`: the designer, apart from the JSON editor.
  - `tree.ts`, the outline's rows and its edits, as plain functions;
  - `widgets.ts`, each kind's fields, new widgets and key order;
  - `samples.ts`, the gaps filled;
  - `frame.ts`, the devices, the fit and the pick;
  - `moment.ts`, the designer's game;
  - the components.
- `apps/editor/src/play/moment.ts`: the Play panel's last save in this session.

## Open questions

1. Is a design-time drag on the frame wanted once the outline has been used on a phone? D55 left it for later.
2. Should the frame be able to show a screen over the one below it, as a modal is in play, rather than alone?
3. Does a designer want to step the game from the frame, as Play does, to reach a moment?
