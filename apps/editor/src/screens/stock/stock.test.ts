/**
 * Every stock screen (M4.4, D54) written into a project and compiled against its game: clean, with
 * nothing under ui/ the checks find. The hut, its own screens set aside, covers dialogue, events,
 * quests and factions; the crew the roster and stats; the arena stats without a roster; the drift
 * the map (M4.6).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource, projectGame } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { contextFrom, type Held, nameOf, type StockContext, shownBy, showsOf } from './context.ts';
import { allStock, STOCK } from './index.ts';

const FIXTURES = join(import.meta.dirname, '../../../../../tools/cli/test/fixtures');

/** A fixture's files, its screens left out: theme.json, feedback.json and shell.json stay. */
function filesOf(name: string): Record<string, Uint8Array> {
  const root = join(FIXTURES, name);
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path).split('\\').join('/')] = readFileSync(path);
    }
  };
  walk(root);
  const kept = new Set(['ui/theme.json', 'ui/feedback.json', 'ui/shell.json']);
  return Object.fromEntries(Object.entries(files).filter(([path]) => !path.startsWith('ui/') || kept.has(path)));
}

async function contextOf(name: string, files: Record<string, Uint8Array>): Promise<StockContext> {
  const source = memorySource(files);
  const loaded = await projectGame(source);
  if (loaded.kind !== 'loaded') throw new Error(`${name}'s game didn't load: ${loaded.kind}`);
  const compiled = await compileWithGame(source);
  const records = compiled.pack?.records ?? {};
  const held: Held[] = Object.entries(records).flatMap(([type, group]) =>
    Object.entries(group).map(([id, value]) => ({ type, id, value })),
  );
  const project = JSON.parse(new TextDecoder().decode(files['project.json'])) as { name: string; kits?: string[] };
  const { start, modes, endings, travelling } = loaded.catalog;
  return contextFrom(
    {
      game: project.name,
      kits: project.kits ?? [],
      modes: { start, all: modes, endings, travelling },
      screens: [],
      shown: new Set(),
      // The spaces as New screen lists them (M5.8): by id, each with its name.
      spaces: Object.entries(compiled.pack?.world?.spaces ?? {}).map(([id, value]) => ({
        id,
        name: nameOf(value, id),
      })),
    },
    held,
  );
}

/** Each stock screen offered, written into the files as allStock makes them. */
function withStock(ctx: StockContext, files: Record<string, Uint8Array>) {
  const written = allStock(ctx);
  const added: Record<string, Uint8Array> = { ...files };
  for (const { id, text } of written) added[`ui/${id}.json`] = new TextEncoder().encode(text);
  return { added, screens: written.map(({ id }) => id) };
}

describe('the stock screens, written into a project and compiled against its game', () => {
  for (const [name, expected] of [
    ['hut', ['codex', 'credits', 'dialogue', 'ending', 'event', 'hud', 'inventory', 'journal', 'shop']],
    ['crew', ['codex', 'credits', 'ending', 'hall', 'hud', 'inventory', 'shop']],
    ['arena', ['codex', 'credits', 'ending', 'hud', 'inventory', 'shop']],
    // The drift starts on its map, so the map is its HUD (M4.6).
    ['drift', ['codex', 'credits', 'ending', 'event', 'inventory', 'map', 'shop']],
  ] as const) {
    it(`gives ${name} its kits’ stock screens, each clean`, async () => {
      const files = filesOf(name);
      const ctx = await contextOf(name, files);
      const { added, screens } = withStock(ctx, files);
      expect([...screens].sort()).toEqual(expected);
      const compiled = await compileWithGame(memorySource(added));
      expect(compiled.diagnostics.filter((d) => d.file?.startsWith('ui/'))).toEqual([]);
      expect(compiled.pack?.ui?.screens).toBeDefined();
    }, 30_000);
  }

  it('gives a game that opens containers the Container screen, and a merchant’s shop their purse (M6.8)', async () => {
    const files = filesOf('post');
    const ctx = await contextOf('post', files);
    expect(ctx.merchants).toBe(true);
    const { added, screens } = withStock(ctx, files);
    expect(screens).toContain('container');
    // A walked game's HUD and ending show no mode of their own (W134, as since M5.8): these two are clean.
    const compiled = await compileWithGame(memorySource(added));
    const ours = ['ui/container.json', 'ui/shop.json'];
    expect(compiled.diagnostics.filter((d) => ours.includes(d.file ?? ''))).toEqual([]);
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const screen = (id: string) => new TextDecoder().decode(added[`ui/${id}.json`]);
    expect(showsOf(JSON.parse(screen('container')))).toEqual(['container']);
    // The template writes the post's own screen, as barterEditor.spec.ts makes it in the editor.
    const posts = JSON.parse(readFileSync(join(FIXTURES, 'post', 'ui/container.json'), 'utf8'));
    expect(JSON.parse(screen('container'))).toEqual(posts);
    expect(screen('shop')).toContain('{shop.keeper} has {shop.purse}');
    // The camp's bodies open the same mode (M6.4's search); the hut opens nothing, so has none.
    const camp = await contextOf('camp', filesOf('camp'));
    expect(STOCK.find((s) => s.id === 'container')?.offered(camp)).toBe(true);
    const hut = await contextOf('hut', filesOf('hut'));
    expect(STOCK.find((s) => s.id === 'container')?.offered(hut)).toBe(false);
    expect(STOCK.find((s) => s.id === 'shop')?.build(hut).top).not.toMatchObject({
      children: expect.arrayContaining([expect.objectContaining({ text: '{shop.keeper} has {shop.purse}' })]),
    });
  }, 30_000);

  it('puts a talk’s and an event’s odds under each choice, and nothing under a hall’s offers (M4.7)', async () => {
    const lists = async (name: string) => {
      const files = filesOf(name);
      const { added } = withStock(await contextOf(name, files), files);
      const found: Record<string, unknown> = {};
      const walk = (node: unknown): void => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node !== null && typeof node === 'object') {
          const widget = node as { widget?: string; of?: string; item?: { detail?: string } };
          if (widget.widget === 'list' && widget.of !== undefined) found[widget.of] = widget.item?.detail;
          Object.values(node).forEach(walk);
        }
      };
      for (const id of ['dialogue', 'event', 'hall']) {
        const file = added[`ui/${id}.json`];
        if (file) walk(JSON.parse(new TextDecoder().decode(file)));
      }
      return found;
    };
    expect(await lists('hut')).toEqual({ talk: '{.odds}', event: '{.odds}' });
    expect(await lists('crew')).toEqual({ offered: undefined });
  }, 30_000);

  it('shows each mode once: the HUD the game’s start, the ending its modes with no action', async () => {
    const files = filesOf('hut');
    const ctx = await contextOf('hut', files);
    const { added } = withStock(ctx, files);
    const shows = (id: string) => showsOf(JSON.parse(new TextDecoder().decode(added[`ui/${id}.json`])));
    expect(shows('hud')).toEqual(['hut']);
    expect(shows('ending')).toEqual(['closed']);
    expect(shows('dialogue')).toEqual(['talking']);
    expect(shows('journal')).toEqual([]);
    // A mode a screen already shows is left to it, the HUD's and the ending's too.
    const shown = new Set(['talking', 'hut', 'closed']);
    for (const id of ['dialogue', 'hud', 'ending']) {
      expect(STOCK.find((s) => s.id === id)?.build({ ...ctx, shown }).shows).toEqual([]);
    }
  });

  it('walks the player’s space for the start mode, before the HUD, and is offered only with spaces (M5.8, M5.9)', async () => {
    const files = filesOf('trail');
    const ctx = await contextOf('trail', files);
    const { added } = withStock(ctx, files);
    const space = JSON.parse(new TextDecoder().decode(added['ui/space.json']));
    expect(space.title).toBe('Walk');
    expect(space.shows).toEqual(['trailhead']);
    expect(space.main).toEqual({ widget: 'space' });
    // The actions on offer, then the way to the Map (M6.6): the trail has no quests, so no Journal.
    expect(space.bottom.children[0].of).toBe('offered');
    expect(space.bottom.children[1].children).toEqual([
      { widget: 'button', label: 'Map', action: { open: 'space-map' } },
    ]);
    const map = JSON.parse(new TextDecoder().decode(added['ui/space-map.json']));
    expect(map).toMatchObject({ title: 'Map', modal: true, main: { widget: 'space-map' } });
    expect(showsOf(JSON.parse(new TextDecoder().decode(added['ui/hud.json'])))).toEqual([]);
    expect(STOCK.find((s) => s.id === 'space')?.offered({ ...ctx, spaces: [] })).toBe(false);
    // Clean against the trail's game. Its HUD and ending show no mode, as the trail has no other and no end (W134).
    expect([...withStock(ctx, files).screens].sort()).toEqual(['credits', 'ending', 'hud', 'space', 'space-map']);
    const compiled = await compileWithGame(memorySource(added));
    expect(compiled.diagnostics.filter((d) => d.file === 'ui/space.json' || d.file === 'ui/space-map.json')).toEqual(
      [],
    );
  }, 30_000);

  it('shows the map for each mode that travels, with the live numbers over it (M4.6)', async () => {
    const files = filesOf('drift');
    const ctx = await contextOf('drift', files);
    expect(ctx.modes?.travelling).toEqual(['flying']);
    const map = JSON.parse(new TextDecoder().decode(withStock(ctx, files).added['ui/map.json']));
    expect(map.shows).toEqual(['flying']);
    expect(map.top.children.map((c: { text: string }) => c.text)).toEqual([
      '{economy.amount(resource: credits)} Credits',
      '{economy.amount(resource: supplies)} Supplies',
    ]);
    expect(map.main.children.map((c: { widget: string }) => c.widget)).toEqual(['text', 'map', 'log']);
    // Without the maps kit there is no map to show; a game that doesn't start on one keeps its HUD.
    const offered = (id: string, at: StockContext) => STOCK.find((s) => s.id === id)?.offered(at);
    expect(offered('map', { ...ctx, kits: ['inventory', 'economy', 'events'] })).toBe(false);
    expect(offered('hud', ctx)).toBe(false);
    const modes = ctx.modes as NonNullable<StockContext['modes']>;
    expect(offered('hud', { ...ctx, modes: { ...modes, travelling: [] } })).toBe(true);
  });

  it('holds back a codex’s items until carried and its events until seen, its factions shown from the start', async () => {
    const files = filesOf('hut');
    const codex = JSON.parse(
      new TextDecoder().decode(withStock(await contextOf('hut', files), files).added['ui/codex.json']),
    );
    const lists = codex.main.tabs.map(
      (tab: { label: string; children: { type: string; known?: string; unknown?: unknown }[] }) => {
        const [list] = tab.children;
        return [tab.label, list?.type, list?.known ?? null, list?.unknown !== undefined];
      },
    );
    expect(lists).toEqual([
      ['Items', 'item', 'inventory.count(item: @entry) > 0', true],
      ['Factions', 'faction', null, false],
      ['Events', 'event', 'events.seen(event: @entry) > 0', true],
    ]);
  });

  it('reads which modes the screens there are already show, a screen that isn’t JSON showing none', async () => {
    const files: Record<string, string> = {
      'ui/a.json': JSON.stringify({ shows: ['hut', 'talking'], main: {} }),
      'ui/b.json': '{ not json',
      'ui/c.json': JSON.stringify({ main: {} }),
    };
    const read = async (path: string) => (path in files ? new TextEncoder().encode(files[path]) : undefined);
    expect([...(await shownBy(['ui/a.json', 'ui/b.json', 'ui/c.json', 'ui/gone.json'], read))]).toEqual([
      'hut',
      'talking',
    ]);
  });

  it('writes the HUD from the project: its resources by name, the pages before it, the roster’s starting members', async () => {
    const hut = filesOf('hut');
    const hud = (added: Record<string, Uint8Array>) =>
      JSON.parse(new TextDecoder().decode(added['ui/hud.json'])) as {
        top?: { children: { text?: string }[] };
        main: { children: { widget: string; children?: { label: string }[] }[] };
        bottom?: { children: { action: { open?: string } }[] };
      };
    const fromHut = hud(withStock(await contextOf('hut', hut), hut).added);
    expect(fromHut.top?.children.map((c) => c.text)).toEqual([
      'Day {time.day}',
      '{economy.amount(resource: coins)} Coins',
    ]);
    expect(fromHut.bottom?.children.map((c) => c.action.open)).toEqual(['inventory', 'journal', 'codex', 'credits']);
    const crew = filesOf('crew');
    const crewCtx = await contextOf('crew', crew);
    expect(crewCtx.starting.length).toBeGreaterThan(0);
    const bars = hud(withStock(crewCtx, crew).added).main.children.find((c) => c.widget === 'panel')?.children ?? [];
    const names = new Map(crewCtx.records.get('actor')?.map(({ id, name }) => [id, name]));
    const followed = [...new Set(bars.map((bar) => bar.label.split(':')[0]))];
    expect(followed).toEqual(crewCtx.starting.slice(0, 3).map((id) => names.get(id)));
  });
});
