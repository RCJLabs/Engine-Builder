/**
 * The kit boxes as last asked for, box by box, until project.json says the same, as useDraft holds
 * typed text: a redraw before a tick's edit landed, such as a new project's first read finishing,
 * drew the kits as they were and unticked the box just ticked (M4.10, seen on a busy machine).
 */
import { KITS } from '@eb/kits';
import { kitsWith } from '../editing/projectEdits.ts';

/** Each box asked for, on or off, by kit id. */
export type Asked = ReadonlyMap<string, boolean>;

export const NOTHING_ASKED: Asked = new Map();

/** The kits on as the boxes show them: what was asked for, else what project.json lists. */
export const shownKits = (on: readonly string[], asked: Asked): string[] =>
  KITS.map(({ id }) => id).filter((id) => asked.get(id) ?? on.includes(id));

/**
 * The asks once `kit` is ticked or cleared, worked out from the boxes as the asks before it left
 * them, so two ticks in one task both stay; the kits it brings or takes with it are asked too.
 */
export function withAsk(on: readonly string[], asked: Asked, kit: string, wanted: boolean): Asked {
  const before = shownKits(on, asked);
  const after = kitsWith(before, kit, wanted);
  const next = new Map(asked);
  for (const { id } of KITS) if (before.includes(id) !== after.includes(id)) next.set(id, after.includes(id));
  return next;
}

/** The asks project.json doesn't say yet; the same map when none has landed. */
export function stillAsked(on: readonly string[], asked: Asked): Asked {
  const left = [...asked].filter(([id, wanted]) => on.includes(id) !== wanted);
  return left.length === asked.size ? asked : new Map(left);
}
