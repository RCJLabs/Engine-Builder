/**
 * The open project's kits (M3.3, D41): a box to tick for each, what it brings beside it. Ticking
 * one ticks what it needs, and clearing one clears what needs it, so project.json never lists a
 * kit without its need. Each change is one step, which undo takes back.
 */
import { KITS } from '@eb/kits';
import { editing } from '../editing/current.ts';
import { kitsChange, kitsStep, kitsWith } from '../editing/projectEdits.ts';

/** What each kit is called and brings, for the box beside it. */
export const KIT_WORDS: Readonly<Record<string, { readonly name: string; readonly brings: string }>> = {
  inventory: { name: 'Inventory', brings: 'Items, the party’s bag and loot tables.' },
  economy: { name: 'Economy', brings: 'Resources such as credits, and shops. Needs Inventory.' },
  stats: { name: 'Stats', brings: 'Actors, their stats and the damage they take, and statuses.' },
  gear: { name: 'Gear', brings: 'Slots, and items actors wear in them. Needs Stats and Inventory.' },
  factions: {
    name: 'Factions',
    brings: 'Standing with each faction, in bands that set shops’ prices and that conditions read.',
  },
  time: { name: 'Time', brings: 'Days, weeks, months and seasons, and rows that run as each one starts.' },
  roster: {
    name: 'Roster',
    brings: 'Members who join and leave, recruits rolled in halls, ranks on a stat, and bonds. Needs Stats.',
  },
};

export function ProjectKits({ on }: { on: readonly string[] }) {
  const canEdit = editing.access.value.kind === 'editing';
  const toggle = (kit: string, wanted: boolean) => {
    const after = kitsWith(on, kit, wanted);
    void editing.edit(kitsStep(kit, wanted, on, after), async (copy) => {
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
