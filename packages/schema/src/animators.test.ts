/**
 * Animators' checks (M6.5, D77, docs/specs/animation.md#checks): a sound animator over a rigged
 * model's clips, and each check broken once: E083 (a clip the model lacks, a model off the rig),
 * E084 (states that don't fit together), E085 (an actor's animator on a model off the rig), W153
 * (a state nothing reaches), and conditions held to the anim.* facts rather than the game's.
 */
import { describe, expect, it } from 'vitest';
import type { AnimatorRecord } from './animatorTypes.ts';
import type { Diagnostic } from './diagnostics.ts';
import { type RecordInput, validateRecords } from './validate.ts';

const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[]) =>
  codes(
    validateRecords([], records, { kits: ['stats'], assets: new Set(['models/hero.glb', 'models/crate.glb']) })
      .diagnostics,
  );

const HERO = record('model', 'hero', {
  file: 'models/hero.glb',
  rig: { bones: { hips: 'mixamorig:Hips' } },
  clips: [
    { name: 'idle', length: 3 },
    { name: 'walk', length: 1.1, pace: 1.4 },
    { name: 'strike', length: 1 },
  ],
});
const CRATE = record('model', 'crate', { file: 'models/crate.glb' });

const SOUND: AnimatorRecord = {
  clips: 'hero',
  base: {
    start: 'idle',
    states: [
      { id: 'idle', clip: 'idle', loop: true },
      { id: 'walk', clip: 'walk', loop: true, rate: 'pace' },
    ],
    transitions: [
      { from: 'idle', to: 'walk', when: 'anim.speed > 0.2' },
      { from: 'walk', to: 'idle', when: 'anim.speed <= 0.2', blend: 0.3 },
    ],
  },
  upper: {
    start: 'none',
    states: [{ id: 'none' }, { id: 'strike', clip: 'strike', rate: 'fit' }],
    transitions: [
      { from: '*', to: 'strike', when: 'anim.swing == "strike"' },
      { from: 'strike', to: 'none' },
    ],
  },
};

const animator = (value: unknown) => record('animator', 'body', value);

describe('an animator', () => {
  it('passes over a rigged model’s clips, its conditions read as the anim.* facts', () => {
    expect(check([HERO, animator(SOUND)])).toEqual([]);
  });

  it('is E083 for a clip its model lacks, or a model off the rig', () => {
    const lacking = { ...SOUND, base: { ...SOUND.base, states: [{ id: 'idle', clip: 'sit' }, SOUND.base.states[1]] } };
    expect(check([HERO, animator(lacking)])).toEqual(['E083 body /base/states/0/clip']);
    const offRig = {
      ...SOUND,
      upper: { ...SOUND.upper, states: [{ id: 'none' }, { id: 'strike', clip: 'strike', from: 'crate' }] },
    };
    expect(check([HERO, CRATE, animator(offRig)])).toEqual(['E083 body /upper/states/1/clip']);
    // Off the rig, though its record lists the clip: still E083, the model can't play it.
    const listed = record('model', 'crate', { file: 'models/crate.glb', clips: [{ name: 'strike', length: 1 }] });
    expect(check([HERO, listed, animator(offRig)])).toEqual(['E083 body /upper/states/1/clip']);
  });

  it('is E084 for states that don’t fit together', () => {
    const broken = {
      clips: 'hero',
      base: {
        start: 'stand',
        states: [
          { id: 'idle', clip: 'idle' },
          { id: 'idle', clip: 'walk' },
          { id: 'bare' },
          { id: 'quick', clip: 'walk', rate: 'pace', speed: 2 },
        ],
        transitions: [
          { from: 'nowhere', to: 'idle', when: 'anim.grounded' },
          { from: 'idle', to: 'gone', when: 'anim.grounded' },
          { from: '*', to: 'quick' },
        ],
      },
    };
    expect(check([HERO, animator(broken)])).toEqual([
      'E084 body /base/start',
      'E084 body /base/states/1/id',
      'E084 body /base/states/2/clip',
      'W153 body /base/states/2/id',
      'E084 body /base/states/3/speed',
      'E084 body /base/transitions/0/from',
      'E084 body /base/transitions/1/to',
      'E084 body /base/transitions/2/when',
    ]);
  });

  it('is W153 for a state nothing reaches', () => {
    const stranded = { ...SOUND, base: { ...SOUND.base, transitions: [] } };
    expect(check([HERO, animator(stranded)])).toEqual(['W153 body /base/states/1/id']);
  });

  it('reads only the anim.* facts in its conditions', () => {
    const game = {
      ...SOUND,
      base: {
        ...SOUND.base,
        transitions: [
          { from: 'idle', to: 'walk', when: 'stats.current(actor: ana, stat: hp) > 0' },
          SOUND.base.transitions?.[1],
        ],
      },
    };
    expect(check([HERO, animator(game)])[0]).toMatch(/^E01\d body \/base\/transitions\/0\/when/);
    const word = {
      ...SOUND,
      upper: { ...SOUND.upper, transitions: [{ from: '*', to: 'strike', when: 'anim.swing == "swish"' }] },
    };
    expect(check([HERO, animator(word)])[0]).toMatch(/^E01\d body \/upper\/transitions\/0\/when/);
  });
});

describe('an actor’s animator', () => {
  it('is E085 on a model off the rig, and fine on a rigged one or the figure', () => {
    const actor = (model?: string) =>
      record('actor', 'ana', { stats: {}, animator: 'body', ...(model ? { model } : {}) });
    expect(check([HERO, CRATE, animator(SOUND), actor('crate')])).toEqual(['E085 ana /animator']);
    expect(check([HERO, CRATE, animator(SOUND), actor('hero')])).toEqual([]);
    expect(check([HERO, animator(SOUND), actor()])).toEqual([]);
  });
});
