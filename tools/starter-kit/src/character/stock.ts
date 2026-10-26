/**
 * The engine's stock animator (M6.5, D77, docs/specs/animation.md#animators): what every actor
 * plays when it names none, over the starter character's clips. On the whole body: standing,
 * walking, running, jumping, in the air, talking and down, checked in that order of need, the
 * first that holds deciding. On the upper body: a swing's three phases and a bow's, fit to the
 * stage's phases, and a flinch when hit; with none of them, it gives way to the legs.
 */
import type { AnimatorRecord } from '@eb/schema';

export const STOCK_ANIMATOR: AnimatorRecord = {
  name: 'Starter character',
  clips: 'starter-character',
  base: {
    start: 'idle',
    states: [
      { id: 'idle', clip: 'idle', loop: true },
      { id: 'walk', clip: 'walk', loop: true, rate: 'pace' },
      { id: 'run', clip: 'run', loop: true, rate: 'pace' },
      { id: 'jump', clip: 'jump' },
      { id: 'air', clip: 'fall', loop: true },
      { id: 'talk', clip: 'talk', loop: true },
      { id: 'down', clip: 'fall-down' },
    ],
    // A jump starts only from the ground and plays out while rising; the air is for falling; the
    // ground's own states wait for the ground, so a fast jump doesn't cut to a run.
    transitions: [
      { from: '*', to: 'down', when: 'anim.down', blend: 0.25 },
      { from: 'jump', to: 'air' },
      ...['idle', 'walk', 'run', 'talk'].map((from) => ({ from, to: 'jump', when: 'anim.rising', blend: 0.1 })),
      { from: '*', to: 'air', when: 'not anim.grounded and not anim.rising', blend: 0.2 },
      { from: '*', to: 'talk', when: 'anim.grounded and anim.talking', blend: 0.3 },
      { from: '*', to: 'run', when: 'anim.grounded and anim.speed > 2.5' },
      { from: '*', to: 'walk', when: 'anim.grounded and anim.speed > 0.2' },
      { from: '*', to: 'idle', when: 'anim.grounded and anim.speed <= 0.2', blend: 0.3 },
    ],
  },
  upper: {
    start: 'none',
    states: [
      { id: 'none' },
      { id: 'windup', clip: 'windup', rate: 'fit' },
      { id: 'strike', clip: 'strike', rate: 'fit' },
      { id: 'recover', clip: 'recover', rate: 'fit' },
      { id: 'draw', clip: 'draw', rate: 'fit' },
      { id: 'hold', clip: 'hold', loop: true },
      { id: 'loose', clip: 'loose', rate: 'fit' },
      { id: 'hit', clip: 'hit' },
    ],
    transitions: [
      { from: '*', to: 'windup', when: 'anim.swing == "windup"', blend: 0.1 },
      { from: '*', to: 'strike', when: 'anim.swing == "strike"', blend: 0.05 },
      { from: '*', to: 'recover', when: 'anim.swing == "recover"', blend: 0.05 },
      { from: '*', to: 'draw', when: 'anim.draw == "draw"', blend: 0.1 },
      { from: '*', to: 'hold', when: 'anim.draw == "hold"', blend: 0.1 },
      { from: '*', to: 'loose', when: 'anim.draw == "loose"', blend: 0.05 },
      { from: 'hit', to: 'none' },
      { from: '*', to: 'hit', when: 'anim.hit', blend: 0.05 },
      { from: '*', to: 'none', when: 'not anim.hit', blend: 0.25 },
    ],
  },
};
