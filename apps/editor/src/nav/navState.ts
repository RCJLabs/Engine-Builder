/**
 * Navigation in the editor (M6.2, D74, docs/specs/navigation.md#the-editor): whether Show navigation
 * is on, a bake under way and what the last one said, and what the view draws of the navmesh, which
 * window.__ebViewport.nav() reads.
 */
import { signal } from '@preact/signals';
import type { NavLook } from './protocol.ts';

/** Show navigation: the navmesh drawn over the view. */
export const showNav = signal(false);

/** The last bake of the space at `path`: under way, its words, or why it failed. */
export const baking = signal<{ readonly path: string; readonly words: string; readonly busy: boolean } | null>(null);

/** What the view draws: the navmesh of the space at `path`, its tiles and polygons. */
export const navDrawn = signal<{ readonly path: string; readonly look: NavLook } | null>(null);

/** The open space's navmesh, as the hook says it (null with no space open). */
export const navNow = signal<{ readonly path: string; readonly has: boolean; readonly stale: boolean } | null>(null);
