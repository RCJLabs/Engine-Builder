/**
 * What plays, as a plain function (M4.8, D58, docs/specs/audio.md#what-plays; chooser-of-the-dead's
 * mix.ts): the ambience and music the topmost screen on the stack names, and each layer's, sound's
 * and stem's level from the view's conditions. The player only follows it.
 */
import type { AudioPack, Buzz, Cue } from '../format/audio.ts';
import { BUZZ_NAMES } from '../format/audio.ts';
import type { Screen } from '../format/screen.ts';

export interface Mix {
  readonly ambience?: string;
  readonly music?: string;
  /**
   * 0 or 1 for each of the ambience's layers (`layer/<n>`) and sounds now and then (`then/<n>`),
   * and each stem's gain or 0 (`stem/<n>`).
   */
  readonly levels: Readonly<Record<string, number>>;
}

/** A condition holds only when the view says it does: unknown is off. */
const holds = (when: string | undefined, conditions: Readonly<Record<string, boolean | null>>) =>
  when === undefined || conditions[when] === true;

/** The mix for the screens on the stack, bottom to top, and the view's conditions. */
export function mixOf(
  stack: readonly Screen[],
  conditions: Readonly<Record<string, boolean | null>>,
  audio: AudioPack,
): Mix {
  const top = <K extends 'ambience' | 'music'>(key: K) => stack.findLast((screen) => screen[key] !== undefined)?.[key];
  const ambienceId = top('ambience');
  const musicId = top('music');
  const levels: Record<string, number> = {};
  const ambience = ambienceId === undefined ? undefined : audio.ambience[ambienceId];
  ambience?.layers.forEach((layer, n) => {
    levels[`layer/${n}`] = holds(layer.when, conditions) ? 1 : 0;
  });
  ambience?.['now-and-then']?.forEach((then, n) => {
    levels[`then/${n}`] = holds(then.when, conditions) ? 1 : 0;
  });
  const music = musicId === undefined ? undefined : audio.music[musicId];
  music?.stems.forEach((stem, n) => {
    levels[`stem/${n}`] = holds(stem.when, conditions) ? (stem.gain ?? 1) : 0;
  });
  return {
    ...(ambience !== undefined ? { ambience: ambienceId } : {}),
    ...(music !== undefined ? { music: musicId } : {}),
    levels,
  };
}

/** Every condition the audio reads, for the session to evaluate after each step. */
export function audioConditions(audio: AudioPack): string[] {
  const all = [
    ...Object.values(audio.ambience).flatMap((a) => [
      ...a.layers.map((l) => l.when),
      ...(a['now-and-then'] ?? []).map((t) => t.when),
    ]),
    ...Object.values(audio.music).flatMap((m) => m.stems.map((s) => s.when)),
  ];
  return [...new Set(all.filter((when): when is string => when !== undefined))].sort();
}

/** One buzz a step, the heaviest of the step's (landnam's haptics.ts). */
export function heaviest(cues: readonly Cue[]): Buzz | undefined {
  let best = -1;
  for (const cue of cues) if (cue.buzz !== undefined) best = Math.max(best, BUZZ_NAMES.indexOf(cue.buzz));
  return best < 0 ? undefined : BUZZ_NAMES[best];
}
