/**
 * The engine's animator type (M6.5, D77, docs/specs/animation.md#animators): a state machine in two
 * layers, the whole body and the upper body, each a list of states playing clips and transitions
 * between them on conditions over the stage's `anim.*` facts. The stage runs it each frame; nothing
 * of it is in the sim. Its checks: E083 (a clip a rigged model doesn't have), E084 (states that
 * don't fit together), E085 (an actor's animator on a model not on the rig) and W153 (a state no
 * transition reaches).
 */
import type { FactCatalog } from '@eb/core';
import type { Report } from './checkValue.ts';
import { MODEL } from './modelTypes.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';
import { type DataType, typeFromFile } from './typeSchema.ts';

export const ANIMATOR = 'animator';
export const LAYERS = ['base', 'upper'] as const;
export type Layer = (typeof LAYERS)[number];
export const RATES = ['fixed', 'pace', 'fit'] as const;
export type Rate = (typeof RATES)[number];
/** A transition from any state. */
export const ANY = '*';

export interface AnimState {
  readonly id: string;
  /** The clip's name in its model; left out on the upper layer, the layer gives way to the base. */
  readonly clip?: string;
  /** The model it is from, when not the animator's own `clips`. */
  readonly from?: string;
  readonly loop?: boolean;
  /** Fixed (`speed`, 1 left out), by pace (the speed moved over the clip's), or fit to a phase. */
  readonly rate?: Rate;
  readonly speed?: number;
}

export interface AnimTransition {
  readonly from: string;
  readonly to: string;
  /** Condition text over `anim.*`; left out, the transition comes as `from`'s clip ends. */
  readonly when?: string;
  /** Seconds to cross-fade: 0.2 left out. */
  readonly blend?: number;
}

export interface AnimLayer {
  readonly start: string;
  readonly states: readonly AnimState[];
  readonly transitions?: readonly AnimTransition[];
}

export interface AnimatorRecord {
  readonly name?: string;
  /** The model whose clips its states play. */
  readonly clips: string;
  readonly base: AnimLayer;
  readonly upper?: AnimLayer;
}

export const BLEND = 0.2;
export const SWING_PHASES = ['none', 'windup', 'strike', 'recover'] as const;
export const DRAW_PHASES = ['none', 'draw', 'hold', 'loose'] as const;
export const WEAPON_KINDS = ['none', 'melee', 'ranged'] as const;

/** What an animator's conditions read: the stage's, worked out for each body every frame. */
export const ANIM_FACTS: FactCatalog = {
  'anim.speed': { domain: { type: 'number', min: 0, max: 20 }, label: 'speed across the ground' },
  'anim.grounded': { domain: { type: 'bool' }, label: 'standing on something' },
  'anim.rising': { domain: { type: 'bool' }, label: 'moving up' },
  'anim.swing': { domain: { type: 'enum', values: [...SWING_PHASES] }, label: 'swing' },
  'anim.draw': { domain: { type: 'enum', values: [...DRAW_PHASES] }, label: 'bow' },
  'anim.weapon': { domain: { type: 'enum', values: [...WEAPON_KINDS] }, label: 'weapon' },
  'anim.down': { domain: { type: 'bool' }, label: 'fallen' },
  'anim.talking': { domain: { type: 'bool' }, label: 'talking' },
  'anim.hit': { domain: { type: 'bool' }, label: 'just hit' },
};

const layer = (label: string, description: string): FieldDef => ({
  kind: 'group',
  label,
  description,
  fields: {
    start: { kind: 'text', min: 1, label: 'Starts in', description: 'The state it plays first' },
    states: {
      kind: 'list',
      min: 1,
      label: 'States',
      of: {
        kind: 'group',
        fields: {
          id: { kind: 'text', min: 1, label: 'State' },
          clip: { kind: 'text', min: 1, optional: true, label: 'Clip', description: 'Its name in the model' },
          from: { kind: 'ref', to: MODEL, optional: true, label: 'From', description: 'Another model’s clips' },
          loop: { kind: 'bool', optional: true, label: 'Loops' },
          rate: {
            kind: 'enum',
            values: [...RATES],
            optional: true,
            label: 'Rate',
            description: 'Fixed at its speed, by the pace moved, or fit to a swing’s phase',
          },
          speed: { kind: 'number', min: 0.05, max: 10, optional: true, label: 'Speed', description: '1 left out' },
        },
      },
    },
    transitions: {
      kind: 'list',
      optional: true,
      label: 'Transitions',
      of: {
        kind: 'group',
        fields: {
          from: { kind: 'text', min: 1, label: 'From', description: 'A state, or * for any' },
          to: { kind: 'text', min: 1, label: 'To' },
          when: { kind: 'condition', optional: true, label: 'When', description: 'Left out: as its clip ends' },
          blend: {
            kind: 'number',
            min: 0,
            max: 5,
            optional: true,
            label: 'Blend',
            description: `Seconds, ${BLEND} left out`,
          },
        },
      },
    },
  },
});

export const ANIMATOR_TYPE_FILE: TypeFile = {
  title: 'Animator',
  description:
    'How a body moves: states playing clips, and when it goes from one to the next (docs/specs/animation.md).',
  nameField: 'name',
  fields: {
    name: { kind: 'text', optional: true, label: 'Name' },
    clips: { kind: 'ref', to: MODEL, label: 'Clips from', description: 'The rigged model whose clips its states play' },
    base: layer('Whole body', 'Standing, walking, running, in the air, down'),
    upper: { ...layer('Upper body', 'Swings and shots over the legs: a state with no clip gives way'), optional: true },
  },
};

export const ANIMATOR_DATA: DataType = typeFromFile(ANIMATOR, ANIMATOR_TYPE_FILE);

/** An animator's states that don't fit together (E084), and a state no transition reaches (W153). */
export function checkAnimator(record: AnimatorRecord, report: Report): void {
  for (const name of LAYERS) {
    const at = record[name];
    if (at) checkLayer(at, name, report);
  }
}

function checkLayer(at: AnimLayer, name: Layer, report: Report): void {
  const ids = new Set<string>();
  at.states.forEach((state, i) => {
    if (ids.has(state.id)) report('E084', `/${name}/states/${i}/id`, `There is already a state "${state.id}"`);
    ids.add(state.id);
    if (name === 'base' && state.clip === undefined)
      report('E084', `/${name}/states/${i}/clip`, 'A whole-body state plays a clip: only the upper body gives way');
    if (state.speed !== undefined && state.rate !== undefined && state.rate !== 'fixed')
      report('E084', `/${name}/states/${i}/speed`, `A speed goes with a fixed rate, not ${state.rate}`);
  });
  if (!ids.has(at.start)) report('E084', `/${name}/start`, `There is no state "${at.start}" to start in`);
  const reached = new Set([at.start]);
  (at.transitions ?? []).forEach((step, i) => {
    if (step.from !== ANY && !ids.has(step.from))
      report('E084', `/${name}/transitions/${i}/from`, `There is no state "${step.from}"`);
    if (!ids.has(step.to)) report('E084', `/${name}/transitions/${i}/to`, `There is no state "${step.to}"`);
    else reached.add(step.to);
    if (step.from === ANY && step.when === undefined)
      report(
        'E084',
        `/${name}/transitions/${i}/when`,
        'A transition from any state needs a condition: no one clip ends it',
      );
  });
  at.states.forEach((state, i) => {
    if (!reached.has(state.id))
      report(
        'W153',
        `/${name}/states/${i}/id`,
        `No transition goes to "${state.id}", and it isn't where the layer starts`,
      );
  });
}

/** What a model record says of its rig and clips, for E083 and E085. */
export interface RiggedModel {
  readonly rigged: boolean;
  readonly clips: readonly string[];
}

/** Each state's clip held to its model's (E083): `modelOf` reads a model record by its id. */
export function checkAnimatorClips(
  record: AnimatorRecord,
  modelOf: (id: string) => RiggedModel | undefined,
  report: Report,
): void {
  for (const name of LAYERS) {
    record[name]?.states.forEach((state, i) => {
      if (state.clip === undefined) return;
      const id = state.from ?? record.clips;
      const model = modelOf(id);
      // A model that isn't there is E005's.
      if (!model) return;
      const path = `/${name}/states/${i}/clip`;
      if (!model.rigged) report('E083', path, `The model "${id}" isn't on the rig, so it plays no clips`);
      else if (!model.clips.includes(state.clip))
        report(
          'E083',
          path,
          `The model "${id}" has no clip "${state.clip}": it has ${model.clips.join(', ') || 'none'}`,
        );
    });
  }
}

/** An actor's animator on a model not on the rig (E085). */
export function checkActorAnimator(
  actor: { readonly model?: unknown; readonly animator?: unknown },
  modelOf: (id: string) => RiggedModel | undefined,
  report: Report,
): void {
  if (typeof actor.animator !== 'string' || typeof actor.model !== 'string') return;
  const model = modelOf(actor.model);
  if (model && !model.rigged)
    report('E085', '/animator', `Its model "${actor.model}" isn't on the rig, so no animator can move it`);
}
