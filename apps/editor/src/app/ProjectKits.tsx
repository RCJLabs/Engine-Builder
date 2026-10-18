/**
 * The open project's kits (M3.3, D41): a box to tick for each, what it brings beside it. Ticking
 * one ticks what it needs, and clearing one clears what needs it, so project.json never lists a
 * kit without its need. Each change is one step, which undo takes back.
 */
import { KITS } from '@eb/kits';
import { editing } from '../editing/current.ts';
import { kitsChange } from '../editing/projectEdits.ts';

/** What each kit is called and brings, for the box beside it. */
export const KIT_WORDS: Readonly<Record<string, { readonly name: string; readonly brings: string }>> = {
  inventory: { name: 'Inventory', brings: 'Items, the party’s bag and loot tables.' },
  economy: { name: 'Economy', brings: 'Resources such as credits, and shops. Needs Inventory.' },
};

/** The kits on once `kit` is turned on or off, in the engine's order. */
export function kitsWith(on: readonly string[], kit: string, wanted: boolean): string[] {
  const next = new Set(on);
  if (wanted) {
    const add = (id: string): void => {
      next.add(id);
      for (const need of KITS.find((k) => k.id === id)?.needs ?? []) add(need);
    };
    add(kit);
  } else {
    const drop = (id: string): void => {
      next.delete(id);
      for (const other of KITS) if (other.needs.includes(id) && next.has(other.id)) drop(other.id);
    };
    drop(kit);
  }
  return KITS.map((k) => k.id).filter((id) => next.has(id));
}

/** "Turn on the economy kit, with inventory" or "Turn off the inventory kit, with economy". */
function said(kit: string, wanted: boolean, before: readonly string[], after: readonly string[]): string {
  const also = wanted
    ? after.filter((id) => id !== kit && !before.includes(id))
    : before.filter((id) => id !== kit && !after.includes(id));
  return `Turn ${wanted ? 'on' : 'off'} the ${kit} kit${also.length > 0 ? `, with ${also.join(' and ')}` : ''}`;
}

export function ProjectKits({ on }: { on: readonly string[] }) {
  const canEdit = editing.access.value.kind === 'editing';
  const toggle = (kit: string, wanted: boolean) => {
    const after = kitsWith(on, kit, wanted);
    void editing.edit(said(kit, wanted, on, after), async (copy) => {
      const change = await kitsChange(copy, after);
      return change ? [change] : [];
    });
  };
  return (
    <fieldset class="project-kits">
      <legend>Kits</legend>
      <p class="muted">
        What most games share, ready to fill in: their types join Records, their effects the Logic panel.
      </p>
      {KITS.map(({ id }) => {
        const words = KIT_WORDS[id] ?? { name: id, brings: '' };
        const box = `kit-${id}`;
        return (
          <div key={id} class="form-bool project-kit">
            <input
              id={box}
              type="checkbox"
              class="form-check"
              checked={on.includes(id)}
              disabled={!canEdit}
              aria-describedby={`${box}-brings`}
              onChange={(event) => toggle(id, event.currentTarget.checked)}
            />
            <label for={box} class="project-kit-name">
              {words.name}
            </label>
            <p id={`${box}-brings`} class="muted project-kit-brings">
              {words.brings}
            </p>
          </div>
        );
      })}
    </fieldset>
  );
}
