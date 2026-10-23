/**
 * M4.8's gate (D58), what its specs share: the page's audio as `window.__ebAudio` tells it, the
 * buzzes caught by standing in for `navigator.vibrate` before the page loads, and every sound and
 * buzz the page has played, gathered as play goes on (the hook keeps only the last 50).
 */
import { expect, type Page } from '@playwright/test';

export interface Heard {
  readonly context: 'none' | 'running' | 'suspended';
  readonly ambience?: string;
  readonly music?: string;
  readonly levels: Readonly<Record<string, number>>;
  readonly buses: Readonly<Record<string, number>>;
  readonly gains?: Readonly<Record<string, number>>;
  readonly played: readonly { readonly kind: 'sound' | 'buzz'; readonly id: string; readonly bus?: string }[];
}

type Hooked = { __ebAudio?: Heard; __buzzes?: number[][] };

/** The page's audio now, or null before anything has made a player. */
export const heard = (page: Page): Promise<Heard | null> =>
  page.evaluate(() => (window as unknown as Hooked).__ebAudio ?? null);

/** Every vibration a page asks for, kept as its pattern; set before the page loads. */
export async function catchBuzzes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const caught: number[][] = [];
    (window as unknown as Hooked).__buzzes = caught;
    Object.defineProperty(Navigator.prototype, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => {
        caught.push(Array.isArray(pattern) ? [...pattern] : [pattern]);
        return true;
      },
    });
  });
}

export const buzzes = (page: Page): Promise<number[][]> =>
  page.evaluate(() => (window as unknown as Hooked).__buzzes ?? []);

/** Sounds and buzzes heard so far, by "kind:id", added to as play goes on. */
export async function gather(page: Page, into: Set<string>): Promise<Set<string>> {
  for (const { kind, id } of (await heard(page))?.played ?? []) into.add(`${kind}:${id}`);
  return into;
}

/** The page's visibility, as a browser hiding the tab would set it. */
export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Presses a volume's Quieter or Louder until it shows `to`, each press one step of 10. */
export async function setVolume(
  page: Page,
  name: string,
  to: string,
  press: (b: ReturnType<Page['getByRole']>) => Promise<void> = (b) => b.click(),
): Promise<void> {
  const row = page.locator('.eb-shell-screens').getByRole('group', { name, exact: true });
  const value = row.locator('output');
  const level = (text: string | null) => (text === 'Off' ? 0 : Number(text));
  for (let n = 0; n < 11 && (await value.textContent()) !== to; n++) {
    const now = level(await value.textContent());
    const down = now > level(to);
    await press(row.getByRole('button', { name: `${name} ${down ? 'quieter' : 'louder'}` }));
    const next = down ? now - 10 : now + 10;
    await expect(value).toHaveText(next === 0 ? 'Off' : String(next));
  }
  await expect(value).toHaveText(to);
}
