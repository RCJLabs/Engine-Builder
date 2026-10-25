/**
 * Behaviours in a project (M6.3, D75, docs/specs/ai.md#behaviours): the ai kit's behaviour type,
 * its tree checked as nodes, @self naming the actor running it, its conditions packed as trees,
 * and the actor's ai fields.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

const PROJECT = {
  format: 1,
  id: 'green',
  name: 'Green',
  version: '0.1.0',
  kits: ['stats', 'time', 'ai'],
  calendar: { ticksPerDay: 1440, units: { minutes: 1, hours: 60 } },
};
const GREEN = {
  name: 'Green',
  objects: [
    { id: 'smith', record: 'actor:smith' },
    { id: 'forge', shape: 'box', at: [4, 0, 0] },
  ],
};
const WATCH = {
  name: 'The watch',
  do: {
    first: [
      { if: 'ai.level(actor: @self) == alerted', cooldown: { minutes: 30 }, do: { face: 'player' } },
      { hours: [8, 18], do: { work: 'forge' } },
      { do: { wait: { minutes: 10 } } },
    ],
  },
};

const project = (
  behaviour: unknown,
  actor: Record<string, unknown> = { name: 'Ada', behaviour: 'watch' },
  more: Record<string, string> = {},
  calendar: unknown = PROJECT.calendar,
) =>
  compileProject(
    memorySource({
      'project.json': JSON.stringify({ ...PROJECT, calendar }),
      'spaces/green.json': JSON.stringify(GREEN),
      'records/actor/smith.json': JSON.stringify(actor),
      'records/behaviour/watch.json': JSON.stringify(behaviour),
      ...more,
    }),
    [],
  );
const brief = (result: Awaited<ReturnType<typeof project>>) => result.diagnostics.map((d) => `${d.code} ${d.path}`);
const full = (result: Awaited<ReturnType<typeof project>>) =>
  result.diagnostics.map((d) => `${d.code} ${d.file} ${d.path}: ${d.message}`);

describe('a behaviour record', () => {
  it('compiles with the ai kit, its condition packed as a tree with @self in it', async () => {
    // Nothing here walks: a space with no navmesh is no matter.
    const still = { ...WATCH, do: { first: [WATCH.do.first[0], { hours: [8, 18], do: { wait: { hours: 1 } } }] } };
    const result = await project(still, { name: 'Ada', behaviour: 'watch', sight: 20, cone: 90, hearing: 5 });
    expect(full(result)).toEqual([]);
    expect(result.pack?.format).toBe(12);
    const packed = result.pack?.records.behaviour?.watch as typeof WATCH;
    expect(packed.do.first[0]?.if).toEqual({
      fact: 'ai.level',
      args: { actor: '@self' },
      op: '==',
      value: 'alerted',
    });
  });

  it('is E001 for what isn’t a node, at its place in the tree', async () => {
    const bad = { do: { first: [{ hours: [8, 18], do: { dance: 'well' } }, { travel: 'Forge!' }, { wait: {} }] } };
    const codes = brief(await project(bad));
    expect(codes).toContain('E001 /do/first/0/do');
    expect(codes).toContain('E001 /do/first/1/travel');
    expect(codes).toContain('E001 /do/first/2/wait');
    const mixed = { do: { travel: 'forge', wait: { minutes: 5 }, dwell: { minutes: 1 } } };
    expect(brief(await project(mixed))).toEqual(['E001 /do']);
    const idle = { do: { sandbox: ['forge'] } };
    expect(brief(await project(idle))).toContain('E001 /do/sandbox');
    const extra = { do: { face: 'player', distance: 2 } };
    expect(brief(await project(extra))).toContain('E001 /do/distance');
  });

  it('is E044 for a slot other than @self, and @self outside a behaviour', async () => {
    const other = { do: { if: 'ai.level(actor: @them) == alerted', do: { face: 'player' } } };
    expect(brief(await project(other))).toContain('E044 /do/if');
  });

  it('is E005 for an actor’s behaviour that isn’t there', async () => {
    expect(brief(await project(WATCH, { name: 'Ada', behaviour: 'patrol' }))).toContain('E005 /behaviour');
  });
});

describe('E081 and W148', () => {
  const tree = (...first: unknown[]) => ({ do: { first } });
  it('is E081 for walking in a space with no navmesh', async () => {
    expect(full(await project(WATCH))).toEqual([
      'E081 records/behaviour/watch.json /do/first/1/do: The space "green", where "smith" stands, has no navmesh: open it and press Bake navigation',
    ]);
  });

  it('is E081 for a unit, hour or weekday the calendar lacks', async () => {
    const odd = tree(
      { do: { wait: { weeks: 1 } } },
      { hours: [8, 24], do: { wait: { minutes: 5 } } },
      { hours: [8, 8], do: { wait: { minutes: 5 } } },
      { days: ['mon'], do: { wait: { minutes: 5 } } },
    );
    expect(brief(await project(odd))).toEqual([
      'E081 /do/first/0/do/wait/weeks',
      'E081 /do/first/1/hours/1',
      'E081 /do/first/2/hours',
      'E081 /do/first/3/days/0',
    ]);
    const hourless = await project(
      tree({ hours: [8, 18], do: { wait: { days: 1 } } }),
      undefined,
      {},
      {
        ticksPerDay: 24,
      },
    );
    expect(full(hourless)).toEqual([
      'E081 records/behaviour/watch.json /do/first/0/hours: The calendar has no "hours" unit: give project.json\'s calendar "units": { "hours": … }',
    ]);
  });

  it('is E081 for a point its actor’s space lacks, once a point however many use it', async () => {
    const lost = tree({ patrol: ['anvil', 'forge', 'anvil'] }, { travel: 'anvil' });
    const codes = brief(await project(lost)).filter((c) => !c.endsWith('/do/first/0') && !c.endsWith('/do/first/1'));
    expect(codes).toEqual(['E081 /do/first/0/patrol/0', 'E081 /do/first/0/patrol/2', 'E081 /do/first/1/travel']);
  });

  it('is E081 for an actor with a behaviour that stands in no space', async () => {
    const guard = { 'records/actor/guard.json': JSON.stringify({ name: 'Bram', behaviour: 'watch' }) };
    const result = await project({ do: { face: 'player' } }, undefined, guard);
    expect(full(result)).toEqual([
      'E081 records/actor/guard.json /behaviour: "guard" stands in no space: place it in one for its behaviour to run',
    ]);
  });

  it('is W148 for a behaviour no actor has', async () => {
    const result = await project({ do: { face: 'player' } }, { name: 'Ada' });
    expect(full(result)).toEqual([
      'W148 records/behaviour/watch.json : No actor has this behaviour: give it to one as its Behaviour',
    ]);
  });
});
