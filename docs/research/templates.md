# Templates: how a new project starts (M4.11)

What the two templates in the ROADMAP ("Expedition run" and "Story/choice") are made of in the games we have, how other tools start a newcomer, and what the engine already gives a template. The decisions it led to are D61; the design is [specs/templates.md](../specs/templates.md).

## The loops in our games

Read from the earlier surveys; nothing here was read again from the sibling repos for this note.

### Expedition runs

- **Space-Wrecked's act 2** ([world-maps.md](world-maps.md), [missions.md](missions.md), [choice-events.md](choice-events.md)):
  - a hangar with a job board and a shop;
  - five sectors, each a seeded map from a way in to a jump point;
  - events drawn by a node's kind, contracts from the board, heat that brings hunters;
  - stations to resupply on the way;
  - then the settle choice. Jumps cost supplies, so a run is a budget.
- **Wasteland Protocol:** a 10-tier sector map with camps, shops, events and a boss, checked by rules ([world-maps.md](world-maps.md)).
- **Dirtbag's expeditions:** a wall with a grade, days, storm odds, a cost and a payout ([encounters.md](encounters.md)).
- **Landnam's coast:** 26 stops derived from the seed ([existing-games.md](existing-games.md)).
- **Sandbagged:** acts of tiers, where a camp can become a shop ([world-maps.md](world-maps.md)).
- **What they share:**
  - a hub to prepare in;
  - a map of node kinds made from a seed;
  - a draw at each node;
  - a cost for each move;
  - a return that settles the accounts: sell, repair, pay;
  - an end that is either a goal met or the run going wrong.

  The kits cover each part: maps (M4.6), events and decks (M3.7), encounters (M4.7), economy and shops (M3.3), quests for contracts (M3.9), stats for a hull (M3.4).

### Story and choice

- **Chooser of the Slain's nights:** an ink scene each dusk, flags, and standing with two halls ([ink.md](ink.md)). Its text is all rights reserved, so a template can borrow only the shape.
- **The hut's evening scene (M3.11):** the engine's own ink, read by a talk.
- **Rule-or-drool's arcs** of swipes, and **Dirtbag's five acts** ([existing-games.md](existing-games.md)).
- **What they share:**
  - a short sequence of scenes;
  - choices that set flags;
  - later scenes that read those flags;
  - an ending picked by what was set.

  The kits cover it: ink scenes compiled into talks (M3.11), flags (M3.1), quests as a journal (M3.9), the codex and ending screens (M4.4).

## How other tools start a newcomer

- **Unity's microgames:** a small, complete, playable game opened in the editor. A scripted tutorial comes first, then open-ended "Creative Mods" that change it, such as new models and a custom menu ([Unity Learn: Explore a Microgame](https://learn.unity.com/tutorial/explore-a-microgame); [notes on the LEGO Microgame's mods](https://newscrewdriver.com/2021/02/11/notes-on-unity-lego-microgame-creative-mods/)).
- **GDevelop's "Create a new project":**
  - Starters, which are whole games such as a platformer or a space shooter;
  - Examples, each showing one feature;
  - an Empty project.

  The wiki warns that some examples go stale as the engine moves ([GDevelop wiki: getting started](https://wiki.gdevelop.io/gdevelop5/getting_started/); [forum: general tips](https://forum.gdevelop.io/t/general-tips-for-getting-started/74426)).
- **Ren'Py:** ships "The Question," a short visual novel to read and change, beside the launcher's Create New Project ([Ren'Py quickstart, as translated on Launchpad](https://translations.launchpad.net/renpy-doc/6.17/+pots/quickstart/zh_CN/+translate?start=9)).

**What follows for us:**
- Start from a small whole game, not a blank.
- Guide changes to it, step by step.
- Keep the guide and the examples from going stale. GDevelop's warning is the risk; tying each step to a check that runs in CI is the answer.

## What the engine already gives a template

- **A project is a folder of data and a little script.** The hut and the drift are each about 40–80 files: records, ui/, scenes/ and scripts/. A template is the same thing in another place.
- **The parts are already there:**
  - the stock screens (M4.4) draw every kit's view;
  - ZzFX sounds and synth ambiences (M4.8) need no asset files;
  - export.json (M4.10) makes the template exportable as it stands.
- **The events kit pops its mode before a choice's effects run** (`packages/kits/src/events/choose.ts`). An ending that a choice triggers can therefore replace the hub's or the voyage's mode from a module's `on` handler, with no special case.
- **A shop buys items** whose tags it lists, at a share of their value (`economy/shop.ts`), so selling salvage needs no new code.
- **What is missing:**
  - a way to start a project from files: the library makes only a project.json today;
  - a place in a project for guide steps;
  - an `eb` command to write a template out.

## Open questions

1. Should a template's guide tick off steps once done, by a condition over the project's files? Not built; the steps only open places (D61's cost).
2. Will the templates be kept in step with Phase 5's 3D, or will 3D get its own templates (ROADMAP M6.9)? Assumed the latter.
