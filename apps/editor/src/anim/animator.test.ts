import type { AnimatorRecord } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import stock from '../../../../starter-character/records/animator/starter-character.json';
import model from '../../../../starter-character/records/model/starter-character.json';
import {
  type AnimFacts,
  type AnimRun,
  type ClipOf,
  compileAnimator,
  playedOf,
  STILL,
  startRun,
  stepAnimator,
} from './animator.ts';

const machine = compileAnimator(stock as AnimatorRecord);
const clips = new Map(model.clips.map((c) => [c.name, c as { length: number; pace?: number }]));
const clipOf: ClipOf = (from, name) => (from === 'starter-character' ? clips.get(name) : undefined);

/** `frames` frames of `dt` with the same facts. */
function run(facts: AnimFacts, frames: number, dt = 1 / 60, from: AnimRun = startRun(machine)): AnimRun {
  let at = from;
  for (let i = 0; i < frames; i++) at = stepAnimator(machine, at, facts, dt, clipOf);
  return at;
}

describe('the animator run', () => {
  it('starts in each layer’s start state and stays there while nothing holds', () => {
    const at = run(STILL, 30);
    expect(at.base?.state).toBe('idle');
    expect(at.upper?.state).toBe('none');
    expect(at.base?.time).toBeCloseTo(0.5, 6);
  });

  it('reads its transitions in order: down before run, run before walk', () => {
    expect(run({ ...STILL, speed: 3 }, 1).base?.state).toBe('run');
    expect(run({ ...STILL, speed: 1 }, 1).base?.state).toBe('walk');
    expect(run({ ...STILL, speed: 3, down: true }, 1).base?.state).toBe('down');
  });

  it('does nothing for the first transition that holds when it leads to the state playing', () => {
    // Past the walk's own fade from idle: anim.speed > 0.2 still holds, and no fade starts again.
    const walking = run({ ...STILL, speed: 1 }, 30);
    const later = run({ ...STILL, speed: 1 }, 6, 1 / 60, walking);
    expect(later.base?.state).toBe('walk');
    expect(later.base?.from).toBeNull();
    expect(later.base?.time).toBeGreaterThan(0);
  });

  it('cross-fades over the transition’s blend, the faded state going on at its rate', () => {
    const walking = run({ ...STILL, speed: 1.4 }, 60);
    const stopping = run(STILL, 6, 1 / 60, walking);
    expect(stopping.base?.state).toBe('idle');
    const played = playedOf(machine, 'base', stopping);
    expect(played.map((p) => p.clip)).toEqual(['idle', 'walk']);
    // The idle's blend is 0.3 s: five frames in, a sixth of the way.
    expect(played[0]?.weight).toBeCloseTo(5 / 60 / 0.3, 6);
    expect(played[1]?.weight).toBeCloseTo(1 - 5 / 60 / 0.3, 6);
    const done = run(STILL, 30, 1 / 60, stopping);
    expect(playedOf(machine, 'base', done)).toHaveLength(1);
    expect(done.base?.from).toBeNull();
  });

  it('plays a pace state at the speed over its clip’s pace', () => {
    const at = run({ ...STILL, speed: 2.1 }, 1);
    const later = run({ ...STILL, speed: 2.1 }, 30, 1 / 60, at);
    // 1.5 times the walk's 1.4 m/s: half a second of frames moves the clip 0.75 s, round its 1.1.
    expect(later.base?.time).toBeCloseTo(0.75, 6);
  });

  it('lays a fit state on its phase: the clip’s time is the phase’s share of it', () => {
    const swinging = { ...STILL, weapon: 'melee' as const, swing: 'windup' as const, phase: { length: 0.4, at: 0.1 } };
    const at = run(swinging, 1);
    expect(at.upper?.state).toBe('windup');
    expect(at.upper?.time).toBeCloseTo(0.25, 6);
    const later = run({ ...swinging, phase: { length: 0.4, at: 0.3 } }, 1, 1 / 60, at);
    expect(later.upper?.time).toBeCloseTo(0.75, 6);
    const struck = run({ ...swinging, swing: 'strike', phase: { length: 0.2, at: 0.2 } }, 1, 1 / 60, later);
    expect(struck.upper?.state).toBe('strike');
    expect(struck.upper?.time).toBeCloseTo(1, 6);
  });

  it('gives an upper state with no clip no weight: the upper body fades back to the base', () => {
    const swung = run({ ...STILL, swing: 'recover', phase: { length: 0.5, at: 0.4 } }, 1);
    const after = run(STILL, 3, 1 / 60, swung);
    expect(after.upper?.state).toBe('none');
    const played = playedOf(machine, 'upper', after);
    const clipped = played.filter((p) => p.clip !== null);
    expect(clipped.map((p) => p.clip)).toEqual(['recover']);
    // The none's blend is 0.25 s: two frames in, the recover keeps the rest of the weight.
    expect(clipped[0]?.weight).toBeCloseTo(1 - 2 / 60 / 0.25, 6);
  });

  it('takes a transition with no condition as its clip ends: a jump into the air', () => {
    const jumping = run({ ...STILL, rising: true, grounded: false }, 1);
    expect(jumping.base?.state).toBe('jump');
    // The jump is 0.3 s: still rising at 0.25 s, in the air past 0.3 s whatever the facts.
    expect(run({ ...STILL, rising: true, grounded: false }, 15, 1 / 60, jumping).base?.state).toBe('jump');
    expect(run({ ...STILL, rising: true, grounded: false }, 20, 1 / 60, jumping).base?.state).toBe('air');
  });

  it('flinches for its clip when hit, then gives way', () => {
    const hit = run({ ...STILL, hit: true }, 1);
    expect(hit.upper?.state).toBe('hit');
    expect(run({ ...STILL, hit: true }, 20, 1 / 60, hit).upper?.state).toBe('hit');
    expect(run(STILL, 25, 1 / 60, hit).upper?.state).toBe('none');
  });

  it('loops a looping clip round its length', () => {
    const at = run(STILL, 200);
    expect(at.base?.time).toBeCloseTo((200 / 60) % 3, 6);
  });
});
