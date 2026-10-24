/**
 * What M5.4's specs share (D66): a space's environment made from a preset in the inspector, read
 * back through (window as unknown as Hooked).__ebViewport.environment(), and the sky's colour read
 * from the canvas's own pixels, a band near its top with the camera level, decoded as the page
 * drew them.
 */
import { decodePng } from '@eb/export';
import { expect, type Locator, type Page } from '@playwright/test';
import { dragTouch, scenePanel } from './spaceHelpers.ts';

export type Rgb = readonly [number, number, number];

export interface Look {
  readonly sky: 'physical' | 'gradient' | 'colour';
  readonly turbidity: number | null;
  readonly sun: { readonly direction: [number, number, number]; readonly strength: number; readonly color: string };
  readonly skyLight: { readonly strength: number; readonly color: string };
  readonly fog: { readonly color: string; readonly near: number; readonly far: number } | null;
  readonly weather: 'rain' | 'snow' | 'none';
  readonly particles: number;
  readonly animating: boolean;
}

type Hooked = {
  __ebViewport?: {
    frames: number;
    environment(): Look | null;
    camera(): { target: [number, number, number]; yaw: number; pitch: number; distance: number };
  };
};

/** What each preset gives the view, as docs/specs/environments.md#the-presets tables it. */
export const PRESETS = {
  Desert: {
    sky: 'physical',
    turbidity: 6,
    fog: { color: '#d9c3a0', near: 120, far: 600 },
    weather: 'none',
    particles: 0,
    sun: true,
  },
  Coast: {
    sky: 'physical',
    turbidity: 3,
    fog: { color: '#b8c8d4', near: 80, far: 500 },
    weather: 'none',
    particles: 0,
    sun: true,
  },
  Forest: {
    sky: 'physical',
    turbidity: 4,
    fog: { color: '#8fa38a', near: 30, far: 220 },
    weather: 'none',
    particles: 0,
    sun: true,
  },
  Snow: {
    sky: 'gradient',
    turbidity: null,
    fog: { color: '#e6edf3', near: 20, far: 160 },
    weather: 'snow',
    particles: 1200,
    sun: true,
  },
  Cave: {
    sky: 'colour',
    turbidity: null,
    fog: { color: '#0d0f12', near: 5, far: 60 },
    weather: 'none',
    particles: 0,
    sun: false,
  },
  'Sci-fi interior': { sky: 'colour', turbidity: null, fog: null, weather: 'none', particles: 0, sun: false },
  Town: {
    sky: 'physical',
    turbidity: 4,
    fog: { color: '#c7a88a', near: 60, far: 400 },
    weather: 'rain',
    particles: 1200,
    sun: true,
  },
} as const;
export type PresetName = keyof typeof PRESETS;

/** The sky's colours where the spec gives them: a colour sky's one colour, a gradient's two. */
export const SKY_COLOURS: Partial<Record<PresetName, { zenith: string; horizon?: string }>> = {
  Snow: { zenith: '#8fb0d0', horizon: '#e6eef5' },
  Cave: { zenith: '#0d0f12' },
  'Sci-fi interior': { zenith: '#10161d' },
};

export const look = (page: Page): Promise<Look | null> =>
  page.evaluate(() => (window as unknown as Hooked).__ebViewport?.environment() ?? null);

const camera = (page: Page) => page.evaluate(() => (window as unknown as Hooked).__ebViewport?.camera() ?? null);

/**
 * The camera turned level, so the top of the view is sky: arrows on a keyboard, a finger dragged up
 * by touch. A view made again (the sheet raised and lowered on a phone) starts looking down again.
 */
export async function levelCamera(page: Page, touch: boolean): Promise<void> {
  const view = scenePanel(page).locator('.scene-view');
  const pitch = (await camera(page))?.pitch ?? 30;
  if (Math.abs(pitch) < 2) return;
  if (touch) {
    await view.scrollIntoViewIfNeeded();
    const box = await view.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    if (!box) throw new Error('no view');
    // 0.3° a pixel, as orbit.ts turns: up the screen lowers the camera's pitch. The finger starts
    // on the view where the page shows it, which sideways is only its top.
    const y = Math.min(box.y + box.height * 0.75, height - 8);
    await dragTouch(page, { x: box.x + box.width / 2, y }, [0, -1], pitch / 0.3);
  } else {
    await view.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
  }
  await expect
    .poll(async () => Math.abs((await camera(page))?.pitch ?? 99), { message: 'the camera level' })
    .toBeLessThan(2);
}

/** The hook's look, once it has what `expected` says. */
export async function expectLook(page: Page, expected: Record<string, unknown>): Promise<Look> {
  await expect
    .poll(() => look(page), { message: `the view drawing ${JSON.stringify(expected)}` })
    .toMatchObject(expected);
  return (await look(page)) as Look;
}

/** A preset's look as the hook reports it: its sky, fog and weather, and a sun only where it has one. */
export async function expectPreset(page: Page, name: PresetName): Promise<Look> {
  const { sun, ...rest } = PRESETS[name];
  const seen = await expectLook(page, rest);
  if (sun) expect(seen.sun.strength).toBeGreaterThan(0.3);
  else expect(seen.sun.strength).toBe(0);
  return seen;
}

/** The median colour of a band near the top of the canvas, as drawn: sky, with the camera level. */
export async function skyColour(page: Page): Promise<Rgb> {
  const canvas = scenePanel(page).locator('canvas.scene-canvas');
  const shot = decodePng(new Uint8Array(await canvas.screenshot()));
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  for (let y = Math.floor(shot.height * 0.05); y < Math.floor(shot.height * 0.12); y++) {
    for (let x = Math.floor(shot.width * 0.3); x < Math.floor(shot.width * 0.7); x += 3) {
      const at = (y * shot.width + x) * 4;
      reds.push(shot.data[at] as number);
      greens.push(shot.data[at + 1] as number);
      blues.push(shot.data[at + 2] as number);
    }
  }
  const median = (list: number[]) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)] as number;
  return [median(reds), median(greens), median(blues)];
}

export const rgbOf = (hex: string): Rgb =>
  [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) as unknown as Rgb;
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The sky drawn as the preset's: its colour, near a gradient's zenith, or a blue day's sky. */
export async function expectSky(page: Page, name: PresetName): Promise<Rgb> {
  const colours = SKY_COLOURS[name];
  let seen: Rgb = [0, 0, 0];
  await expect
    .poll(
      async () => {
        seen = await skyColour(page);
        if (!colours) return seen[2] > seen[0] + 20;
        const zenith = rgbOf(colours.zenith);
        if (!colours.horizon) return distance(seen, zenith) <= 6;
        return distance(seen, zenith) < distance(seen, rgbOf(colours.horizon));
      },
      { message: `the ${name} sky drawn` },
    )
    .toBe(true);
  return seen;
}

/** A new environment for the open space from a preset, by the inspector's New environment from. */
export async function newFromPreset(inspector: Locator, name: PresetName): Promise<void> {
  await inspector.getByLabel('New environment from').selectOption({ label: name });
}

/** A slider in the inspector set by its label, as a hand would leave it, its output then reading `shown`. */
export async function setSlider(inspector: Locator, label: string, value: number, shown: string): Promise<void> {
  await inspector.getByLabel(label, { exact: true }).fill(String(value));
  await expect(inspector.locator('.environment-slider').filter({ hasText: label }).locator('output')).toHaveText(shown);
}

/** How bright a colour looks: its luma. */
export const luma = ([r, g, b]: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** How many frames the view has drawn. */
export const frames = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as Hooked).__ebViewport?.frames ?? 0);

/**
 * The view drawing nothing by itself: once the frames an edit asked for are drawn, none more for a
 * second. Falling weather that ignores reduced motion never settles.
 */
export async function expectStill(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await frames(page);
        await page.waitForTimeout(400);
        return (await frames(page)) - before;
      },
      { message: 'the view settled', timeout: 10_000 },
    )
    .toBe(0);
  const settled = await frames(page);
  await page.waitForTimeout(1000);
  expect(await frames(page)).toBe(settled);
}
