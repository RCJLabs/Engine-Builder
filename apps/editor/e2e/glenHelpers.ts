/**
 * M5.9's gate (D71, docs/specs/worldspaces.md#the-gate), what its specs share: the glen brought into
 * the editor and played, what window.__ebWalk says of its uses, stands and takes and how the walk
 * began, the loading screens seen between spaces, and keys held until the walk is in another space.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';
import { drawing, type Walked, walked } from './walkHelpers.ts';

export const GLEN = join(import.meta.dirname, '../../../tools/cli/test/fixtures/glen');

export interface Acted {
  readonly space: string;
  readonly began: { readonly from: 'at' | 'arrive' | 'start'; readonly spawn?: string };
  readonly prompt: { readonly object: string; readonly label: string } | null;
  readonly used: readonly { readonly object: string; readonly sent: string }[];
  readonly stood: readonly { readonly feet: readonly number[]; readonly yaw: number; readonly sent: string }[];
  readonly taken: readonly string[];
  readonly hidden: readonly string[];
}

/** The page's window.__ebWalk, as src/walk/hook.ts declares M5.9's part of it. */
interface Hooked {
  __ebWalk?: {
    readonly space: string;
    readonly began: Acted['began'];
    prompt(): Acted['prompt'];
    used(): Acted['used'];
    stood(): Acted['stood'];
    taken(): Acted['taken'];
    hidden(): Acted['hidden'];
  };
  __ebLoading?: string[];
}

/** What the walk says now of its uses, its stands and its takes. */
export async function acted(page: Page): Promise<Acted> {
  const read = await page.evaluate(() => {
    const hook = (window as unknown as Hooked).__ebWalk;
    if (!hook) return null;
    return {
      space: hook.space,
      began: hook.began,
      prompt: hook.prompt(),
      used: hook.used(),
      stood: hook.stood(),
      taken: hook.taken(),
      hidden: hook.hidden(),
    };
  });
  if (!read) throw new Error('No space is being walked');
  return read;
}

/**
 * Every loading screen the page shows from its first load, as "role: text", seen as it is added:
 * it is gone once the next space's first frame is drawn, too soon to poll for.
 */
export async function watchLoading(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as Hooked).__ebLoading = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('eb-space-loading')) {
            seen.push(`${node.getAttribute('role')}: ${node.textContent}`);
          }
        }
      }
      // The document itself: an init script runs before the parser has made <html>.
    }).observe(document, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => [...((window as unknown as Hooked).__ebLoading ?? [])]);
}

/** The glen imported, its scripts let run, and a new game of it in Play: the glen drawn. */
export async function openGlen(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(GLEN, 'glen'));
  await expect(openProject(page).getByRole('heading', { name: 'The glen' })).toBeVisible();
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  await expect(game(page).getByText('Take a rope and the bothy’s lamp.')).toBeVisible();
  return drawing(page, 'glen', 'The glen');
}

/** The Interact prompt over the view: a button, the touch one too. */
export const promptButton = (box: Locator): Locator => box.locator('.walk-use');

/** Until the prompt offers this object, or none. */
export async function offered(page: Page, object: string | null): Promise<void> {
  await expect.poll(async () => (await acted(page)).prompt?.object ?? null, { timeout: 20_000 }).toBe(object);
}

/**
 * Keys held until the walk is in `space`, let go by the page as the stage there takes over: a door
 * walked into swaps the stage, so the feet of the one before can't say when to stop.
 */
export async function holdUntilIn(
  page: Page,
  keys: readonly string[],
  space: string,
  timeout = 30_000,
): Promise<Walked> {
  const box = page.locator('[data-eb-walk]');
  const there = box.evaluate(
    (element, { codes, space }) =>
      new Promise<void>((resolve) => {
        const check = () => {
          const hook = (window as unknown as { __ebWalk?: { space: string } }).__ebWalk;
          if (hook?.space !== space) return void requestAnimationFrame(check);
          for (const code of codes) element.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
          resolve();
        };
        check();
      }),
    { codes: [...keys], space },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Not in ${space} in ${timeout} ms`)), timeout);
  });
  for (const key of keys) await page.keyboard.down(key);
  try {
    await Promise.race([there, late]);
  } finally {
    clearTimeout(timer);
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
  return walked(page);
}

/**
 * The stand-in pad's sticks pushed until the feet pass a line, the prompt offers an object or some frames have passed, let
 * go by the page on the frame it does: polled from here, a loaded box walked on past the bothy's
 * door to the wall, where the door is out of the prompt's cone.
 */
export async function padUntil(
  page: Page,
  axes: readonly number[],
  until: { readonly x?: number; readonly prompt?: string; readonly frames?: number },
  timeout = 30_000,
): Promise<void> {
  await page.evaluate(
    ({ axes, until, timeout }) =>
      new Promise<void>((resolve, reject) => {
        const pad = (window as unknown as { __pad: { axes: number[] } }).__pad;
        const started = performance.now();
        pad.axes = [...axes];
        let frames = 0;
        const check = () => {
          frames++;
          const hook = (
            window as unknown as {
              __ebWalk?: { character(): { feet: number[] }; prompt(): { object: string } | null };
            }
          ).__ebWalk;
          const x = hook?.character().feet[0];
          const done =
            (until.x !== undefined && x !== undefined && x <= until.x) ||
            (until.prompt !== undefined && hook?.prompt()?.object === until.prompt) ||
            (until.frames !== undefined && frames > until.frames);
          if (done) {
            pad.axes = [0, 0, 0, 0];
            return resolve();
          }
          if (performance.now() - started > timeout) {
            pad.axes = [0, 0, 0, 0];
            return reject(new Error(`The pad never got to ${JSON.stringify(until)}`));
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    { axes: [...axes], until, timeout },
  );
}
