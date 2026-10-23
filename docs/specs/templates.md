# Templates (M4.11, D61)

A template is a small game that plays as it stands, from which New project starts a project of the author's own. It carries steps for making it theirs. There are two:
- **Salvage coast**, the Expedition run;
- **The last ferry**, the Story/choice.

The survey behind them is [research/templates.md](../research/templates.md).

## Where templates live

- **`templates/templates.json`** lists them in the order New project offers them:

  ```json
  [
    { "id": "salvage-coast", "title": "Expedition run", "blurb": "A salvage skipper on a stormy coast: …" },
    { "id": "last-ferry", "title": "Story and choices", "blurb": "One night on the last ferry: …" }
  ]
  ```

- **`templates/<id>/`** is an ordinary project folder: project.json, export.json, guide.json, records/, scenes/, scripts/ and ui/. Nothing in it is special to templates except guide.json, which any project may have.
- **Each template is checked as the fixtures are:**
  - `eb validate` finds no problems, warnings included;
  - `eb sim` plays 500 seeds with the template's policy and matches a golden file, `tools/cli/test/fixtures/<id>-<policy>.golden.json`;
  - every stage of every quest is reached in some run, and every ending in some run.
- **The editor bundles each template as one chunk,** loaded only when it is chosen. The service worker precaches it with the rest of the editor, so New project works offline.

## Starting from a template

- **New project** asks for a name and offers **Start from**:
  - Empty, the default;
  - each template, by its title, with its blurb under the choice.
- **What it writes:** every file of the template, with three changes for the author's name:
  - **project.json** takes the id made from the name (as an empty project does) and the name as typed. Kits, calendar and version are kept.
  - **export.json** takes the name as its `name`, and a `short-name` that fits in 12 characters, so it never starts with W138. That is the name itself when it fits, else its first whole words that do, else its first 12 characters.
  - **ui/shell.json** takes the name as its `title`, which the title screen shows.
- **The new project is the author's own:**
  - nothing in it points back at the template;
  - its scripts run without being trusted first, as for any project made in this browser, since they came with the editor.
- **`eb new <folder> --template <id> [--name <text>]`** writes the same files into a folder that doesn't exist or is empty. The name defaults to the folder's own name. Without `--template`, or with an id that isn't one, it lists the templates.

## guide.json

- **Its shape:** steps for making the project one's own, shown in the Project panel under **Make it yours**.

  ```json
  {
    "title": "Make it yours",
    "steps": [
      {
        "id": "debt",
        "title": "Change what the boat owes",
        "text": "The harbourmaster's debt is a resource. Raise it for a longer game, lower it for a shorter one.",
        "open": { "file": "records/resource/debt.json", "at": "/start" }
      },
      { "id": "play", "title": "Play it", "text": "…", "open": { "panel": "play" } }
    ]
  }
  ```

- **Each field:**
  - **`title`:** optional, at most 60 characters; "Make it yours" when left out.
  - **`steps`:** 1 to 20 steps, shown in order and numbered.
  - **A step's `id`:** kebab-case and unique within the file. Its `title` is at most 80 characters, its `text` at most 400.
  - **A step's `open`:** one of two things.
    - `{ "file": <project path>, "at"?: <JSON Pointer> }` opens the file where a problem in it would open: a record's form at the field, a type in the designer, a script or a scene, a screen or the theme, an asset, or the Project panel for project.json and export.json.
    - `{ "panel": <panel> }` shows a panel: project, records, assets, world, logic, play or problems.
- **The checks:**
  - **E057:** guide.json isn't the shape above: not JSON, an unknown key, a missing title or text, too many steps, or a repeated id.
  - **W140:** a step opens a file the project doesn't have, or one the editor can't open. Problems lists it under guide.json and opens the Project panel.
- **Where it goes:**
  - zips carry guide.json, as they carry export.json;
  - a game's pack never does, since nothing in a game reads it.

## Make it yours, in the Project panel

- **The section** sits above Export, lazily loaded as Export is. Each step shows:
  - its number and title;
  - its text;
  - an **Open** button that goes where the step says.
- **Remove the guide** deletes guide.json as one step, which undo brings back.
- **A project without guide.json shows no section.**
- **The steps don't check that they were done** (D61's cost). They open places; the author reads, changes and plays.

## Salvage coast

- **What it is:** a salvage skipper owes the harbourmaster for the boat, the *Kittiwake*, and has five voyages to pay it off.
- **Kits:** inventory, economy, stats, events, maps, encounters and quests.
- **The harbour**, the module `harbour`'s mode of the same name, offers five things, and a sixth at the end:
  - **Set sail:** a voyage, while fewer than five have been made and the debt stands.
  - **The chandlery:** a shop selling stores and buying salvage.
  - **The contract board:** an event whose choices start contracts.
  - **The harbourmaster:** an event whose choices pay the debt down.
  - **The yard:** an event whose choices patch the hull and take on stores, for coin.
  - **Hand over the Kittiwake:** only once the fifth voyage is over with the debt standing.
- **A voyage is the coast,** a layered map made fresh from the seed each time:
  - from the harbour mouth to the home light;
  - wrecks and storms drawn from decks;
  - raiders fought with the encounters kit, their odds shown as rolled;
  - a cove that patches the hull;
  - open water.

  Each move costs a store. Arriving at the home light brings the boat back to harbour.
- **Contracts are quests:**
  - the *Gannet*'s bell, found in a wreck and brought home;
  - a survey of three wrecks.

  Each pays on its return to harbour.
- **Three endings,** each a mode with its ending screen:
  - **Free and clear:** the debt quest is done.
  - **Seized:** the fifth voyage is over and the debt stands; *Hand over the Kittiwake* is the harbour's only choice.
  - **Lost at sea:** the hull runs out.
- **Script and data:** the module (`scripts/harbour.ts`) is the harbour's actions and those three endings. Everything else is records.
- **Its policy is `skipper`** (`scripts/skipper.ts`), a script rather than weights: in harbour it sells the hold, pays the harbourmaster when the purse allows, takes on stores below six and patches a hull below six, then sails; at sea it takes the first move on; in an event it pays, provisions, patches and takes work before anything else, else a choice at random. A weighted bot rarely paid the debt, so every ending wasn't reached; random play is lost at sea four runs in five.

## The last ferry

- **What it is:** tonight the old ferry makes its last crossing, since tomorrow the bridge opens. Four passengers board at dusk:
  - Ines, a midwife late for a birth;
  - Tomas, a soldier without papers;
  - Marta, who carries her husband's ashes;
  - a stranger who pays in an old coin.
- **Kits:** dialogue and quests. Flags are the engine's own.
- **The crossing,** the module `ferry`'s mode of the same name, offers **Row on** to the next passenger's scene, four times, and then **Come ashore**, which plays the landing.
- **Each scene is ink** (`scenes/<id>.ink`), compiled into a talk. Its choices set flags, and the landing reads them.
- **Each passenger has a quest:** their story in the journal, its stages moved by the flags their scene sets.
- **Three endings,** picked by the landing, which sets the number flag `ending` to 1, 2 or 3. When the landing ends, the module moves to its one other mode, `ashore`, whose ending screen shows the text whose condition reads that flag:
  - **Every light ashore:** Ines in time, Tomas hidden, Marta's stop made.
  - **The patrol's lantern:** Tomas found.
  - **The far bank:** any other night.
- **Its policy is `ferryman`:** it rows on and says what the scenes offer, at random.
- **The crossing quest** reads the same flag, its outcomes the three endings, so the journal shows how the night went and the sweep counts it. Without it, W108 called the flag never read: the check doesn't count a screen's conditions as readers (open question 3).

## The gate (D61)

- **`templates.test.ts` in tools/cli, for each template:**
  - `eb validate` finds no problems;
  - 500 seeds match the golden file;
  - every quest stage and every ending is reached at least once.
- **`templates.spec.ts` in the editor, for each template:**
  - New project from it;
  - every guide step followed, each opening the place it names;
  - played to an ending in the Play panel;
  - exported as a single file that plays from `file://`.
- **`templatesPhone.spec.ts`:** the same by touch at 360×740, 390×844 and 844×390, every control in reach and nothing axe finds.
- **`eb new` is tested in Node:** the files written, the name applied, and a non-empty folder refused.
- **A step's file renamed or gone:** `templates.spec.ts` renames the raider record that "Make the raiders tougher" opens; the encounter's foe and the step follow, with no problems. Deleted, the step is W140 in Problems, which opens the Project panel.

## Renaming what a template holds

A template's records are mostly the kits' types, whose references the project's type files don't describe. Renaming a record (M2.6, D33) now also rewrites every reference the record index finds to it in a record, read from the working copy as the step runs: the kits' and the engine's types, effects, and a map's keys such as a choice's `cost`. It also moves guide.json's steps that open its file. What it doesn't change, as before: conditions that name the id as a word, a screen's text that does, and scenes and scripts. Those show as problems to fix by hand.

## Open questions

1. Should the guide's steps tick themselves off by a condition over the project? Not built (D61's cost).
2. Should templates have a third, 3D, kind once Phase 5 lands? The ROADMAP plans 3D templates at M6.7.
3. W108 (a flag set and never read) doesn't count a screen's `shows-when` or text as reading a flag, so a flag only a screen reads is flagged. The ferry reads its ending through a quest as well. Should screens count? Logged under Phase 4.
4. Renaming a record leaves conditions, screens' text, scenes and scripts that name it. Should the rename offer to change those it can parse, such as a condition's `@id` or an ink `EXTERNAL`'s argument?
