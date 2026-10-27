/**
 * M6.9's gate (D81), what its specs share: where each Make it yours step of the two 3D templates
 * lands, and each played to its ending in the Play panel by walking, through a Steer: keys and the
 * mouse on desktop, the stick, a look drag and taps on phones. Untested for feel.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { closeOn, fallenOf, fightUntil, type Steer, takeAllAndClose } from './campHelpers.ts';
import { game, topScreen } from './hutScreens.ts';
import { openProject } from './ludus.ts';
import { inspector, type Landing } from './templateHelpers.ts';
import { settled, walked } from './walkHelpers.ts';

type Press = (button: Locator) => Promise<void>;
/** A fight with `foes` until each lies: F held by keys, Attack tapped by touch. */
export type Fight = (foes: readonly string[]) => Promise<void>;

const record = (id: string) => (page: Page) => inspector(page).getByRole('heading', { name: new RegExp(`: ${id}$`) });
const code = (text: string) => (page: Page) => inspector(page).locator('.cm-content').getByText(text).first();
/** A space open in the Scene panel with the object chosen: its form, headed by its name and its id. */
const object = (name: string, id: string) => (page: Page) =>
  inspector(page).getByRole('heading', { name: `${name} (${id})`, exact: true });
const theme = (page: Page) => inspector(page).getByRole('region', { name: 'The theme' });
const playPanel = (page: Page) => page.locator('[data-panel="play"]');

export const HAMLET: readonly Landing[] = [
  { step: 'Name your game', shows: (page) => openProject(page) },
  { step: 'Rewrite what Osric asks', shows: record('reeve') },
  { step: 'Change the main quest', shows: record('bandits') },
  { step: 'Move the bandits’ camp', shows: object('The bandits’ fire', 'fire') },
  { step: 'Make the cave’s bandit tougher', shows: record('gorm') },
  { step: 'Change what Wenna trades', shows: record('wenna') },
  { step: 'Give Wenna’s job another cave', shows: record('supplies') },
  { step: 'Recolour it', shows: theme },
  { step: 'Play it', shows: playPanel },
];

export const LIGHTHOUSE: readonly Landing[] = [
  { step: 'Name your game', shows: (page) => openProject(page) },
  { step: 'Rewrite the keeper’s log', shows: code('Close the logbook.') },
  { step: 'Change what lighting the lamp takes', shows: record('light') },
  { step: 'Put something else in the chest', shows: object('The keeper’s chest', 'chest') },
  { step: 'Change what opens the store', shows: object('Store door', 'store-door') },
  { step: 'Build on the rock', shows: object('The landing', 'start') },
  { step: 'Change the night', shows: record('night') },
  { step: 'Recolour it', shows: theme },
  { step: 'Play it', shows: playPanel },
];

const across = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] as number) - (b[0] as number), (a[2] as number) - (b[2] as number));

const promptOf = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __ebWalk?: { prompt(): { object: string } | null } }).__ebWalk?.prompt()?.object ?? null,
  );

/** Walked to within `within` metres of `at`, round nothing: the routes below keep clear of what stands. */
export async function goTo(page: Page, steer: Steer, at: readonly number[], within = 1, timeout = 60_000) {
  const started = Date.now();
  for (;;) {
    const me = await walked(page);
    if (across(me.feet, at) <= within) return;
    if (Date.now() - started > timeout) throw new Error(`Never reached ${at}: ${across(me.feet, at).toFixed(1)} m off`);
    await closeOn(steer, me, at, within, 10);
  }
}

/** Walked up to `object` at `at` until its prompt is the one offered, then used. */
export async function useAt(page: Page, steer: Steer, object: string, at: readonly number[], timeout = 60_000) {
  const started = Date.now();
  while ((await promptOf(page)) !== object) {
    const me = await walked(page);
    if (Date.now() - started > timeout)
      throw new Error(`Never offered ${object}: ${across(me.feet, at).toFixed(1)} m off`);
    await closeOn(steer, me, at, 1.2, 10);
  }
  await steer.use();
}

/** The walk in `space`, its view drawn again after a door or a zone. */
async function arrived(page: Page, space: string): Promise<void> {
  await expect.poll(async () => (await walked(page)).space, { timeout: 30_000 }).toBe(space);
  await settled(page);
}

/** Walked into a zone at `at` until it takes the player to `space`. */
async function walkInto(page: Page, steer: Steer, at: readonly number[], space: string, timeout = 60_000) {
  const started = Date.now();
  while ((await walked(page)).space !== space) {
    if (Date.now() - started > timeout) throw new Error(`The zone never took the player to ${space}`);
    await closeOn(steer, await walked(page), at, 0.2, 10);
  }
  await arrived(page, space);
}

/**
 * A talk said through: the first open option whose words are wanted, else Go on once it is enabled,
 * else the first open option, until it closes. Each press waits for the line it leads to.
 */
export async function talk(page: Page, press: Press, wanted: readonly string[] = []): Promise<void> {
  const dialog = game(page).getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Its words now, or none once it has closed: allInnerTexts waits for nothing, as innerText would.
  const words = async () => (await dialog.allInnerTexts()).join('\n');
  // A tap waits for nothing, as a click does: the talk's words read the same twice before choosing.
  const steady = async () => {
    let last: string | undefined;
    for (let looks = 0; looks < 20; looks++) {
      const now = await words();
      if (now === last) return now;
      last = now;
      await page.waitForTimeout(150);
    }
    return last ?? '';
  };
  for (let said = 0; said < 30; said++) {
    const before = await steady();
    if (before === '') return;
    const open = dialog.getByRole('listitem').locator('button:enabled');
    const goOn = dialog.getByRole('button', { name: 'Go on', exact: true });
    let next: Locator | undefined;
    for (const wanting of wanted) {
      const option = open.filter({ hasText: wanting });
      if ((await option.count()) > 0) {
        next = option.first();
        break;
      }
    }
    if (!next && (await goOn.isEnabled())) next = goOn;
    if (!next && (await open.count()) > 0) next = open.first();
    if (!next) continue;
    await press(next);
    await expect.poll(words, { timeout: 10_000 }).not.toBe(before);
  }
  throw new Error('The talk went on past 30 presses');
}

/** Fought by `steer` until each of `foes` lies; the villagers left be. */
export function fightWith(page: Page, steer: Steer): Fight {
  return async (foes) => {
    await fightUntil(page, steer, (seen) => foes.every((f) => fallenOf(seen.fight).includes(f)), 180_000, foes);
  };
}

const HAMLET_AT = {
  osric: [-6, 0, 5.5],
  caveDoor: [-12.4, 0, -6],
  caveWayOut: [0, 0, 9.6],
} as const;

/**
 * The valley hamlet to its ending: Osric's job taken, Brand and Fen fought at the woods' edge,
 * Gorm in the cave under the hill, and Osric told. The green sleeps easy again.
 */
export async function playHamlet(page: Page, steer: Steer, press: Press, fight: Fight): Promise<void> {
  await useAt(page, steer, 'osric', HAMLET_AT.osric);
  await talk(page, press, ['I’ll see to it']);
  // West of the well, then straight at the bandits at the woods' edge, fighting as they come: they
  // see the player long before a walk to a point would end.
  await goTo(page, steer, [-3, 0, 3]);
  await fight(['brand', 'fen']);
  await goTo(page, steer, [-9, 0, -6]);
  await useAt(page, steer, 'cave-door', HAMLET_AT.caveDoor);
  await arrived(page, 'cave');
  await fight(['gorm']);
  await walkInto(page, steer, HAMLET_AT.caveWayOut, 'green');
  // From the hill's foot east, then south between the reeve's house and the well.
  await goTo(page, steer, [-4, 0, -3]);
  await goTo(page, steer, [-4, 0, 7]);
  await useAt(page, steer, 'osric', HAMLET_AT.osric);
  await talk(page, press, ['They’re gone, all three']);
  await expect(topScreen(page).getByText('The green sleeps easy again.')).toBeVisible();
}

/**
 * The lighthouse to its ending: the keeper's log read, the key taken from their chest, the store
 * unlocked and its oil fetched, and the lamp lit at the top of the stair.
 */
export async function playLighthouse(page: Page, steer: Steer, press: Press): Promise<void> {
  await useAt(page, steer, 'tower-door', [0, 0, 3.05]);
  await arrived(page, 'room');
  await useAt(page, steer, 'logbook', [0, 0.8, -0.5]);
  await talk(page, press, ['Close the logbook.']);
  await useAt(page, steer, 'chest', [-3, 0, 2.6]);
  await takeAllAndClose(page, press);
  await useAt(page, steer, 'store-door', [-2.6, 0, -3.8]);
  await arrived(page, 'store');
  await useAt(page, steer, 'oil', [0, 1.6, -2]);
  await walkInto(page, steer, [0, 0, 2.9], 'room');
  await useAt(page, steer, 'stair', [2.6, 0, -3.6]);
  await arrived(page, 'lamp-room');
  await useAt(page, steer, 'lamp', [0, 0, -0.6]);
  await expect(topScreen(page).getByText(/Somewhere out there, the Mary Dunn alters course\./)).toBeVisible();
}
