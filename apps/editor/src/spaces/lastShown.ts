/**
 * What the 3D view was last shown, so it draws a space again only when the space, a prefab, a
 * placed record's name or its models changed (M5.1), or its environment did (M5.4). A key offered
 * before the view exists isn't kept: a space's props can all arrive while three's view is still
 * being made, and if nothing changes after, nothing would draw them (M5.5).
 */
export interface LastShown {
  /** Whether to show `key` now: there is a view, and it was last shown something else. */
  readonly due: (key: string, view: boolean) => boolean;
}

export function lastShown(): LastShown {
  let last: string | null = null;
  return {
    due(key, view) {
      if (!view || key === last) return false;
      last = key;
      return true;
    },
  };
}
