/**
 * Jumps on the walk, watched by the page itself rather than polled from here: on a loaded CI box a
 * jump can be up and down between two of the test's reads, and a key let go from here is let go
 * frames late (M6.5).
 */
import type { Page } from '@playwright/test';

type Vec3 = readonly [number, number, number];

/**
 * Space pressed with `keys` held through the jump, each let go by the page itself: Space on the
 * first frame the walk rises, the keys on the first it lands. The feet where each happened. Let go
 * from here, a loaded CI box held W two round trips past the landing and walked off the far side
 * of the trail's step (M6.5).
 */
export async function jumpHolding(
  page: Page,
  keys: readonly string[],
  timeout = 30_000,
): Promise<{ rose: Vec3; landed: Vec3 }> {
  const box = page.locator('[data-eb-walk]');
  const done = box.evaluate(
    (element, codes) =>
      new Promise<{ rose: Vec3; landed: Vec3 }>((resolve) => {
        type Read = { feet: Vec3; velocity: Vec3; grounded: boolean };
        const up = (code: string) => element.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
        let rose: Vec3 | null = null;
        const check = () => {
          const w = (window as unknown as { __ebWalk?: { character(): Read } }).__ebWalk?.character();
          if (w && !rose && !w.grounded && w.velocity[1] > 0) {
            rose = [...w.feet];
            up('Space');
          } else if (w && rose && w.grounded) {
            for (const code of codes) up(code);
            return resolve({ rose, landed: [...w.feet] });
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    [...keys],
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`No jump risen and landed in ${timeout} ms`)), timeout);
  });
  for (const key of keys) await page.keyboard.down(key);
  await page.keyboard.down('Space');
  try {
    return await Promise.race([done, late]);
  } finally {
    clearTimeout(timer);
    await page.keyboard.up('Space');
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
}

/**
 * From now, the highest the feet have been, kept by the page itself every frame; read as often as
 * wanted. Read from here, a jump can be up and down between two reads: on a loaded CI box the jump
 * button's tap alone took 22 frames (M6.5).
 */
export async function watchHeight(page: Page): Promise<() => Promise<number>> {
  type Watched = { __ebTop?: { top: number }; __ebWalk?: { character(): { feet: Vec3 } } };
  await page.evaluate(() => {
    const w = window as unknown as Watched;
    // Watched again, the last watch's loop sees it isn't the one kept and stops.
    const seen = { top: Number.NEGATIVE_INFINITY };
    w.__ebTop = seen;
    const frame = () => {
      if (w.__ebTop !== seen) return;
      const feet = w.__ebWalk?.character().feet;
      if (feet) seen.top = Math.max(seen.top, feet[1]);
      requestAnimationFrame(frame);
    };
    frame();
  });
  return () => page.evaluate(() => (window as unknown as Watched).__ebTop?.top ?? Number.NEGATIVE_INFINITY);
}
