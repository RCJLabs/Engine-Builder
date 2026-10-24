/**
 * What the Scene panel, the Outliner and the inspector share (M5.1, D63): the space or prefab
 * open, the objects chosen in it, and the toolbar's settings. Small, so it rides in the editor's
 * start; the panels load with a project, and three with the first space opened.
 */
import { type SpaceKind, spacePath } from '@eb/compiler';
import { effect, signal } from '@preact/signals';
import { chosen } from '../forms/selection.ts';
import { current } from '../projects/opened.ts';
import type { Mode } from './gizmoMath.ts';
import type { Vec3 } from './vec.ts';

export interface OpenSpace {
  readonly kind: SpaceKind;
  readonly id: string;
  readonly path: string;
}

/** The space or prefab the Scene panel shows; null for its list. */
export const openSpace = signal<OpenSpace | null>(null);
/** The ids of the objects chosen in it, in the order they were chosen. */
export const picked = signal<readonly string[]>([]);
/**
 * With one placement of a prefab chosen, the object inside it its form shows (M5.2): a path of ids
 * down through the prefabs, empty for the placement itself. Any new choice clears it.
 */
export const inside = signal<readonly string[]>([]);
export const gizmoMode = signal<Mode>('move');
export const snapOn = signal(true);
/** Touch's way to choose many: each tap adds or takes away until it is turned off. */
export const selectMore = signal(false);
/** What a phone's inspector sheet shows while a space is open: the object's form, or the outliner. */
export const sheetTab = signal<'inspector' | 'outliner'>('inspector');
/** The ground in the middle of the view, where Add puts an object: the view keeps it up to date. */
export const aim = signal<Vec3>([0, 0, 0]);
/** Counts presses of Frame, so each one frames again. */
export const frameAsked = signal(0);

/** Opens a space or prefab in the Scene panel, with `objects` chosen, and its form in the inspector. */
export function openSpaceFile(kind: SpaceKind, id: string, objects: readonly string[] = []): void {
  const path = spacePath(kind, id);
  if (openSpace.value?.path !== path) openSpace.value = { kind, id, path };
  pick(objects);
}

/** Chooses objects in the open space: the inspector shows them. */
export function pick(objects: readonly string[]): void {
  const open = openSpace.value;
  picked.value = objects;
  inside.value = [];
  if (open) chosen.value = { kind: 'space', path: open.path };
}

/** Back to the Scene panel's list. */
export function closeSpace(): void {
  openSpace.value = null;
  picked.value = [];
  if (chosen.value?.kind === 'space') chosen.value = null;
}

/** A tap or click on an object, or on its row: it alone, or added and taken away with Shift, Ctrl or Select more. */
export function choose(id: string | null, many: boolean): void {
  const now = picked.value;
  if (id === null) {
    if (!many) pick([]);
    return;
  }
  if (!many) pick([id]);
  else pick(now.includes(id) ? now.filter((other) => other !== id) : [...now, id]);
}

// Another project, or none: what was open belonged to the last one.
let shown: unknown = null;
effect(() => {
  const source = current.value?.source ?? null;
  if (source === shown) return;
  shown = source;
  openSpace.value = null;
  picked.value = [];
});
