/**
 * nav.js (M6.2, D74, docs/specs/navigation.md#the-stage): Recast and Detour built apart from walk.js
 * by vite.nav.config.ts, as one classic script that leaves the navigation where the walk and the
 * editor's bake worker find it. A game whose spaces have no navmesh never loads it.
 */
import { NAV_LIB, type NavLib } from './lib.ts';

(globalThis as { __ebNav?: NavLib }).__ebNav = NAV_LIB;
