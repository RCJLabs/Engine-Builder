/**
 * Run an effect (M4.9, D59): the effects form content uses, over a list of the panel's own, checked
 * as a record's would be; Preview says what the game's preview() says of it now, and Run takes it
 * as one debug step. A list the game refuses stays, with the reason in the panel's status line.
 */
import type { Effect, EffectPreview } from '@eb/core';
import { useState } from 'preact/hooks';
import { LocalField } from '../../forms/LocalField.tsx';
import type { OpenProject } from '../../projects/opened.ts';
import { namesOf } from '../../records/names.ts';
import { debugBusy, debugPreviews, previewEffects, runEffects } from './tools.ts';
import { effectWords } from './words.ts';

const asEffects = (value: unknown): Effect[] =>
  Array.isArray(value) ? value.filter((e): e is Effect => typeof e === 'object' && e !== null && 'effect' in e) : [];

export function RunEffect({ project }: { project: OpenProject }) {
  const [value, setValue] = useState<unknown>([]);
  const effects = asEffects(value);
  const busy = debugBusy.value;
  const previews = debugPreviews.value;
  return (
    <div class="debug-body">
      <LocalField
        catalog={project.catalog}
        names={namesOf(project.index, project.catalog)}
        label="Effects to run"
        def={{ kind: 'effects' }}
        value={value}
        change={(next) => {
          debugPreviews.value = null;
          setValue(next);
        }}
      />
      <div class="form-actions">
        <button
          type="button"
          class="button"
          disabled={busy || effects.length === 0}
          onClick={() => void previewEffects(effects)}
        >
          Preview
        </button>
        <button
          type="button"
          class="button primary"
          disabled={busy || effects.length === 0}
          onClick={() => void runEffects(effects, `Ran ${effects.map(effectWords).join('; ')}.`)}
        >
          Run as a debug step
        </button>
      </div>
      {previews ? <Previews previews={previews} /> : null}
    </div>
  );
}

/** Each effect's preview, as the game's preview() gives it: the odds and costs the sim would roll. */
function Previews({ previews }: { previews: readonly EffectPreview[] }) {
  return (
    <ul class="debug-previews" aria-label="What they would do now">
      {previews.map((preview, i) => (
        // Previews come back in the order of the effects, which have no ids.
        <li key={i}>
          <code>{JSON.stringify(preview)}</code>
        </li>
      ))}
    </ul>
  );
}
