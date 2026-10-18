/**
 * The provenance of an asset as a form (D34, M2.7), with the record form's own fields (M2.4):
 * over its entry in assets/assets.json in the inspector, each box a step undo takes back, or over
 * an entry in no file yet while files are imported, logged or replaced.
 */
import { ASSETS_LOG } from '@eb/compiler';
import { type Diagnostic, LICENCES, licenceOf, type TypeFile } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { step } from '../editing/step.ts';
import type { Catalog } from '../forms/catalog.ts';
import { describedBy, FieldShell } from '../forms/FieldShell.tsx';
import { FieldView } from '../forms/FieldView.tsx';
import { type FormApi, pointerOf, useForm, useShownProblems } from '../forms/formContext.ts';
import { setProvenance, updateProvenance } from './assetEdits.ts';
import { logPointer } from './assetList.ts';
import { entryWith } from './entries.ts';

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (entry: Json, key: string) => (typeof entry[key] === 'string' ? entry[key] : undefined);

// The fields read nothing from it: a provenance entry has no record type.
const NO_TYPE: TypeFile = { title: '', fields: {} };

/** A form over the entry for `path` in the log: each box a step, typing in one joining into one. */
export function logForm(catalog: Catalog, path: string, canEdit: boolean, problems: readonly Diagnostic[]): FormApi {
  return {
    canEdit,
    catalog,
    typeFile: NO_TYPE,
    id: path,
    problemsAt: (pointer) => problems.filter((problem) => problem.path === pointer),
    set: (at, next, label) =>
      void step(
        `Edit ${label} of ${path}`,
        (copy) => setProvenance(copy, ['files', path, ...at], next),
        `${ASSETS_LOG}#${logPointer(path, pointerOf(at))}`,
      ),
    update: (at, make, said) =>
      void step(`${said} in ${path}`, (copy) => updateProvenance(copy, ['files', path, ...at], make)),
  };
}

/** A form over an entry in no file yet, kept by its owner: the browser's own undo while typing (FormApi.ownUndo). */
export function localForm(
  catalog: Catalog,
  entry: unknown,
  change: (next: Json) => void,
  problems: readonly Diagnostic[],
): FormApi {
  return {
    canEdit: true,
    ownUndo: true,
    catalog,
    typeFile: NO_TYPE,
    id: 'new-provenance',
    problemsAt: (pointer) => problems.filter((problem) => problem.path === pointer),
    set: (at, next) => change(entryWith(entry, at, next)),
    update: (at, make) => {
      let now: unknown = entry;
      for (const key of at) now = isObject(now) || Array.isArray(now) ? (now as Json)[key] : undefined;
      change(entryWith(entry, at, make(now)));
    },
  };
}

/** The licence, from the fixed list (D34), with what it allows and asks under it. One written by hand off the list shows as refused. */
function LicenceField({ value }: { value: string | undefined }) {
  const form = useForm();
  const id = useUniqueId();
  const { shown, onFocus, onBlur } = useShownProblems(form.problemsAt('/licence'));
  const licence = value === undefined ? undefined : licenceOf(value);
  const info = { description: licence?.note ?? 'Only these pass: each lets a game that uses the file be sold.' };
  return (
    <FieldShell id={id} label="Licence" info={info} shown={shown}>
      <select
        id={id}
        class="field form-select"
        value={value ?? ''}
        disabled={!form.canEdit}
        aria-invalid={shown.length > 0 ? 'true' : undefined}
        aria-describedby={describedBy(id, info, shown)}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => form.set(['licence'], event.currentTarget.value || undefined, 'Licence')}
      >
        {value === undefined ? <option value="">Choose a licence…</option> : null}
        {value !== undefined && !licence ? <option value={value}>{value} (refused)</option> : null}
        {LICENCES.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.name}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** The entry's boxes, inside a FormContext: generated art's tool and prompt show once they are asked for or written. */
export function ProvenanceFields({ entry, withEdits }: { entry: unknown; withEdits: boolean }) {
  const given = isObject(entry) ? entry : {};
  const licence = text(given, 'licence');
  const credit = licence !== undefined && licenceOf(licence)?.credit === true;
  const generated = licence === 'generated' || given.tool !== undefined || given.prompt !== undefined;
  return (
    <>
      <LicenceField value={licence} />
      <FieldView
        label="Made by"
        def={{ kind: 'text' }}
        info={{
          optional: !credit,
          description: credit ? 'Its licence asks for credit: name them as they ask to be credited.' : 'Who made it.',
        }}
        path={['author']}
        value={given.author}
      />
      <FieldView
        label="Where it came from"
        def={{ kind: 'text', min: 1 }}
        info={{ description: 'A link, or words: “Drawn for this game”, “Kenney’s UI pack”.' }}
        path={['source']}
        value={given.source}
      />
      <FieldView
        label="Date"
        def={{ kind: 'text' }}
        info={{ description: 'When it came into the project, as YYYY-MM-DD.' }}
        path={['date']}
        value={given.date}
      />
      {generated ? (
        <>
          <FieldView
            label="Tool"
            def={{ kind: 'text' }}
            info={{ optional: licence !== 'generated', description: 'What made it, with its version.' }}
            path={['tool']}
            value={given.tool}
          />
          <FieldView
            label="Prompt"
            def={{ kind: 'text', multiline: true }}
            info={{ optional: licence !== 'generated', description: 'What the tool was asked, as asked.' }}
            path={['prompt']}
            value={given.prompt}
          />
        </>
      ) : null}
      {withEdits ? (
        <FieldView
          label="Hand edits"
          def={{ kind: 'list', of: { kind: 'text', min: 1 } }}
          info={{ optional: true, description: 'What was changed by hand since, oldest first.' }}
          path={['edits']}
          value={given.edits}
        />
      ) : null}
    </>
  );
}
