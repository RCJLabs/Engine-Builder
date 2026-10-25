/**
 * The Play panel's and the player page's walk (M5.8, D70): the editor's own runtime/walk.js, the
 * file Export puts beside a game, which the editor's service worker keeps, and runtime/nav.js beside
 * it (M6.2). A dev server has none built, so there the stage and the navigation are imported as they are.
 */
import type { PackWorld } from '@eb/core';
import type { SpaceHost } from '@eb/ui';
import { hostFor, loadNavScript, loadWalkScript } from './hosts.ts';

export const editorWalk = (world: PackWorld | undefined): SpaceHost | undefined =>
  hostFor(
    world,
    () => (import.meta.env.DEV ? import('./stage.ts') : loadWalkScript(`${import.meta.env.BASE_URL}runtime/walk.js`)),
    () =>
      import.meta.env.DEV
        ? import('../nav/lib.ts').then((m) => m.NAV_LIB)
        : loadNavScript(`${import.meta.env.BASE_URL}runtime/nav.js`),
  );
