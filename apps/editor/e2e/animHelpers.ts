/**
 * What M6.5's specs read of the walk's animation (D77, docs/specs/animation.md#the-gate): every frame
 * of a stretch recorded inside the page, so a state a few frames long isn't missed between two
 * round trips; and a clip's progress over the ground walked, which a pace rate holds to its pace.
 */
import { expect, type Page } from '@playwright/test';
import type { AnimSeen } from '../src/walk/anims.ts';
import type { WalkHook } from '../src/walk/hook.ts';

export interface Frame {
  readonly t: number;
  readonly anims: readonly AnimSeen[];
  readonly feet: readonly number[];
  readonly yaw: number;
  readonly grounded: boolean;
  readonly swing: string | null;
  /** Hits the hero sent so far. */
  readonly hits: number;
  /** NPCs fallen so far. */
  readonly fallen: readonly string[];
}

/** Every frame from now until stopRecording, read as each is drawn. */
export function startRecording(page: Page): Promise<void> {
  return page.evaluate(() => {
    const into: Frame[] = [];
    const held = window as unknown as { __ebWalk?: WalkHook; __animFrames?: Frame[]; __animStop?: boolean };
    held.__animFrames = into;
    held.__animStop = false;
    const one = () => {
      const walk = held.__ebWalk;
      if (walk) {
        const me = walk.character();
        const fight = walk.fight();
        into.push({
          t: performance.now(),
          anims: walk.anims(),
          feet: me.feet,
          yaw: me.yaw,
          grounded: me.grounded,
          swing: fight?.swing ?? null,
          hits: fight?.sent.filter((s) => s.action.type === 'fighting/hit' && s.action.by === 'hero').length ?? 0,
          fallen: fight?.npcs.filter((n) => n.down).map((n) => n.actor) ?? [],
        });
      }
      if (!held.__animStop) requestAnimationFrame(one);
    };
    requestAnimationFrame(one);
  });
}

export function stopRecording(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const held = window as unknown as { __animFrames?: Frame[]; __animStop?: boolean };
    held.__animStop = true;
    return held.__animFrames ?? [];
  });
}

/** Every frame for `ms`. */
export async function record(page: Page, ms: number): Promise<Frame[]> {
  await startRecording(page);
  await page.waitForTimeout(ms);
  return stopRecording(page);
}

export const bodyOf = (frame: Frame, key: string) => frame.anims.find((a) => a.key === key);
export const baseOf = (frame: Frame, key: string) => bodyOf(frame, key)?.layers.base[0];
export const upperOf = (frame: Frame, key: string) => bodyOf(frame, key)?.layers.upper[0];

/**
 * Seconds of `state`'s clip played a metre walked, over the frames it plays in: each step's clip
 * time unwrapped round its `length`.
 */
export function clipPerMetre(frames: readonly Frame[], key: string, state: string, length: number) {
  let clip = 0;
  let metres = 0;
  for (let i = 1; i < frames.length; i++) {
    const [a, b] = [frames[i - 1] as Frame, frames[i] as Frame];
    const [was, now] = [baseOf(a, key), baseOf(b, key)];
    if (was?.state !== state || now?.state !== state) continue;
    clip += (now.time - was.time + length) % length;
    metres += Math.hypot((b.feet[0] as number) - (a.feet[0] as number), (b.feet[2] as number) - (a.feet[2] as number));
  }
  return { clip, metres, perMetre: metres > 0 ? clip / metres : Number.NaN };
}

/** The right hand in the player's own frame: how far in front of their feet, and how high. */
export function handOf(frame: Frame, key = '@player'): { forward: number; up: number } | null {
  const hand = bodyOf(frame, key)?.bones.rightHand;
  if (!hand) return null;
  const yaw = (frame.yaw * Math.PI) / 180;
  const dx = (hand[0] as number) - (frame.feet[0] as number);
  const dz = (hand[2] as number) - (frame.feet[2] as number);
  // Yaw 0 looks along −z, more yaw to the left.
  return { forward: -Math.sin(yaw) * dx - Math.cos(yaw) * dz, up: (hand[1] as number) - (frame.feet[1] as number) };
}

export const PLAYER = '@player';
/** The starter character's walk and run: their lengths and paces (starter-character/records/model). */
export const WALK = { length: 1.1, pace: 1.4 };
export const RUN = { length: 0.7, pace: 4 };

/** Every body drawn as the starter character, standing in its idle on the legs and the upper body both. */
export function expectIdle(frames: readonly Frame[], keys: readonly string[]): void {
  const last = frames.at(-1) as Frame;
  expect(last.anims.map((a) => a.key).sort()).toEqual([...keys].sort());
  for (const key of keys) {
    expect(baseOf(last, key)?.state, key).toBe('idle');
    expect(upperOf(last, key)?.state, key).toBe('none');
    const body = bodyOf(last, key);
    expect(body?.playing.map((p) => `${p.clip}|${p.role}`).sort(), key).toEqual(['idle|lower', 'idle|upper']);
    const head = body?.bones.head[1] ?? 0;
    const foot = Math.min(body?.bones.leftFoot[1] ?? 0, body?.bones.rightFoot[1] ?? 0);
    expect(head - foot, key).toBeGreaterThan(1.3);
  }
}

/** The walk's and the run's clips at the speed over their paces, to 10%, over the ground walked. */
export function expectPaces(walking: readonly Frame[], running: readonly Frame[]): void {
  const walk = clipPerMetre(walking, PLAYER, 'walk', WALK.length);
  const run = clipPerMetre(running, PLAYER, 'run', RUN.length);
  console.info(
    `walk: ${walk.clip.toFixed(2)} s over ${walk.metres.toFixed(2)} m; run: ${run.clip.toFixed(2)} s over ${run.metres.toFixed(2)} m`,
  );
  expect(walk.metres).toBeGreaterThan(1);
  expect(run.metres).toBeGreaterThan(1);
  expect(Math.abs(walk.perMetre * WALK.pace - 1)).toBeLessThan(0.1);
  expect(Math.abs(run.perMetre * RUN.pace - 1)).toBeLessThan(0.1);
}

/** Off the ground in the jump or the air, the air among them, and standing again after. */
export function expectJump(frames: readonly Frame[]): void {
  const aloft = frames.filter((f) => !f.grounded).map((f) => baseOf(f, PLAYER)?.state);
  expect(aloft.length).toBeGreaterThan(0);
  expect(aloft).toContain('air');
  expect(aloft.filter((s) => s !== 'jump' && s !== 'air')).toEqual([]);
  expect(baseOf(frames.at(-1) as Frame, PLAYER)?.state).toBe('idle');
}

/**
 * Each swing's last wind-up frame and the first recover frame after it, kept where they were drawn
 * near the wound and struck poses: the swing's clips are a second long, so a fit state's time is how
 * far through its phase it is. At a few frames a second, a frame early in the wind-up and one late
 * in the recover both stand near the standing pose.
 */
export function swingsIn(frames: readonly Frame[]): { wound: Frame; struck: Frame }[] {
  const found: { wound: Frame; struck: Frame }[] = [];
  let wound: Frame | null = null;
  for (const frame of frames) {
    if (frame.swing === 'windup') wound = frame;
    else if (frame.swing === 'recover' && wound) {
      const near = (upperOf(wound, PLAYER)?.time ?? 0) >= 0.6 && (upperOf(frame, PLAYER)?.time ?? 1) <= 0.4;
      if (near) found.push({ wound, struck: frame });
      wound = null;
    }
  }
  return found;
}

/**
 * The upper layer on the swing's phases frame by frame; the strike playing as each hit is sent, or
 * fading into the recover the same frame began; the sword hand down and forward over each swing.
 */
export function expectSwings(frames: readonly Frame[]): void {
  const swung = frames.filter((f) => f.swing !== null);
  expect(swung.length).toBeGreaterThan(0);
  expect(
    swung.filter((f) => upperOf(f, PLAYER)?.state !== f.swing).map((f) => [f.swing, upperOf(f, PLAYER)?.state]),
  ).toEqual([]);
  const sending = frames.filter((f, i) => i > 0 && f.hits > (frames[i - 1] as Frame).hits);
  expect(sending.length).toBeGreaterThan(0);
  for (const f of sending) expect(bodyOf(f, PLAYER)?.layers.upper.map((p) => p.state)).toContain('strike');
  const swings = swingsIn(frames);
  expect(swings.length).toBeGreaterThan(0);
  for (const { wound, struck } of swings) {
    const [a, b] = [handOf(wound), handOf(struck)];
    expect(a && b ? a.up - b.up : 0).toBeGreaterThan(0.3);
    expect(a && b ? b.forward - a.forward : 0).toBeGreaterThan(0.3);
  }
}

/** A felled bandit lying down: its base layer down, its head near the ground. */
export function expectDown(frames: readonly Frame[], felled: string): void {
  const last = frames.at(-1) as Frame;
  expect(baseOf(last, felled)?.state).toBe('down');
  expect(bodyOf(last, felled)?.bones.head[1] ?? 9).toBeLessThan(0.7);
}
