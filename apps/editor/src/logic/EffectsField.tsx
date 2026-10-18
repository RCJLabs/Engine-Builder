/**
 * A list of effects (M3.1, D36): a row's Do, or a roll outcome's. The engine's own effects each
 * get a form (set-flag, add-to-flag, roll, whose outcomes hold lists of their own); any other, the
 * game's own among them (M3.2), is edited as JSON. Each can be moved and taken out; adding one
 * picks its kind first.
 */
import type { Effect } from '@eb/core';
import { kitEffectFiles } from '@eb/schema';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { FieldNotes } from '../forms/FieldShell.tsx';
import { FieldView } from '../forms/FieldView.tsx';
import { pointerOf, useForm } from '../forms/formContext.ts';
import type { Path } from '../forms/values.ts';
import { openGame, openKits, ownEffectsOf } from '../scripts/known.ts';
import { FlagSelect, flagOf, OnOffSelect } from './choices.tsx';
import { JsonField } from './JsonField.tsx';
import { KitEffect, kitEffectFile, newKitEffect } from './KitEffect.tsx';
import { effectText } from './rowText.ts';
import { moved, NEW_EFFECTS, type NewEffect, newEffect, without } from './sheetEdits.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function EffectsField({ label, path, value }: { label: string; path: Path; value: unknown }) {
  const form = useForm();
  const effects = listOf(value);
  const id = useUniqueId();
  const problems = form.problemsAt(pointerOf(path));
  const change = (said: string, next: (list: unknown[]) => unknown[]) =>
    form.update(path, (now) => next(listOf(now)), said);
  return (
    <fieldset
      class="form-group logic-effects"
      data-at={pointerOf(path)}
      aria-describedby={problems.length > 0 ? `${id}-problems` : undefined}
    >
      <legend class="form-legend">{label}</legend>
      {effects.length === 0 ? <p class="muted">Nothing yet.</p> : null}
      {effects.length > 0 ? (
        <ol class="logic-effect-list">
          {effects.map((effect, i) => (
            // Keyed by place, an effect having no id of its own: moving one moves its values, and the boxes follow them.
            <li key={i} class="logic-effect">
              <EffectItem
                path={[...path, i]}
                value={effect}
                number={i + 1}
                up={i > 0 ? () => change(`Move effect ${i + 1} up`, (l) => moved(l, i, i - 1)) : undefined}
                down={
                  i < effects.length - 1
                    ? () => change(`Move effect ${i + 1} down`, (l) => moved(l, i, i + 1))
                    : undefined
                }
                remove={() => change(`Remove effect ${i + 1}`, (l) => without(l, i))}
              />
            </li>
          ))}
        </ol>
      ) : null}
      <AddEffect to={label} add={(effect, said) => change(`Add ${said}`, (l) => [...l, effect])} />
      <FieldNotes id={id} info={{}} shown={problems} />
    </fieldset>
  );
}

function EffectItem(props: {
  path: Path;
  value: unknown;
  number: number;
  up: (() => void) | undefined;
  down: (() => void) | undefined;
  remove: () => void;
}) {
  const { path, value, number, up, down, remove } = props;
  const form = useForm();
  const kind = isObject(value) ? value.effect : undefined;
  const kit = kitEffectFile(kind, openKits());
  const title = `${number}. ${effectText(value)}`;
  return (
    <div class="logic-effect-body" data-at={pointerOf(path)}>
      <div class="logic-effect-head">
        <span class="logic-effect-title">{title}</span>
        {form.canEdit ? (
          <div class="form-item-tools">
            <button type="button" class="button" disabled={!up} onClick={up} aria-label={`Move effect ${number} up`}>
              Up
            </button>
            <button
              type="button"
              class="button"
              disabled={!down}
              onClick={down}
              aria-label={`Move effect ${number} down`}
            >
              Down
            </button>
            <button type="button" class="button" onClick={remove} aria-label={`Remove effect ${number}`}>
              Remove
            </button>
          </div>
        ) : null}
      </div>
      {kind === 'set-flag' ? (
        <SetFlag path={path} value={value as Record<string, unknown>} />
      ) : kind === 'add-to-flag' ? (
        <>
          <FlagSelect path={[...path, 'flag']} value={(value as Record<string, unknown>).flag} label="Flag" />
          <FieldView
            label="By"
            def={{ kind: 'int' }}
            info={{ description: 'Below 0 takes away. The flag stays within its bounds.' }}
            path={[...path, 'by']}
            value={(value as Record<string, unknown>).by}
          />
        </>
      ) : kind === 'roll' ? (
        <Roll path={path} value={value as Record<string, unknown>} />
      ) : kit ? (
        <KitEffect file={kit} path={path} value={value as Record<string, unknown>} />
      ) : (
        <JsonField label="Effect" path={path} value={value} />
      )}
    </div>
  );
}

/** A flag and what to set it to: on or off for an on/off flag, a whole number for a number flag. */
function SetFlag({ path, value }: { path: Path; value: Record<string, unknown> }) {
  const flag = flagOf(value.flag);
  const number = flag?.number !== undefined || (flag === undefined && typeof value.to === 'number');
  return (
    <>
      <FlagSelect path={[...path, 'flag']} value={value.flag} label="Flag" />
      {number ? (
        <FieldView label="To" def={{ kind: 'int' }} info={{}} path={[...path, 'to']} value={value.to} />
      ) : (
        <OnOffSelect path={[...path, 'to']} value={value.to} label="To" />
      )}
    </>
  );
}

/** A roll's outcomes in order, each a whole-percent chance with the effects it applies (conditions.md). */
function Roll({ path, value }: { path: Path; value: Record<string, unknown> }) {
  const form = useForm();
  const outcomes = listOf(value.outcomes);
  const at = [...path, 'outcomes'];
  const total = outcomes.reduce<number>(
    (sum, o) => sum + (isObject(o) && typeof o.chance === 'number' ? o.chance : 0),
    0,
  );
  const change = (said: string, next: (list: unknown[]) => unknown[]) =>
    form.update(at, (now) => next(listOf(now)), said);
  return (
    <div class="logic-roll" data-at={pointerOf(at)}>
      <p class="form-help">{`Chances add up to ${total}${total === 100 ? '' : ', and must make 100'}.`}</p>
      {outcomes.map((outcome, k) => (
        // Keyed by place, as an outcome has no id of its own.
        <fieldset key={k} class="form-group" data-at={pointerOf([...at, k])}>
          <legend class="form-legend">{`Outcome ${k + 1}`}</legend>
          <FieldView
            label="Chance"
            def={{ kind: 'int', min: 1, max: 100 }}
            info={{ description: 'Whole percent' }}
            path={[...at, k, 'chance']}
            value={isObject(outcome) ? outcome.chance : undefined}
          />
          <FieldView
            label="Text"
            def={{ kind: 'text' }}
            info={{ optional: true, description: 'What the player is shown, like “The hull holds”' }}
            path={[...at, k, 'text']}
            value={isObject(outcome) ? outcome.text : undefined}
          />
          <EffectsField
            label={`Outcome ${k + 1} does`}
            path={[...at, k, 'effects']}
            value={isObject(outcome) ? outcome.effects : undefined}
          />
          {form.canEdit ? (
            <div class="form-actions">
              <button
                type="button"
                class="button"
                disabled={outcomes.length < 2}
                onClick={() => change(`Remove outcome ${k + 1}`, (l) => without(l, k))}
              >
                Remove outcome {k + 1}
              </button>
            </div>
          ) : null}
        </fieldset>
      ))}
      {form.canEdit ? (
        <div class="form-actions">
          <button
            type="button"
            class="button"
            onClick={() => change('Add an outcome', (l) => [...l, { chance: Math.max(1, 100 - total), effects: [] }])}
          >
            Add an outcome
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A select's value for one of the game's own effects, and for a kit's. */
const GAME_EFFECT = 'game:';
const KIT_EFFECT = 'kit:';

/** The kind of effect to add, then Add: a select alone would add on every arrow key in some browsers. */
function AddEffect({ to, add }: { to: string; add: (effect: Effect, said: string) => void }) {
  const form = useForm();
  const id = useUniqueId();
  const [kind, setKind] = useState('set-flag');
  if (!form.canEdit) return null;
  const engine = (Object.keys(NEW_EFFECTS) as NewEffect[]).filter((k) => k !== 'other');
  const kits = kitEffectFiles(openKits());
  const own = ownEffectsOf(openGame());
  const pick = () => {
    if (kind.startsWith(GAME_EFFECT)) {
      const name = kind.slice(GAME_EFFECT.length);
      return add({ effect: name }, name);
    }
    const kit = kitEffectFile(kind.slice(KIT_EFFECT.length), openKits());
    if (kind.startsWith(KIT_EFFECT) && kit) return add(newKitEffect(kit), kit.label.toLowerCase());
    const known = kind as NewEffect;
    add(newEffect(known), NEW_EFFECTS[known].label.toLowerCase());
  };
  return (
    <div class="form-actions logic-add-effect">
      <label class="visually-hidden" for={id}>
        {`Effect to add to ${to}`}
      </label>
      <select id={id} class="field form-select" value={kind} onChange={(e) => setKind(e.currentTarget.value)}>
        {engine.map((k) => (
          <option key={k} value={k}>
            {NEW_EFFECTS[k].label}
          </option>
        ))}
        {kits.map((file) => (
          <option key={file.effect} value={`${KIT_EFFECT}${file.effect}`}>
            {file.label}
          </option>
        ))}
        {own.map((name) => (
          <option key={name} value={`${GAME_EFFECT}${name}`}>
            {`${name} (this game’s)`}
          </option>
        ))}
        <option value="other">{NEW_EFFECTS.other.label}</option>
      </select>
      <button type="button" class="button" onClick={pick} aria-label={`Add effect to ${to}`}>
        Add effect
      </button>
    </div>
  );
}
