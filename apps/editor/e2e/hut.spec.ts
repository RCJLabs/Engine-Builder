/**
 * Phase 3's gate (D50): the hut, an adventure built only in the editor. From an empty project,
 * through the editor's panels and forms, its script editor and its scene editor: the kits ticked,
 * the goods, factions and store, the talks, the quests and the storm, the sheet, the game's
 * scripts and the evening's scene, its sounds, ambiences and music (M4.8), and its screens and
 * theme in the Play panel (M4.1), each compared with the hut fixture as it lands. Exported, the
 * project is the fixture file for file, `eb validate` finds nothing, and `eb sim` plays it with the
 * game's bot, every quest done in some run.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { makeAudio } from './hutAudio.ts';
import { expectPlayed, expectTheFixture, exportHut } from './hutExport.ts';
import { makeGoods } from './hutGoods.ts';
import { FOLDER, fixture } from './hutHelpers.ts';
import { makeGame, makeScene, makeSheet } from './hutLogic.ts';
import { makeQuests } from './hutQuests.ts';
import { makeScreens } from './hutScreens.ts';
import { makeAnselm, makeGreta, makeStorm } from './hutStory.ts';
import { createProject, kitsBox, stored } from './kitHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

const KITS = ['Economy', 'Factions', 'Time', 'Events', 'Dialogue', 'Quests'];

test('the hut, built only in the editor, exported clean and played to every quest done', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await createProject(page, 'The hut');
  for (const kit of KITS) await kitsBox(page).getByLabel(kit, { exact: true }).check();
  await expect.poll(() => stored(page, FOLDER, 'project.json')).toEqual(fixture('project.json'));
  await test.step('goods, factions and the store', () => makeGoods(page));
  await test.step('Greta’s talk', () => makeGreta(page));
  await test.step('the quests', () => makeQuests(page));
  await test.step('Anselm’s talk and the storm', async () => {
    await makeAnselm(page);
    await makeStorm(page);
  });
  await test.step('the game’s scripts', () => makeGame(page));
  await test.step('the evening, in ink', () => makeScene(page));
  await test.step('the sheet', () => makeSheet(page));
  await test.step('the sounds, the ambiences and the music', () => makeAudio(page));
  await test.step('the screens and the theme', () => makeScreens(page));
  await test.step('exported, checked and played', async () => {
    const zip = await exportHut(page);
    expectTheFixture(zip);
    expectPlayed(zip);
  });
  expect(errors).toEqual([]);
});
