/**
 * The Play worker's debug tools on the hut (M4.9, D59), as the worker runs them, in Node: the run
 * recorded as the shell plays, a debug step marked and counted, steps back and forward, a state
 * kept and restored, each quest's why, and Replay on an edited project stopping where it parts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { SaveFile } from '@eb/core';
import { describe, expect, it } from 'vitest';
import type { SentFile } from '../../scripts/protocol.ts';
import { playJobs } from '../jobs.ts';
import type { PlayPageReply } from '../protocol.ts';
import type { DebugLook } from './protocol.ts';

const HUT = resolve(import.meta.dirname, '../../../../../tools/cli/test/fixtures/hut');

function hut(change: Record<string, unknown> = {}): SentFile[] {
  return readdirSync(HUT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = relative(HUT, join(entry.parentPath, entry.name)).split('\\').join('/');
      const text = path in change ? JSON.stringify(change[path]) : undefined;
      const bytes = text === undefined ? readFileSync(join(HUT, path)) : new TextEncoder().encode(text);
      return [path, new Uint8Array(bytes)] as SentFile;
    });
}

/** The loads quest done after one load: what a designer might try, and Replay should catch. */
function oneLoad() {
  const quest = JSON.parse(readFileSync(join(HUT, 'records/quest/loads.json'), 'utf8'));
  quest.stages[0].objectives[0].count.to = 1;
  return { 'records/quest/loads.json': quest };
}

async function started() {
  const jobs = playJobs();
  let id = 0;
  const send = async (request: Record<string, unknown>) =>
    (await jobs({ id: id++, ...request } as never)) as PlayPageReply;
  await send({ kind: 'open-files', files: hut() });
  await send({ kind: 'start', seed: '1', saving: { edition: 'playtest' }, at: 1 });
  return send;
}

function lookOf(reply: PlayPageReply): DebugLook {
  if (!('look' in reply)) throw new Error(JSON.stringify(reply));
  return reply.look;
}

const quest = (look: DebugLook, id: string) => look.quests.find((q) => q.quest === id);

describe('the debug tools on the hut', () => {
  it('records the shell’s steps, and reads the state, the quests and the date', async () => {
    const send = await started();
    await send({ kind: 'act', action: { type: 'hut/carry' }, at: 2 });
    await send({ kind: 'act', action: { type: 'hut/rest' }, at: 3 });
    const look = lookOf(await send({ kind: 'debug-look' }));
    expect(look).toMatchObject({ cursor: 2, recorded: 2, full: false, earlier: 0, debugSteps: 0 });
    expect(look.log.map((line) => [line.n, line.label, line.debug, line.ahead])).toEqual([
      [1, 'Carry', false, false],
      [2, 'Rest', false, false],
    ]);
    expect(look.log[0]?.beats).toContain('hut/carried');
    expect(look.time).toMatchObject({ day: 2, tick: 2 });
    expect(look.slices.map((slice) => slice.key)).toEqual(
      expect.arrayContaining(['debug', 'kernel', 'quests', 'time']),
    );
    expect(JSON.parse(look.slices.find((s) => s.key === 'debug')?.json ?? '')).toEqual({ steps: 0 });
    expect(quest(look, 'loads')).toMatchObject({
      state: 'active',
      stage: 'carry',
      stages: ['carry', 'thanked'],
      why: [{ text: 'Carry five loads up: 1 of 5' }, { text: '7 days left before it fails' }],
    });
    expect(quest(look, 'guiding')?.state).toBe('waiting');
    // A done-when in words, with its truth now: no rope bought yet.
    expect(quest(look, 'supplies')?.why).toEqual([
      { text: 'Buy a rope: when carried (rope) is at least 1', holds: false },
    ]);
  });

  it('runs effects as a debug step, marked and counted; a bad one is refused and changes nothing', async () => {
    const send = await started();
    const ran = await send({ kind: 'debug-run', effects: [{ effect: 'wait', days: 1 }], at: 2 });
    if (ran.kind !== 'debug-moved') throw new Error(JSON.stringify(ran));
    expect(ran.look.log.at(-1)).toMatchObject({ n: 1, label: 'Debug: wait days=1', debug: true });
    expect(ran.look).toMatchObject({ cursor: 1, debugSteps: 1, time: { day: 1 } });
    expect(ran.view.turn).toBe(1);
    expect(ran.save).toMatchObject({ edition: 'playtest', summary: { turn: 1, debug: 1 } });

    const bad = await send({ kind: 'debug-run', effects: [{ effect: 'no-such' }], at: 3 });
    expect(bad).toMatchObject({ kind: 'debug-refused', reason: expect.stringMatching(/Unknown effect "no-such"/) });
    expect(lookOf(bad)).toMatchObject({ cursor: 1, debugSteps: 1 });
    expect(lookOf(bad).log.at(-1)).toMatchObject({ n: 2, refused: expect.stringMatching(/no-such/), debug: true });
    // Taking more coins than the purse holds is the kit's own refusal.
    const poor = await send({
      kind: 'debug-run',
      effects: [{ effect: 'add-resource', resource: 'coins', by: -999 }],
      at: 4,
    });
    expect(poor.kind).toBe('debug-refused');

    const staged = await send({
      kind: 'debug-run',
      effects: [{ effect: 'set-stage', quest: 'loads', stage: 'thanked' }],
      at: 5,
    });
    expect(quest(lookOf(staged), 'loads')).toMatchObject({ state: 'done', stage: 'thanked' });
  });

  it('steps back by playing the run again, and forward along it; a new step drops what was ahead', async () => {
    const send = await started();
    for (const type of ['hut/carry', 'hut/rest']) await send({ kind: 'act', action: { type }, at: 2 });
    await send({ kind: 'debug-run', effects: [{ effect: 'wait', days: 1 }], at: 3 });
    const back = await send({ kind: 'debug-back', at: 4 });
    if (back.kind !== 'debug-moved') throw new Error(JSON.stringify(back));
    expect(back.look).toMatchObject({ cursor: 2, recorded: 3, debugSteps: 0, time: { day: 2 } });
    expect(back.look.log.map((line) => line.ahead)).toEqual([false, false, true]);
    expect(back.save.summary).toEqual({ turn: 2, line: 'Day 2 · 30 coins' });

    const forward = await send({ kind: 'debug-forward', at: 5 });
    expect(lookOf(forward)).toMatchObject({ cursor: 3, recorded: 3, debugSteps: 1, time: { day: 3 } });
    expect(await send({ kind: 'debug-forward', at: 6 })).toMatchObject({ kind: 'debug-refused' });

    await send({ kind: 'debug-back', at: 7 });
    await send({ kind: 'debug-back', at: 8 });
    // Forward from two back takes one step again and keeps the other ahead.
    expect(lookOf(await send({ kind: 'debug-forward', at: 8 }))).toMatchObject({ cursor: 2, recorded: 3 });
    await send({ kind: 'debug-back', at: 8 });
    await send({ kind: 'act', action: { type: 'hut/carry' }, at: 9 });
    const look = lookOf(await send({ kind: 'debug-look' }));
    expect(look).toMatchObject({ cursor: 2, recorded: 2 });
    expect(look.log.map((line) => line.label)).toEqual(['Carry', 'Carry']);
    for (let i = 0; i < 2; i++) await send({ kind: 'debug-back', at: 10 });
    expect(await send({ kind: 'debug-back', at: 11 })).toMatchObject({ kind: 'debug-refused' });
  });

  it('keeps a state as a save of its own edition, and restores it with its steps to step back through', async () => {
    const send = await started();
    for (const type of ['hut/carry', 'hut/carry']) await send({ kind: 'act', action: { type }, at: 2 });
    const kept = await send({ kind: 'debug-keep', at: 3 });
    if (kept.kind !== 'debug-kept') throw new Error(JSON.stringify(kept));
    expect(kept.save).toMatchObject({ edition: 'states', summary: { turn: 2 } });
    await send({ kind: 'act', action: { type: 'hut/rest' }, at: 4 });
    const restored = await send({ kind: 'debug-restore', raw: JSON.stringify(kept.save), at: 5 });
    if (restored.kind !== 'debug-moved') throw new Error(JSON.stringify(restored));
    expect(restored.look).toMatchObject({ cursor: 2, recorded: 2, time: { day: 2 } });
    expect(restored.save).toMatchObject({ edition: 'playtest' });
    expect(quest(restored.look, 'loads')?.why[0]).toEqual({ text: 'Carry five loads up: 2 of 5' });
    expect(lookOf(await send({ kind: 'debug-back', at: 6 }))).toMatchObject({ cursor: 1, time: { day: 1 } });
    const broken = { ...(kept.save as SaveFile), check: 'nope' };
    expect(await send({ kind: 'debug-restore', raw: JSON.stringify(broken), at: 7 })).toMatchObject({
      kind: 'debug-refused',
    });
  });

  it('replays the run on the project as it is: the same, or stopped at the first step that parts', async () => {
    const send = await started();
    for (const type of ['hut/rest', 'hut/carry', 'hut/carry']) await send({ kind: 'act', action: { type }, at: 2 });
    const same = await send({ kind: 'debug-replay', files: hut(), at: 3 });
    expect(same).toMatchObject({ kind: 'debug-replayed', report: { kind: 'same', steps: 3 } });

    const edited = await send({ kind: 'debug-replay', files: hut(oneLoad()), at: 4 });
    if (edited.kind !== 'debug-replayed') throw new Error(JSON.stringify(edited));
    expect(edited.report).toMatchObject({ kind: 'differs', at: 2, label: 'Carry' });
    // The quest's thanks paid coins too: economy comes first by its key, and quests is named beside it.
    if (edited.report.kind === 'differs') {
      expect(edited.report.place).toMatchObject({ slice: 'economy', also: expect.arrayContaining(['quests']) });
    }
    // The edited game goes on from there, and the step after it waits ahead.
    expect(edited.look).toMatchObject({ cursor: 2, recorded: 3 });
    expect(quest(edited.look, 'loads')?.state).toBe('done');
    expect(edited.opened).toMatchObject({ kind: 'opened', game: 'the-hut' });
    expect(edited.save.build).toBe(edited.opened.build);
  });
});
