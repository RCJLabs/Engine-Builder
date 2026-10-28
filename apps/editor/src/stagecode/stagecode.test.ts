/**
 * A stage drawn in code (M7.4, D86, docs/specs/stages.md): the worker's run against a stand-in canvas
 * (start once, each frame at its pixel ratio, the uses' boxes, an SVG asked of the page, a stage that
 * throws stopped at its file and line), the player's input as gestures, the frame the page builds from
 * stage2d's walkers, and a use's box made a button 44 px across.
 */
import { transpileScript } from '@eb/script';
import { describe, expect, it } from 'vitest';
import { targetOf } from '../stage2d/uses.ts';
import type { StageInput } from './api.ts';
import { frameOf } from './frames.ts';
import { gestureOf, moved, type Pointer, pushInput } from './gestures.ts';
import type { FromStage, ToStage } from './protocol.ts';
import { createStageRunner } from './runner.ts';

const js = (source: string) => {
  const out = transpileScript(source);
  if (!out.ok) throw new Error(out.message);
  return out.js;
};

/** A canvas whose context writes down each call. */
function standIn() {
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      get:
        (_target, name: string) =>
        (...args: unknown[]) =>
          calls.push(`${name}(${args.join(',')})`),
    },
  );
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, calls };
}

const START = {
  space: 'deck',
  size: [176, 80] as const,
  world: { space: {}, prefabs: {}, records: {}, uses: {} },
  places: {},
  sheets: {},
};
const frame = (over: Record<string, unknown> = {}) =>
  ({ t: 0, dt: 0, w: 200, h: 100, dpr: 2, still: false, walkers: [], taken: [], input: [], ...over }) as never;

function run(files: Record<string, string>) {
  const sent: FromStage[] = [];
  const runner = createStageRunner(
    (m) => sent.push(m),
    () => 0,
  );
  const { canvas, calls } = standIn();
  const take = (m: ToStage) => runner.take(m);
  take({ kind: 'start', canvas: canvas as never, files, entry: 'battle', start: START as never });
  return { sent, calls, canvas, take };
}

const BATTLE = [
  "import { defineStage } from 'eb/stage';",
  'let seen = 0;',
  'export default defineStage({',
  '  start(s) { seen = s.size[0]; },',
  '  frame(g, f) {',
  '    g.fillRect(0, 0, f.w, f.h);',
  "    return f.t > 0 ? { uses: [{ object: 'alarm', box: [10, 20, 8, 8] }] } : undefined;",
  '  },',
  '});',
  'export const width = () => seen;',
].join('\n');

describe("a stage's run in its worker", () => {
  it('starts once, then draws each frame at its pixel ratio on a canvas sized to the box', () => {
    const { sent, calls, canvas, take } = run({ battle: js(BATTLE) });
    expect(sent).toEqual([{ kind: 'started' }]);
    take({ kind: 'frame', frame: frame() });
    expect([canvas.width, canvas.height]).toEqual([400, 200]);
    expect(calls).toEqual(['save()', 'setTransform(2,0,0,2,0,0)', 'fillRect(0,0,200,100)', 'restore()']);
    expect(sent[1]).toEqual({ kind: 'drew', ms: 0 });
    take({ kind: 'frame', frame: frame({ t: 1, w: 50, dpr: 1 }) });
    expect(canvas.width).toBe(50);
    expect(sent[2]).toEqual({ kind: 'drew', ms: 0, uses: [{ object: 'alarm', box: [10, 20, 8, 8] }] });
  });

  it('tells the page the tile a battle’s tap landed on, and nothing of one without a battle', () => {
    const stage = [
      "import { defineStage } from 'eb/stage';",
      'export default defineStage({ frame(g, f) {',
      "  const tap = f.input.find((e) => e.kind === 'tap');",
      '  return f.battle && tap ? { uses: [], picked: [Math.floor(tap.x / 16), Math.floor(tap.y / 16)] } : { uses: [] };',
      '} });',
    ].join('\n');
    const { sent, take } = run({ battle: js(stage) });
    const battle = { side: 'crew', round: 1, units: [], reach: [], targets: [], playing: false, inset: 0 };
    take({ kind: 'frame', frame: frame({ battle, input: [{ kind: 'tap', x: 50, y: 20 }] }) });
    expect(sent.at(-1)).toEqual({ kind: 'drew', ms: 0, uses: [], picked: [3, 1] });
    take({ kind: 'frame', frame: frame({ input: [{ kind: 'tap', x: 50, y: 20 }] }) });
    expect(sent.at(-1)).toEqual({ kind: 'drew', ms: 0, uses: [] });
  });

  it('asks the page to draw an SVG, and hands the stage the bitmap it sends back', async () => {
    const stage = [
      "import { defineStage, svg } from 'eb/stage';",
      'let got: unknown;',
      "export default defineStage({ start() { svg('<svg/>', 16, 8).then((b) => { got = b; }); }, frame() { return { uses: got ? [{ object: String(got), box: [0, 0, 1, 1] }] : [] }; } });",
    ].join('\n');
    const { sent, take } = run({ battle: js(stage) });
    expect(sent).toEqual([{ kind: 'svg', id: 1, text: '<svg/>', w: 16, h: 8 }, { kind: 'started' }]);
    take({ kind: 'svg', id: 1, image: 'bitmap' as never });
    await Promise.resolve();
    take({ kind: 'frame', frame: frame() });
    expect(sent.at(-1)).toMatchObject({ uses: [{ object: 'bitmap' }] });
  });

  it('stops a stage that throws, saying its file and line, and draws no more', () => {
    const boom = js("export default { frame() {\n  throw new Error('hull breach');\n} };");
    const { sent, calls, take } = run({ battle: boom });
    take({ kind: 'frame', frame: frame() });
    expect(sent.at(-1)).toEqual({ kind: 'failed', message: 'hull breach', file: 'stages/battle.ts', line: 2 });
    // The transform is put back even so, and a later frame draws nothing.
    expect(calls.at(-1)).toBe('restore()');
    take({ kind: 'frame', frame: frame() });
    expect(sent.map((m) => m.kind)).toEqual(['started', 'failed']);
  });

  it('says what is wrong with a stage that has no frame', () => {
    const { sent } = run({ battle: js('export const x = 1;') });
    expect(sent).toEqual([
      { kind: 'failed', message: 'stages/battle.ts has no stage: export default defineStage({ frame(g, f) { … } })' },
    ]);
  });
});

describe("the player's input", () => {
  const at = (x: number, y: number): Pointer => ({ x, y, from: [x, y], wandered: false });

  it('is a drag under one finger and a twist under two, turned and pinched', () => {
    expect(gestureOf([at(0, 0)], 1, at(5, -3), [1])).toEqual({ kind: 'drag', dx: 5, dy: -3 });
    const twist = gestureOf([at(0, 0), at(10, 0)], 2, at(0, 20), [1, 2]) as Extract<StageInput, { kind: 'twist' }>;
    expect(twist.angle).toBeCloseTo(Math.PI / 2);
    expect(twist.scale).toBeCloseTo(2);
    expect(gestureOf([at(0, 0), at(1, 1), at(2, 2)], 1, at(3, 3), [1, 2, 3])).toBeUndefined();
  });

  it('turns the short way round, past a half turn', () => {
    const twist = gestureOf([at(0, 0), at(-10, 1)], 2, at(-10, -1), [1, 2]) as Extract<StageInput, { kind: 'twist' }>;
    expect(twist.angle).toBeCloseTo(0.2, 1);
  });

  it('joins events of a kind in a row, so a frame’s list stays short', () => {
    const list: StageInput[] = [];
    pushInput(list, { kind: 'drag', dx: 1, dy: 2 });
    pushInput(list, { kind: 'drag', dx: 3, dy: -1 });
    pushInput(list, { kind: 'twist', angle: 0.5, scale: 2 });
    pushInput(list, { kind: 'twist', angle: 0.25, scale: 1.5 });
    pushInput(list, { kind: 'key', key: 'ArrowLeft', down: true });
    pushInput(list, { kind: 'wheel', dy: 10 });
    pushInput(list, { kind: 'wheel', dy: -4 });
    expect(list).toEqual([
      { kind: 'drag', dx: 4, dy: 1 },
      { kind: 'twist', angle: 0.75, scale: 3 },
      { kind: 'key', key: 'ArrowLeft', down: true },
      { kind: 'wheel', dy: 6 },
    ]);
  });

  it('is a tap only while a press stays within its slop', () => {
    expect(moved(at(0, 0), 5, 5).wandered).toBe(false);
    expect(moved(at(0, 0), 7, 7).wandered).toBe(true);
    expect(moved(moved(at(0, 0), 20, 0), 0, 0).wandered).toBe(true);
  });
});

describe('the frame the page builds', () => {
  it('gives the walkers as stage2d walks them, its times capped, its pixel ratio at most 2', () => {
    const made = frameOf({
      now: 2500,
      born: 500,
      sentAt: 1000,
      box: { w: 390, h: 300 },
      devicePixelRatio: 3,
      still: true,
      walkers: [
        { actor: 'ines', at: [40, 16], flip: true, moving: true },
        { actor: 'oren', at: [80, 16], flip: false, moving: false },
      ],
      world: { here: true, markers: [] },
      taken: new Set(['crate', 'alarm']),
      input: [{ kind: 'tap', x: 1, y: 2 }],
    });
    expect(made).toEqual({
      t: 2,
      dt: 0.1,
      w: 390,
      h: 300,
      dpr: 2,
      still: true,
      walkers: [
        { actor: 'ines', at: [40, 16], facing: -1, moving: true },
        { actor: 'oren', at: [80, 16], facing: 1, moving: false },
      ],
      world: { here: true, markers: [] },
      taken: ['alarm', 'crate'],
      input: [{ kind: 'tap', x: 1, y: 2 }],
    });
  });

  it('carries a battle as the page shows it, and no battle key without one', () => {
    const facts = { now: 0, born: 0, sentAt: 0, box: { w: 1, h: 1 }, devicePixelRatio: 1, still: false };
    const battle = { side: 'foes', round: 2, units: [], reach: [], targets: [], playing: true, inset: 120 } as const;
    const base = { ...facts, walkers: [], world: undefined, taken: [], input: [] };
    expect(frameOf({ ...base, battle }).battle).toEqual(battle);
    expect('battle' in frameOf(base)).toBe(false);
  });
});

describe("a use's box", () => {
  it('is its button, grown about its centre to 44 px each way', () => {
    expect(targetOf({ x: 100, y: 50, w: 8, h: 60 }, 1, 1)).toEqual({ x: 82, y: 50, w: 44, h: 60 });
  });
});
