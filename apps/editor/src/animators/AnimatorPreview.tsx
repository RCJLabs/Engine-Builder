/**
 * An animator tried above its form (M6.5, D77, docs/specs/animation.md#the-editor): the starter
 * character playing it on facts set here by hand, a slider for the speed and a switch or a choice
 * for each of the rest, as the walk would give them. The view is a chunk of its own, loaded with the
 * first animator opened, so a form without one carries no three. What each layer plays is written
 * beside it, read back from the mixer.
 */
import { DRAW_PHASES, SWING_PHASES, WEAPON_KINDS } from '@eb/schema';
import { useEffect, useState } from 'preact/hooks';
import { type AnimFacts, STILL } from '../anim/animator.ts';
import { useUniqueId } from '../app/ids.ts';
import type { OpenProject } from '../projects/opened.ts';
import type { AnimatorView as View } from './AnimatorView.tsx';
import '../styles/animators.css';

type Switch = 'grounded' | 'rising' | 'talking' | 'down' | 'hit';
const SWITCHES: readonly [Switch, string][] = [
  ['grounded', 'On the ground'],
  ['rising', 'Rising'],
  ['talking', 'Talking'],
  ['down', 'Down'],
  ['hit', 'Just hit'],
];
type Choice = 'swing' | 'draw' | 'weapon';
const CHOICES: readonly [Choice, string, readonly string[]][] = [
  ['swing', 'Swing', SWING_PHASES],
  ['draw', 'Bow', DRAW_PHASES],
  ['weapon', 'Weapon', WEAPON_KINDS],
];

let loaded: Promise<typeof View> | null = null;
const loadView = () => {
  loaded ??= import('./AnimatorView.tsx').then((m) => m.AnimatorView);
  return loaded;
};

export function AnimatorPreview({ project, value }: { project: OpenProject; value: unknown }) {
  const [facts, setFacts] = useState<AnimFacts>(STILL);
  const [view, setView] = useState<{ View: typeof View } | { failed: string } | null>(null);
  const speedId = useUniqueId();
  const ids = useUniqueId();
  useEffect(() => {
    let live = true;
    loadView().then(
      (View) => live && setView({ View }),
      (error: unknown) => live && setView({ failed: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      live = false;
    };
  }, []);
  const set = <K extends keyof AnimFacts>(key: K, to: AnimFacts[K]) => setFacts((now) => ({ ...now, [key]: to }));
  return (
    <section class="anim-preview" aria-label="Try it">
      <h4 class="behaviour-heading">Try it</h4>
      {view === null ? <p class="muted">Loading the preview…</p> : null}
      {view && 'failed' in view ? <p class="field-problem">The preview didn’t load: {view.failed}</p> : null}
      {view && 'View' in view ? <view.View project={project} value={value} facts={facts} /> : null}
      <fieldset class="anim-facts">
        <legend class="form-legend">Facts</legend>
        <div class="form-field">
          <label class="form-label" for={speedId}>
            Speed: {facts.speed.toFixed(1)} m/s
          </label>
          <input
            id={speedId}
            type="range"
            class="anim-speed"
            min={0}
            max={8}
            step={0.1}
            value={facts.speed}
            onInput={(event) => set('speed', Number(event.currentTarget.value))}
          />
        </div>
        <div class="anim-switches">
          {SWITCHES.map(([key, label]) => (
            <label key={key} class="anim-switch">
              <input
                type="checkbox"
                class="form-check"
                checked={facts[key]}
                onChange={(event) => set(key, event.currentTarget.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <div class="anim-choices">
          {CHOICES.map(([key, label, values]) => (
            <div key={key} class="form-field">
              <label class="form-label" for={`${ids}-${key}`}>
                {label}
              </label>
              <select
                id={`${ids}-${key}`}
                class="field form-select"
                value={facts[key]}
                onChange={(event) => set(key, event.currentTarget.value as never)}
              >
                {values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
