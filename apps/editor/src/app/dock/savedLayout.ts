/**
 * The desktop layout as this browser keeps it: dockview's own serialisation in an envelope that
 * says which format it is. Anything that can't be given back to dockview whole is passed over for
 * the default layout; a layout is cheap to lose, a broken editor is not.
 */

/** A storage key: never renamed. */
export const LAYOUT_KEY = 'eb-editor:dock-layout';
export const LAYOUT_FORMAT = 1;

/** The parts of dockview's `toJSON()` the editor checks before handing it back to `fromJSON()`. */
export interface DockJson {
  readonly grid: object;
  readonly panels: Readonly<Record<string, object>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A saved layout that dockview can be given back, with the known panels it lacks (ones added to
 * the editor since it was saved), or null when there is none or it can't be used.
 */
export function readSavedLayout<Id extends string>(
  text: string | null,
  known: readonly Id[],
): { layout: DockJson; missing: Id[] } | null {
  if (text === null) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(saved) || saved.format !== LAYOUT_FORMAT || !isRecord(saved.layout)) return null;
  const { grid, panels } = saved.layout;
  if (!isRecord(grid) || !isRecord(panels)) return null;
  const ids = Object.keys(panels);
  // Each panel's component is its id, so an unknown one would ask dockview for a panel the editor can't make.
  const usable = (id: string) =>
    (known as readonly string[]).includes(id) && isRecord(panels[id]) && panels[id].contentComponent === id;
  if (ids.length === 0 || !ids.every(usable)) return null;
  return { layout: saved.layout as unknown as DockJson, missing: known.filter((id) => !ids.includes(id)) };
}

export const layoutText = (layout: object): string => JSON.stringify({ format: LAYOUT_FORMAT, layout });
