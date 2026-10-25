/**
 * The bake worker (M6.2, D74, docs/specs/navigation.md#the-editor): a space's soup built and baked
 * off the page, and a navmesh opened to be drawn. It runs the editor's own runtime/nav.js, the file
 * exports carry, so the editor keeps one copy of Recast; a dev server, with none built, imports it.
 */
import { bakedSolids, soupOf } from './geometry.ts';
import type { NavLib } from './lib.ts';
import type { NavLook, NavReply, NavRequest } from './protocol.ts';

let loading: Promise<NavLib> | null = null;

async function libAt(url: string): Promise<NavLib> {
  if (import.meta.env.DEV) return (await import('./lib.ts')).NAV_LIB;
  const text = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`No ${url}: this editor was built without nav.js`);
    return r.text();
  });
  // nav.js is a classic script: run as one, it leaves the navigation on the worker's global.
  new Function(text)();
  const lib = (globalThis as { __ebNav?: NavLib }).__ebNav;
  if (!lib) throw new Error('nav.js ran but left no navigation');
  return lib;
}

const lookOf = (lib: NavLib, navmesh: Uint8Array): NavLook => {
  const world = lib.openNav(navmesh);
  const look = world.debug();
  world.free();
  return look;
};

self.onmessage = async ({ data: ask }: MessageEvent<NavRequest>) => {
  const reply = (message: NavReply) => self.postMessage(message);
  try {
    loading ??= libAt(ask.nav);
    const lib = await loading;
    await lib.readyNav();
    if (ask.kind === 'look') return reply({ id: ask.id, ok: true, kind: 'look', look: lookOf(lib, ask.navmesh) });
    const start = performance.now();
    const soup = soupOf(bakedSolids(ask.solids), ask.ground);
    const baked = lib.bakeSoup(soup);
    if (!baked.ok) return reply({ id: ask.id, ok: false, error: baked.why });
    const ms = Math.round(performance.now() - start);
    const look = lookOf(lib, baked.navmesh);
    reply({
      id: ask.id,
      ok: true,
      kind: 'bake',
      navmesh: baked.navmesh,
      tiled: baked.tiled,
      ms,
      triangles: soup.indices.length / 3,
      look,
    });
  } catch (error) {
    loading = null;
    reply({ id: ask.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
