/**
 * M4.4's gate (D54), what its specs share: the hut with its own screens set aside, keeping its
 * theme, feedback and shell; the same hut built in Node on stock screens alone, as New screen
 * writes them, with a CC-BY image and its credit; and the press a keeper makes next on them,
 * pressing only what they draw.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { expect, type Locator, type Page } from '@playwright/test';
import { folderSource } from '../../../tools/cli/src/folderSource.ts';
import { contextFrom, type Held } from '../src/screens/stock/context.ts';
import { allStock } from '../src/screens/stock/index.ts';
import { HUT } from './hutHelpers.ts';
import { game, topScreen } from './hutScreens.ts';
import { PNG, REPO, scratch } from './ludus.ts';

/** The stock screens the hut's kits allow, as New screen names them, in the order they are made. */
export const HUT_STOCK = ['Dialogue', 'Event', 'Shop', 'Inventory', 'Journal', 'Codex', 'Credits', 'HUD', 'Ending'];

/** The image the gate credits, at the path the editor's import gives it, and its provenance. */
export const ROPE_ART = 'images/rope.png';
export const ROPE_CREDIT = { licence: 'CC-BY-4.0', source: 'https://example.org/rope', author: 'Ana Example' };
export { PNG };

let made = 0;

/** A copy of the hut with its screens set aside: ui/ keeps only the theme, the feedback and the shell. */
export function stockHutDir(): string {
  const dir = join(scratch, `stock-hut-${Date.now()}-${++made}`);
  cpSync(HUT, dir, { recursive: true });
  const kept = new Set(['theme.json', 'feedback.json', 'shell.json']);
  for (const file of readdirSync(join(dir, 'ui'))) if (!kept.has(file)) rmSync(join(dir, 'ui', file));
  return dir;
}

/** The hut on stock screens, its image credited, built in Node into a game file. */
export async function stockHutGame(): Promise<string> {
  const dir = stockHutDir();
  mkdirSync(join(dir, 'assets/images'), { recursive: true });
  writeFileSync(join(dir, 'assets', ROPE_ART), PNG);
  // The hut's own entries stay: its music's stem is logged there (M4.8).
  const log = JSON.parse(readFileSync(join(dir, 'assets/assets.json'), 'utf8')) as { files: Record<string, unknown> };
  writeFileSync(
    join(dir, 'assets/assets.json'),
    JSON.stringify({ files: { ...log.files, [ROPE_ART]: { ...ROPE_CREDIT, date: '2026-10-20' } } }),
  );
  const source = folderSource(dir);
  const loaded = await projectGame(source);
  if (loaded.kind !== 'loaded') throw new Error(`The hut's game didn't load: ${loaded.kind}`);
  const compiled = await compileWithGame(source);
  const held: Held[] = Object.entries(compiled.pack?.records ?? {}).flatMap(([type, group]) =>
    Object.entries(group).map(([id, value]) => ({ type, id, value })),
  );
  const { start, modes, endings } = loaded.catalog;
  const ctx = contextFrom(
    {
      game: 'The hut',
      kits: compiled.pack?.project.kits ?? [],
      modes: { start, all: modes, endings },
      screens: [],
      shown: new Set(),
    },
    held,
  );
  for (const { id, text } of allStock(ctx)) writeFileSync(join(dir, 'ui', `${id}.json`), text);
  const file = join(scratch, `stock-hut-${Date.now()}-${made}.game.json`);
  execFileSync('node', ['tools/cli/src/cli.ts', 'build', dir, '--out', file], { cwd: REPO });
  return file;
}

/**
 * The button a keeper presses next on stock screens: in a talk or an event, its first option on
 * offer or Go on; in the shop, Leave; otherwise the hut's own Carry, as the HUD words it, and Close
 * once the season is over. Undefined once the game is over; `title` names the modal on top.
 */
export async function stockNextPress(page: Page): Promise<{ button: Locator; title?: string } | undefined> {
  const top = topScreen(page);
  if (await top.getByText('The game is over.').isVisible()) return undefined;
  const dialog = game(page).getByRole('dialog');
  if (await dialog.isVisible()) {
    const title = (await dialog.getByRole('heading', { level: 2 }).first().textContent()) ?? '';
    if (title === 'The shop') return { button: dialog.getByRole('button', { name: 'Leave' }), title };
    const options = dialog.getByRole('listitem').locator('button:enabled');
    if ((await options.count()) > 0) return { button: options.first(), title };
    return { button: dialog.getByRole('button', { name: 'Go on' }), title };
  }
  const close = top.getByRole('button', { name: 'Close', exact: true });
  return {
    button: (await close.isVisible()) ? close : top.getByRole('button', { name: 'Carry', exact: true }),
    title: '',
  };
}

/** A page the HUD opens by its button, checked to show `text`, and closed again. */
export async function openPage(page: Page, name: string, how: (b: Locator) => Promise<void> = (b) => b.click()) {
  await how(topScreen(page).getByRole('button', { name, exact: true }));
  const dialog = game(page).getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  return dialog;
}
