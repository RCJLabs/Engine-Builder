/**
 * eb with the post (M6.8's gate, D80, docs/specs/barter.md#the-gate): a yard where Hild trades from
 * her own bag and purse, a chest of bread and a candle, and an empty barrel. eb validates it and
 * builds it as format 16; played through the session as the stage would play it, a lamp is bought from
 * Hild, the chest's candle sold to her and bought back, her purse runs dry and three days restock it,
 * the chest is emptied line by line and a lamp put in the barrel, and a save mid-trade loads to the
 * same bags and purses. Broken, it is E089 and W156.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import type { Action } from '@eb/core';
import { type Opened, openPack, resumeFrom, saveOf, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const POST = resolve(import.meta.dirname, 'fixtures/post');

async function compiled(folder = POST) {
  return compileWithGame(folderSource(folder));
}

async function opened(): Promise<Opened> {
  const { pack, diagnostics } = await compiled();
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(pack)));
  if (!open.ok) throw new Error(open.message);
  return open.opened;
}

const use = (object: string): Action => ({ type: 'world/use', space: 'yard', object });
const buy = (item: string): Action => ({ type: 'economy/buy', item });
const sell = (item: string): Action => ({ type: 'economy/sell', item });
const take = (item: string, count?: number): Action => ({ type: 'inventory/take', item, ...(count ? { count } : {}) });
const put = (item: string): Action => ({ type: 'inventory/put', item });
const LEAVE: Action = { type: 'economy/leave' };
const CLOSE: Action = { type: 'inventory/close' };
const WAIT: Action = { type: 'post/wait' };

function played(open: Opened) {
  const play = startPlay(open.setup, 'post');
  // Only what is on offer: what the screens' buttons take is what the sim accepts.
  const act = (action: Action) => {
    const step = play.act(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
  const refused = (action: Action) => {
    const step = play.take(action);
    expect(step.accepted).toBe(false);
    return (step.beats[0] as { reason?: string }).reason;
  };
  const fact = (id: string, args: Record<string, unknown>) =>
    open.setup.game.fact(play.state, id, args, open.setup.sim);
  const coin = () => fact('economy.amount', { resource: 'coin' });
  const purse = () => fact('economy.purse', { actor: 'hild', resource: 'coin' });
  const hilds = (item: string) => fact('inventory.carried', { actor: 'hild', item });
  const mine = (item: string) => fact('inventory.count', { item });
  const held = (object: string, item: string) => fact('inventory.held', { space: 'yard', object, item });
  return { play, act, refused, coin, purse, hilds, mine, held };
}

/** A part of a line, which no option offers: a screen's count, taken as the sim takes it. */
function some(play: ReturnType<typeof startPlay>, action: Action) {
  const step = play.take(action);
  if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
}

describe('eb with the post', () => {
  it('builds it as format 16, each container’s holds beside its use', async () => {
    const { pack } = await opened();
    expect(pack.format).toBe(16);
    expect(pack.world?.uses?.yard).toMatchObject({
      chest: { label: 'Open', effects: [], holds: { bread: 2, candle: 1 } },
      barrel: { label: 'Open', effects: [], holds: {} },
      counter: { label: 'Trade', effects: [{ effect: 'open-shop', shop: 'post' }] },
    });
  });

  it('buys a lamp from Hild’s bag into her purse', async () => {
    const { act, coin, purse, hilds, mine } = played(await opened());
    act(use('counter'));
    expect([hilds('lamp'), hilds('candle'), purse()]).toEqual([1, 2, 3]);
    act(buy('lamp'));
    expect([coin(), purse(), hilds('lamp'), mine('lamp')]).toEqual([8, 15, 0, 1]);
  });

  it('sells her the chest’s candle and buys it back', async () => {
    const { act, coin, purse, hilds, mine } = played(await opened());
    act(use('chest'));
    act(take('candle'));
    act(CLOSE);
    act(use('counter'));
    act(sell('candle'));
    expect([coin(), purse(), hilds('candle'), mine('candle')]).toEqual([22, 1, 3, 0]);
    act(buy('candle'));
    expect([coin(), purse(), hilds('candle'), mine('candle')]).toEqual([18, 5, 2, 1]);
  });

  it('sells until her purse can’t pay, and three days restock her bag and purse', async () => {
    const { play, act, refused, purse, hilds } = played(await opened());
    act(use('chest'));
    act({ type: 'inventory/take-all' });
    act(CLOSE);
    act(use('counter'));
    act(sell('candle'));
    act(sell('bread'));
    expect(purse()).toBe(0);
    expect(refused(sell('bread'))).toBe('cant-pay');
    expect(play.view.offered.some((a) => a.type === 'economy/sell')).toBe(false);
    act(LEAVE);
    act(WAIT);
    act(WAIT);
    act(use('counter'));
    expect([hilds('bread'), hilds('candle'), purse()]).toEqual([4, 3, 0]);
    act(LEAVE);
    act(WAIT);
    act(use('counter'));
    expect([hilds('bread'), hilds('candle'), hilds('lamp'), purse()]).toEqual([3, 2, 1, 3]);
  });

  it('empties the chest line by line, and puts a lamp in the barrel', async () => {
    const { play, act, held, mine } = played(await opened());
    act(use('chest'));
    some(play, take('bread', 1));
    expect([held('chest', 'bread'), mine('bread')]).toEqual([1, 1]);
    act(take('bread'));
    act(take('candle'));
    expect([held('chest', 'bread'), held('chest', 'candle'), mine('bread'), mine('candle')]).toEqual([0, 0, 2, 1]);
    act(CLOSE);
    act(use('counter'));
    act(buy('lamp'));
    act(LEAVE);
    act(use('barrel'));
    act(put('lamp'));
    act(CLOSE);
    expect([held('barrel', 'lamp'), mine('lamp')]).toEqual([1, 0]);
  });

  it('saves mid-trade, and a load gives the same bags, purses and containers back', async () => {
    const open = await opened();
    const { play, act } = played(open);
    act(use('chest'));
    act(take('candle'));
    act(CLOSE);
    act(use('counter'));
    act(buy('lamp'));
    const file = saveOf(open, play, { edition: 'test' }, 1000);
    const resumed = resumeFrom(open, JSON.stringify(file));
    if (!resumed.ok) throw new Error(resumed.message);
    expect(resumed.play.state.inventory).toEqual(play.state.inventory);
    expect(resumed.play.state.economy).toEqual(play.state.economy);
    expect(resumed.play.state.kernel.modes).toEqual(play.state.kernel.modes);
    expect(resumed.play.act(sell('candle')).accepted).toBe(true);
  });

  it('is E089 for a container that takes, at its holds', async () => {
    const problems = await broken('spaces/yard.json', (space) => {
      const chest = space.objects.find((o: { id: string }) => o.id === 'chest');
      chest.components.interact.takes = true;
    });
    expect(problems).toEqual([['E089', 'spaces/yard.json', '/objects/4/components/interact/holds']]);
  });

  it('is E089 for a container with the inventory kit off', async () => {
    const problems = await broken('project.json', (project) => {
      project.kits = ['stats', 'time'];
    });
    expect(problems.filter(([code]) => code === 'E089')).toEqual([
      ['E089', 'spaces/yard.json', '/objects/4/components/interact/holds'],
      ['E089', 'spaces/yard.json', '/objects/5/components/interact/holds'],
    ]);
  });

  it('is W156 for a shop whose actor carries nothing and whose stock is empty', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'post-'));
    try {
      await cp(POST, folder, { recursive: true });
      await edit(join(folder, 'records/actor/hild.json'), (hild) => {
        delete hild.carries;
      });
      await edit(join(folder, 'records/shop/post.json'), (shop) => {
        delete shop.stock;
      });
      const { diagnostics } = await compiled(folder);
      expect(diagnostics.filter((d) => d.code === 'W156').map((d) => [d.code, d.file, d.path])).toEqual([
        ['W156', 'records/shop/post.json', '/actor'],
      ]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, changed in place
async function edit(file: string, change: (value: any) => void): Promise<void> {
  const value = JSON.parse(await readFile(file, 'utf8'));
  change(value);
  await writeFile(file, JSON.stringify(value));
}

/** The fixture with one file changed: its errors, as code, file and path. */
// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, changed in place
async function broken(file: string, change: (value: any) => void): Promise<string[][]> {
  const folder = await mkdtemp(join(tmpdir(), 'post-'));
  try {
    await cp(POST, folder, { recursive: true });
    await edit(join(folder, file), change);
    const { diagnostics } = await compiled(folder);
    return diagnostics.filter((d) => d.severity === 'error').map((d) => [d.code, d.file ?? '', d.path]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
