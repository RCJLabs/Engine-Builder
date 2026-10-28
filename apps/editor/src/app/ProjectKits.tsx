/**
 * The open project's kits (M3.3, D41): a box to tick for each, what it brings beside it. Ticking
 * one ticks what it needs, and clearing one clears what needs it, so project.json never lists a
 * kit without its need. Each change is one step, which undo takes back.
 */
import { KITS } from '@eb/kits';
import { useEffect, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { kitsStep, kitsWith, kitToggle } from '../editing/projectEdits.ts';
import { type Asked, NOTHING_ASKED, shownKits, stillAsked, withAsk } from './askedKits.ts';
import { KIT_WORDS } from './kitWords.ts';

/** The boxes as asked (askedKits.ts). Undo or redo, which leave the history closed, drop every ask. */
function useAskedKits(on: readonly string[]) {
  const [asked, setAsked] = useState<Asked>(NOTHING_ASKED);
  const history = editing.session.value?.history.value;
  useEffect(() => {
    setAsked((now) => stillAsked(on, now));
  }, [on]);
  // Apart from `on`: a new project's history starts closed, and a read landing would drop the asks.
  useEffect(() => {
    if (history && !history.open) setAsked(NOTHING_ASKED);
  }, [history]);
  const ask = (kit: string, wanted: boolean) => setAsked((now) => withAsk(on, now, kit, wanted));
  return { shown: shownKits(on, asked), ask };
}

export function ProjectKits({ on }: { on: readonly string[] }) {
  const canEdit = editing.access.value.kind === 'editing';
  const { shown, ask } = useAskedKits(on);
  const toggle = (kit: string, wanted: boolean) => {
    ask(kit, wanted);
    void editing.edit(kitsStep(kit, wanted, shown, kitsWith(shown, kit, wanted)), async (copy) => {
      const change = await kitToggle(copy, kit, wanted);
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
              checked={shown.includes(id)}
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
