# Spec: the editor's layouts

This covers M2.2:

- the desktop dock and the layout it saves;
- the phone's inspector sheet;
- the command palette, on every layout;
- the deploy check that loads the live page.

The code is in `apps/editor/src/app/` (the dock in `dock/`), and the deploy check is `tools/site-check/`. The decision behind it is D29.

## Three layouts

The width picks the layout. The breakpoints are written once, in `layout.ts`. The shell sets `data-layout` from them, and the CSS keys off that attribute.

| Layout | Width | Panels |
| --- | --- | --- |
| Phone | under 600 px | one panel at a time with a bottom tab bar (Project, Records, Assets, Logic, Problems, Console), and the inspector as a sheet. Logic joined in M3.1 (D36); World and Play join the bar when their phases build them (D35) |
| Tablet | 600 to 1,023 px | two zones: Records, Assets, World and Play; Inspector, Project, Problems and Logic; and the console as a strip along the bottom. A phone on its side is usually this |
| Desktop | 1,024 px and up | the dock |

An iPad turned from portrait to landscape crosses from tablet to desktop. The dock is built when the desktop layout appears and taken down when it goes.

A zone whose tabs don't fit its width, such as the tablet's side zone of four, scrolls them sideways (`data-scroll-x`), with the active tab kept in view. The Problems tab carries the open project's count of problems, red while any is an error (M2.8, [editor-problems.md](editor-problems.md)).

## The desktop dock

- **dockview 8.5.1**, the framework-free package, with `dockview-core` pinned to the same release by an override in `pnpm-workspace.yaml`. Panels render with Preact into the elements dockview asks for.
- **Loaded only on desktop.** `DesktopLayout` imports `dock/desktopDock.tsx` when it first renders, so a phone never runs dockview's 80.6 kB of gzipped JS or its 10.9 kB of CSS (Readings). The service worker still caches it, since a tablet can turn into a desktop offline.
- **If its code can't load**, the desktop zones stand in: three fixed zones and the console strip. The console says why.
- **The panels** are `DOCK_PANELS`: Project, Logic, Records, Assets, World, Play and Inspector, then Console and Problems. A panel's id is also its dockview component name. Records came with M2.5 ([editor-tables.md](editor-tables.md)), Assets with M2.7 ([editor-assets.md](editor-assets.md)), and Problems with M2.8 ([editor-problems.md](editor-problems.md)).
- **The first layout:**
  - three groups side by side: Project with Logic (280 px), Records with Assets, World and Play, and Inspector (320 px). Records leads the middle group, and the tablet's main zone, since the World panel waits for Phase 4;
  - along the bottom, 150 px tall, the console in front and Problems behind it (`DOCK_BOTTOM`). The console stays in front so what the editor says stays in view: dockview builds only a group's shown tab.
- **Tabs are labels only.** dockview's own tab holds a close button inside the tab, which axe reports as nested controls (`nested-interactive`). The editor's panels are moved, never closed.
- **The Problems tab's count** is drawn by the tab itself, not set as the panel's title, which dockview would save as a change to the layout. dockview names each tab with an `aria-label` of its title, which would keep the count from screen readers, so the tab sets its name to match what it shows ("Problems (4)").
- **Floating groups are off.** A floating group covers the panels under it, and the saved layout stays a plain grid.
- **Keyboard.** dockview makes each group a region named after its active panel, its tab strip a tablist, and its content a tabpanel. The arrow keys move along the tabs, and Enter shows the focused one (manual activation). Inside the tabpanel, the editor's panel is a plain focusable block, so it can be scrolled from the keyboard. A named section there repeated the group's landmark (`landmark-unique`). The console's block takes focus only from the palette, since its list already takes the tab stop.

### The saved layout

- **Where.** `localStorage`, key `eb-editor:dock-layout`. Storage keys are never renamed. It is per browser, not per project: a layout is a preference, not project data.
- **What.** `{"format": 1, "layout": <dockview's toJSON()>}`, about 2 kB.
- **When.** 300 ms after the last change: a tab moved, a group split, a divider dragged, or another tab shown. Resizing the window changes nothing that is saved. A change still waiting is saved when the dock is taken down.
- **Nothing is saved until the layout changes.** dockview reports changes a microtask late and skips those made before a listener subscribed, so laying out the first dock saves nothing. An untouched dock keeps following the editor's default, including later changes to it.
- **Reading it back** (`readSavedLayout`). It is passed over for the first layout when:
  - nothing is saved, or it isn't JSON;
  - its format isn't 1;
  - it has no layout, grid or panels object, or no panels;
  - it names a panel the editor doesn't have;
  - a panel's component isn't the panel's own id.
- **If dockview refuses it anyway**, the first layout is laid instead, and the console says the saved one couldn't be restored.
- **Panels the editor has gained** since the layout was saved join their peer's group, behind its shown tab: Assets beside Records, Problems beside the console (`PEERS`), or the active group when the peer is gone. So does a panel the saved layout names but places in no group, which dockview would drop.
- **Reset the layout** (palette, desktop only) forgets the saved layout and starts a fresh dock, exactly as on a first visit. It doesn't save the first layout, so the reset dock follows the default too.
- **A format change** bumps `LAYOUT_FORMAT`. Older layouts are then passed over, not migrated. Unlike a game save, a lost layout costs one reset.

## The phone's inspector sheet

- **Where.** `SHEET` in `layout.ts` puts the inspector in a sheet on a phone. The sheet sits between the panel and the tab bar, so the tab bar keeps the other six panels.
- **Shut**, it is a 44 px handle: a grip and the word Inspector. The inspector isn't built while the sheet is shut, so its forms (M2.4) don't run out of sight.
- **Open**, it takes 60% of the zone, and the panel above keeps the rest. The inspector edits what is selected above it, so that stays in view. It is not a modal.
- **No drag.** The handle is one button with `aria-expanded`, which opens and shuts it. Escape shuts it too, unless the palette is open. Its body scrolls and takes focus.

## The command palette

- **Opening it.** It opens from the top bar's 44 px button (a magnifier named Commands) or Ctrl+K (⌘K on a Mac), on every layout.
- **A native `<dialog>`**, opened with `showModal()`. The browser traps focus in it, makes the page behind it inert, closes it on Escape, and gives focus back when it closes. A tap on the backdrop closes it too.
- **The WAI-ARIA combobox pattern.**
  - Focus stays in the field.
  - The arrows move `aria-activedescendant` along the listbox, wrapping at the ends. Enter runs the chosen command, and so does a tap on one.
  - It opens in a layout effect, so the field has focus before the next key press is handled.
- **Matching** (`matchCommands`).
  - Every typed word must appear in a command's title or keywords, ignoring case.
  - Titles that start with the query come first. Next come titles with a word starting with each typed word, then the rest. Ties keep the order the commands were given.
- **The commands** (`appCommands.ts`):
  - New project, Import a zip, and Open a folder where the browser can;
  - for an open project: Export it as a zip, and Close it;
  - Show each panel the layout has: all nine on desktop, the console included; eight on a tablet, whose console strip is always in view; and seven on a phone, its six tabs and the inspector;
  - Reset the layout, on desktop.
  - While the library is busy, the project commands are left out, as the panel's buttons are disabled. The session would drop them.
- **Closing first.** The dialog closes before its command runs. Its focus handback would otherwise undo focus that the command moves. "Show" commands move focus into the panel they show.

## The deploy check

CI's confirm job waits until the live `version.json` names the commit. Then `tools/site-check` loads what the live page loads:

- the page, asked for with a query of its own so a CDN can't answer with the page from before the deploy;
- every script, stylesheet, preload, manifest and icon the page names;
- the service worker.

Each must come from the site itself, answer OK, and arrive as the type its extension says.

- **Why.** `version.json` loads even when the page can't start. A build for the wrong base path is the case at hand (D28): its scripts are under `/Engine-Builder/` while the site serves `/`.
- **Seen failing.** A build for `/Engine-Builder/`, served at `/` by `vite preview`, failed on all five of its files, as `text/html`, because the preview server answers a missing file with the page. The real build passed.

## Tests

- **Unit tests:**
  - `savedLayout.test.ts`: every way a saved layout is passed over, and the panels it lacks;
  - `commands.test.ts`: matching, ranking and wrapping;
  - `layout.test.ts`: each panel appears once, counting the sheet, and the dock's panel list;
  - `tools/site-check/test/check.test.ts`: a real HTTP server with a good site, a wrong base path, a script answered with HTML, a file from another site, a missing service worker and page, and a site URL without its last slash.
- **e2e tests** (`layout.spec.ts`, plus the shell and project specs):
  - a tab dragged below another group, kept through a reload, then reset;
  - a tab dragged into another group;
  - a saved layout without the console, and so without the group Problems shares with it, gets both back, and one dockview refuses falls back with a note;
  - fixed zones when the dock's code is blocked;
  - the palette by keyboard: focus, the active option, wrapping, filtering, Enter (focus lands in the panel shown), Escape (focus goes back), and Ctrl+K with Caps Lock on;
  - the palette by touch at 360 and 390 px: Show Logic and Show Inspector (the sheet opens), each taking focus into the panel, and New project (the name field takes focus);
  - the sheet at 360 and 390 px: on the tab bar, the inspector not built while shut, open with the panel kept above, Escape, shut;
  - the palette on a phone on its side, within 390 px of height;
  - the dock comes up offline, from the cache.
- **Every page check counts every axe impact.** The shared check let moderate issues through, and the repeated landmarks above were moderate.
- **Planted bugs.** Thirty-four were planted, one at a time. The first run caught 29, and each survivor changed something:
  - **Ranking**: the sample commands were already in ranked order, so they were reordered.
  - **Ctrl+K**: the tests sent a capital K, as Caps Lock does. They now send both.
  - **The shut sheet** built the inspector out of sight, and nothing said so. A test now does.
  - **Closing the palette first** mattered to nothing until the Show commands moved focus. A test now checks where focus lands.
  - **A second clear** after a failed restore was deleted: dockview takes down what it built before it throws.

## Open questions

1. **Dragging by touch.** dockview moves tabs with HTML5 drag and drop. On an iPad in landscape, which gets the dock, that is untested on a real device. If it fails, the palette needs a "Move this panel" command.
2. **Unused themes.** dockview's stylesheet carries 17 themes the editor doesn't use: 136 kB raw, 10.9 kB gzipped. Strip them at build time if the desktop's load time ever matters.
3. **Phones cache the dock.** Every phone install downloads and stores the dock's 92 kB of gzipped code and CSS that it never runs, because a tablet turned on its side needs it offline. Revisit if install size on phones matters.
4. **The sheet's height** is fixed at 60%. Make it draggable once the inspector holds real forms (M2.4)?
5. **State inside a panel** is lost when an iPad turns between tablet and desktop, because the panels are rebuilt. A half-typed project name survives only because it lives in a signal. Keep state that matters in signals, or keep the panels mounted across layouts.
6. **The on-screen keyboard.** On a short phone the palette's list may sit partly under the keyboard. This is untested on a real phone.
