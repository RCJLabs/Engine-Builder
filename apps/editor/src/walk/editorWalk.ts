/**
 * The Play panel's and the player page's walk (M5.8, D70): the editor's own runtime/walk.js, the
 * file Export puts beside a game, which the editor's service worker keeps, and runtime/nav.js beside
 * it (M6.2), and runtime/stage2d.js for a 2D space (M7.1). A dev server has none built, so there the
 * stages and the navigation are imported as they are.
 */
import type { PackWorld } from '@eb/core';
import type { SpaceHost } from '@eb/ui';
import { hostFor, loadNavScript, loadStage2dScript, loadWalkScript } from './hosts.ts';

export const editorWalk = (world: PackWorld | undefined): SpaceHost | undefined =>
  hostFor(
    world,
    () =>
      import.meta.env.DEV
        ? Promise.all([import('./stage.ts'), import('./mapPins.ts')]).then(([stage, pins]) => ({
            startStage: stage.startStage,
            mapOf: pins.mapOf,
          }))
        : loadWalkScript(`${import.meta.env.BASE_URL}runtime/walk.js`),
    () =>
      import.meta.env.DEV
        ? import('../nav/lib.ts').then((m) => m.NAV_LIB)
        : loadNavScript(`${import.meta.env.BASE_URL}runtime/nav.js`),
    () =>
      import.meta.env.DEV
        ? import('../stage2d/stage.ts').then((m) => ({ startStage2d: m.startStage2d }))
        : loadStage2dScript(`${import.meta.env.BASE_URL}runtime/stage2d.js`),
  );
