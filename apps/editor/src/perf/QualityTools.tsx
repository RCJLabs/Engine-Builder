/**
 * Quality and Stats in the Scene panel's toolbar (M5.7, D69, docs/specs/performance.md): Auto or a
 * tier picked by hand, and the perf overlay shown or not, both kept per device.
 */
import { useUniqueId } from '../app/ids.ts';
import { chooseQuality, type Quality, quality, showStats, statsShown } from './state.ts';
import { TIER_NAMES, TIER_WORDS } from './tiers.ts';

const QUALITIES: readonly Quality[] = ['auto', ...TIER_NAMES];
const isQuality = (value: string): value is Quality => (QUALITIES as readonly string[]).includes(value);

export function QualityTools() {
  const id = useUniqueId();
  return (
    <>
      <span class="terrain-field">
        <label for={id}>Quality</label>
        <select
          id={id}
          class="field"
          value={quality.value}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (isQuality(value)) chooseQuality(value);
          }}
        >
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {q === 'auto' ? 'Auto' : TIER_WORDS[q]}
            </option>
          ))}
        </select>
      </span>
      <button type="button" class="button" aria-pressed={statsShown.value} onClick={() => showStats(!statsShown.value)}>
        Stats
      </button>
    </>
  );
}
