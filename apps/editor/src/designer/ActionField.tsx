/**
 * A button's action, as the designer edits it (M4.5): take one of the game's actions, with its
 * arguments as names and values; open one of the project's screens; close the screen; or go to the
 * shell's title or New game. Each change writes the whole action, so no key of another kind stays.
 */
import { SHELL_GOES } from '@eb/ui/format';
import { useUniqueId } from '../app/ids.ts';
import { FieldNotes } from '../forms/FieldShell.tsx';
import { parseNumber } from '../forms/values.ts';
import { DraftInput } from './DraftInput.tsx';

type Action = Record<string, unknown>;
type Does = 'take' | 'open' | 'close' | 'shell';

const DOES: Readonly<Record<Does, string>> = {
  take: 'Takes an action',
  open: 'Opens a screen',
  close: 'Closes this screen',
  shell: 'Goes to the shell',
};
const SHELL_NAMES: Readonly<Record<string, string>> = { title: 'Its title', new: 'New game' };

const doesOf = (action: Action): Does =>
  'open' in action ? 'open' : 'close' in action ? 'close' : 'shell' in action ? 'shell' : 'take';

/** What a new action of each kind holds: the first choice, so the checks say what is left. */
function fresh(does: Does, actions: readonly string[], screens: readonly string[]): Action {
  if (does === 'open') return { open: screens[0] ?? '' };
  if (does === 'close') return { close: true };
  if (does === 'shell') return { shell: 'title' };
  return { take: actions[0] ?? '' };
}

/** An argument's value as typed: a number when it reads as one, text otherwise. */
const argOf = (text: string): string | number => parseNumber(text) ?? text;

interface Props {
  readonly value: unknown;
  readonly write: (next: Action, label: string, key?: string) => void;
  /** The game's actions, once its scripts have run; a list's item also takes its entry's. */
  readonly actions: readonly string[];
  readonly screens: readonly string[];
  readonly problems: readonly { readonly message: string }[];
  readonly canEdit: boolean;
}

export function ActionField({ value, write, actions, screens, problems, canEdit }: Props) {
  const id = useUniqueId();
  const action: Action = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Action) : {};
  const does = doesOf(action);
  const choose = (field: string, choices: readonly string[], names: Readonly<Record<string, string>> = {}) => {
    const held = typeof action[field] === 'string' ? (action[field] as string) : '';
    return (
      <select
        id={`${id}-${field}`}
        class="field form-select"
        value={held}
        disabled={!canEdit}
        onChange={(event) => write({ ...action, [field]: event.currentTarget.value }, 'its action')}
      >
        {held === '' || !choices.includes(held) ? (
          <option value={held}>{held === '' ? 'Choose…' : `${held} (not one of them)`}</option>
        ) : null}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {names[choice] ?? choice}
          </option>
        ))}
      </select>
    );
  };
  return (
    <fieldset class="form-group">
      <legend class="form-legend">Action</legend>
      <div class="form-field">
        <label class="form-label" for={`${id}-does`}>
          It
        </label>
        <select
          id={`${id}-does`}
          class="field form-select"
          value={does}
          disabled={!canEdit}
          onChange={(event) => write(fresh(event.currentTarget.value as Does, actions, screens), 'its action')}
        >
          {(Object.keys(DOES) as Does[]).map((each) => (
            <option key={each} value={each}>
              {DOES[each]}
            </option>
          ))}
        </select>
      </div>
      {does === 'take' ? (
        <div class="form-field">
          <label class="form-label" for={`${id}-take`}>
            Action to take
          </label>
          {choose('take', actions)}
        </div>
      ) : null}
      {does === 'open' ? (
        <div class="form-field">
          <label class="form-label" for={`${id}-open`}>
            Screen to open
          </label>
          {choose('open', screens)}
        </div>
      ) : null}
      {does === 'shell' ? (
        <div class="form-field">
          <label class="form-label" for={`${id}-shell`}>
            Where to
          </label>
          {choose('shell', SHELL_GOES, SHELL_NAMES)}
        </div>
      ) : null}
      {does === 'take' ? <Args action={action} write={write} canEdit={canEdit} /> : null}
      <FieldNotes id={id} info={{}} shown={problems} />
    </fieldset>
  );
}

/** A take's arguments, each a name and a value, in the order written. */
function Args({ action, write, canEdit }: Pick<Props, 'write' | 'canEdit'> & { readonly action: Action }) {
  const id = useUniqueId();
  const args = typeof action.args === 'object' && action.args !== null ? (action.args as Record<string, unknown>) : {};
  const entries = Object.entries(args);
  const withArgs = (next: [string, unknown][]) => {
    const { args: _, ...rest } = action;
    return next.length === 0 ? rest : { ...rest, args: Object.fromEntries(next) };
  };
  return (
    <div class="designer-args">
      <p class="form-label">Arguments</p>
      {entries.length === 0 ? <p class="muted">None: the first of these on offer is taken.</p> : null}
      {entries.map(([name, value], i) => (
        <div key={i} class="designer-arg">
          <label class="visually-hidden" for={`${id}-name-${i}`}>{`Argument ${i + 1} name`}</label>
          <DraftInput
            id={`${id}-name-${i}`}
            stored={name}
            canEdit={canEdit}
            placeholder="name"
            write={(typed) =>
              write(withArgs(entries.map(([k, v], j) => [j === i ? typed : k, v])), 'an argument', `arg-name-${i}`)
            }
          />
          <label class="visually-hidden" for={`${id}-value-${i}`}>{`Argument ${i + 1} value`}</label>
          <DraftInput
            id={`${id}-value-${i}`}
            stored={String(value)}
            canEdit={canEdit}
            placeholder="value"
            write={(typed) =>
              write(
                withArgs(entries.map(([k, v], j) => [k, j === i ? argOf(typed) : v])),
                'an argument',
                `arg-value-${i}`,
              )
            }
          />
          <button
            type="button"
            class="button"
            disabled={!canEdit}
            aria-label={`Remove argument ${i + 1}`}
            onClick={() => write(withArgs(entries.filter((_, j) => j !== i)), 'an argument')}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        class="button"
        disabled={!canEdit}
        onClick={() => write(withArgs([...entries, [`arg${entries.length + 1}`, '']]), 'an argument')}
      >
        Add argument
      </button>
    </div>
  );
}
