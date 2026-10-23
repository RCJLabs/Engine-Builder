/**
 * The forms for what isn't a widget (M4.5): the screen itself (its title, the modes it shows,
 * whether it is modal, and since M4.8 the ambience and music it plays) and a tab (its label). The modes are the game's once its scripts have run,
 * each a box to tick; a mode the file names that the game lacks stays, marked, for the checks.
 */
import type { FieldDef, TypeFile } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { FieldView } from '../forms/FieldView.tsx';
import { FormContext } from '../forms/formContext.ts';
import { changeUnder, formApi, type Part } from './formApi.ts';
import { editFile } from './state.ts';
import { withMode } from './widgets.ts';

type Loose = Record<string, unknown>;

const SCREEN: TypeFile = {
  title: 'screen',
  fields: {
    title: { kind: 'text', optional: true, label: 'Title', description: 'What a screen reader hears as it opens.' },
    modal: { kind: 'bool', optional: true, label: 'Modal: drawn over the screen below' },
    // What the screen plays (M4.8): the topmost screen on the stack that names one wins.
    ambience: {
      kind: 'ref',
      to: 'ambience',
      optional: true,
      label: 'Ambience',
      description: 'What plays underneath while it is up.',
    },
    music: { kind: 'ref', to: 'music', optional: true, label: 'Music' },
  },
};
const TAB: TypeFile = {
  title: 'tab',
  fields: { label: { kind: 'text', label: 'Label', description: 'Facts in braces.' } },
};

export function ScreenForm(
  props: Omit<Part, 'typeFile' | 'at'> & { readonly screen: Loose; readonly modes: readonly string[] },
) {
  const { screen } = props;
  const api = formApi({ ...props, at: '', typeFile: SCREEN });
  const field = (name: 'title' | 'modal' | 'ambience' | 'music') => {
    const def = SCREEN.fields[name] as FieldDef;
    return <FieldView label={def.label ?? name} def={def} info={def} path={[name]} value={screen[name]} />;
  };
  return (
    <FormContext.Provider value={api}>
      <div class="designer-form" data-at="">
        {field('title')}
        <Shows {...props} />
        {field('modal')}
        {field('ambience')}
        {field('music')}
      </div>
    </FormContext.Provider>
  );
}

/** The modes the screen is for, ticked from the game's. None: opened only by a button. */
function Shows(props: Omit<Part, 'typeFile' | 'at'> & { readonly screen: Loose; readonly modes: readonly string[] }) {
  const id = useUniqueId();
  const shows = Array.isArray(props.screen.shows)
    ? props.screen.shows.filter((m): m is string => typeof m === 'string')
    : [];
  const modes = [...props.modes, ...shows.filter((mode) => !props.modes.includes(mode))];
  const problems = props.problems.filter((p) => p.path === '/shows' || p.path.startsWith('/shows/'));
  const tick = (mode: string, on: boolean) =>
    editFile(
      props.file,
      `Edit the modes it shows in ${props.title}`,
      changeUnder('', ['shows'], () => withMode(shows, mode, on)),
    );
  return (
    <fieldset class="form-group">
      <legend class="form-legend">Shows in the modes</legend>
      {modes.length === 0 ? (
        <p class="muted">The game’s modes are known once its scripts have run.</p>
      ) : (
        modes.map((mode, i) => (
          <div class="form-bool" key={mode}>
            <input
              id={`${id}-${i}`}
              type="checkbox"
              class="form-check"
              checked={shows.includes(mode)}
              disabled={!props.canEdit}
              onChange={(event) => tick(mode, event.currentTarget.checked)}
            />
            <label for={`${id}-${i}`} class="form-label">
              {props.modes.includes(mode) ? mode : `${mode} (the game has none)`}
            </label>
          </div>
        ))
      )}
      <p class="form-help">None ticked: the screen is opened only by a button.</p>
      {problems.map((p) => (
        <p key={p.path + p.code} class="field-problem">
          {p.message}
        </p>
      ))}
    </fieldset>
  );
}

export function TabForm(props: Omit<Part, 'typeFile'> & { readonly tab: Loose }) {
  const api = formApi({ ...props, typeFile: TAB });
  const def = TAB.fields.label as FieldDef;
  return (
    <FormContext.Provider value={api}>
      <div class="designer-form" data-at={props.at}>
        <FieldView label="Label" def={def} info={def} path={['label']} value={props.tab.label} />
      </div>
    </FormContext.Provider>
  );
}
