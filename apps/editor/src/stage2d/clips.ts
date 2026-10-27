/**
 * A sprite's clips played on the page's clock (M7.1, D83, docs/specs/2d-scenes.md#the-view): frame
 * `first + floor(t·fps + phase) mod n`, held at the last when the clip doesn't loop, and at the first
 * under reduced motion. The sim never hears of a frame. From afterglass (slice/people.js:143-147).
 */
import { defaultClipOf, type SpriteClip, type SpriteRecord } from '@eb/schema';

/** The frame a clip shows `t` seconds in, `phase` frames along. */
export function frameAt(clip: SpriteClip, t: number, phase = 0, still = false): number {
  const [first, last] = clip.frames;
  if (still) return first;
  const n = last - first + 1;
  const k = Math.floor(t * clip.fps + phase);
  return first + (clip.loop === false ? Math.min(Math.max(k, 0), n - 1) : ((k % n) + n) % n);
}

/** The clip a sprite plays: the one asked for when it has it, else its own. */
export function clipOf(sprite: SpriteRecord, wanted?: string): string | undefined {
  return wanted !== undefined && Object.hasOwn(sprite.clips, wanted) ? wanted : defaultClipOf(sprite);
}

/** Where frame `n` sits on its sheet: across and then down. */
export function frameBox(sprite: SpriteRecord, sheetWidth: number, n: number): { x: number; y: number } {
  const across = Math.max(1, Math.floor(sheetWidth / sprite.frame[0]));
  return { x: (n % across) * sprite.frame[0], y: Math.floor(n / across) * sprite.frame[1] };
}
