import { signal } from '@preact/signals';
import { useMemo, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { step } from '../editing/step.ts';
import { chosen } from '../forms/selection.ts';
import { addStarterKitAction } from '../models/actions.ts';
import type { OpenProject } from '../projects/opened.ts';
import '../styles/assets.css';
import { AssetTile } from './AssetTile.tsx';
import { logAction, standInAction } from './assetActions.ts';
import { deleteAssets } from './assetEdits.ts';
import { ALL_ASSETS, type AssetView, assetProblems, assetRows, type KindFilter, shownRows } from './assetList.ts';
import { EntryForm } from './EntryForm.tsx';
import { ImportForm } from './ImportForm.tsx';
import { today } from './media.ts';
import { pickFiles } from './pickFiles.ts';

/** Tiles shown at first and added by each "Show more": a page a phone draws quickly. */
const PAGE = 100;

/** The view kept while the panel is away, as the Records panel keeps its tables' (M2.5). */
const view = signal<AssetView>(ALL_ASSETS);

const KINDS: readonly [KindFilter, string][] = [
  ['all', 'Every kind'],
  ['image', 'Images'],
  ['audio', 'Sounds'],
  ['model', '3D models'],
  ['font', 'Fonts'],
  ['other', 'Other files'],
];

type Doing = { kind: 'import'; files: readonly File[] } | { kind: 'log' } | { kind: 'stand-in' } | null;

const files = (count: number) => (count === 1 ? '1 file' : `${count} files`);
const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true;

/** The Assets panel's body: its tools, what needs doing, and the grid. */
export function AssetBrowser({ project }: { project: OpenProject }) {
  const canEdit = editing.access.value.kind === 'editing';
  const [doing, setDoing] = useState<Doing>(null);
  const [dropping, setDropping] = useState(false);
  const { catalog } = project;
  const problems = useMemo(() => assetProblems(catalog), [catalog]);
  const rows = useMemo(() => assetRows(catalog, problems), [catalog, problems]);
  const unlogged = rows.filter((row) => row.problems.some((p) => p.code === 'E019')).map((row) => row.path);
  const close = () => setDoing(null);
  const importFiles = (chosenFiles: readonly File[]) => setDoing({ kind: 'import', files: chosenFiles });
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping files is a desktop shortcut for Import files, the button keyboards, screen readers and phones use
    <div
      class={dropping ? 'asset-browser dropping' : 'asset-browser'}
      onDragOver={(event) => {
        if (!canEdit || !hasFiles(event)) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        setDropping(false);
        const dropped = [...(event.dataTransfer?.files ?? [])];
        if (!canEdit || dropped.length === 0) return;
        event.preventDefault();
        importFiles(dropped);
      }}
    >
      {canEdit ? (
        <div class="form-actions">
          <button
            type="button"
            class="button primary"
            onClick={() => pickFiles({ multiple: true }, (picked) => importFiles(picked))}
          >
            Import files
          </button>
          <button type="button" class="button" onClick={() => setDoing({ kind: 'stand-in' })}>
            New stand-in
          </button>
          <button type="button" class="button" onClick={() => void addStarterKitAction()}>
            Add starter kit
          </button>
        </div>
      ) : null}
      {doing?.kind === 'import' ? <ImportForm project={project} files={doing.files} close={close} /> : null}
      {doing?.kind === 'stand-in' ? <StandInForm close={close} /> : null}
      {problems.log.map((problem) => (
        <p key={problem.message} class="field-problem">
          assets/assets.json: {problem.message}
        </p>
      ))}
      {unlogged.length > 0 ? (
        <div class="asset-notice">
          <p>
            {files(unlogged.length)} {unlogged.length === 1 ? 'has' : 'have'} no provenance, so the project won’t build
            until {unlogged.length === 1 ? 'it has' : 'they have'} some.
          </p>
          {canEdit && doing?.kind !== 'log' ? (
            <button type="button" class="button" onClick={() => setDoing({ kind: 'log' })}>
              Log their provenance
            </button>
          ) : null}
        </div>
      ) : null}
      {doing?.kind === 'log' && unlogged.length > 0 ? (
        <EntryForm
          catalog={catalog}
          heading={`Provenance for ${files(unlogged.length)}`}
          paths={unlogged}
          initial={{ date: today() }}
          goLabel={`Log ${files(unlogged.length)}`}
          go={async (entry) => {
            const done = await logAction(unlogged, entry);
            if (done) close();
            return done;
          }}
          cancel={close}
        >
          <p class="muted mono">{unlogged.join(', ')}</p>
        </EntryForm>
      ) : null}
      {problems.orphans.length > 0 ? (
        <div class="asset-notice">
          <p>
            assets/assets.json logs {files(problems.orphans.length)} that{' '}
            {problems.orphans.length === 1 ? 'isn’t' : 'aren’t'} in assets/:{' '}
            <span class="mono">{problems.orphans.join(', ')}</span>
          </p>
          {canEdit ? (
            <button
              type="button"
              class="button"
              onClick={() =>
                void step(
                  `Remove ${problems.orphans.length === 1 ? 'an entry' : 'entries'} for missing files`,
                  (copy) => deleteAssets(copy, problems.orphans),
                )
              }
            >
              Remove {problems.orphans.length === 1 ? 'the entry' : 'those entries'}
            </button>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p class="muted">
          No assets yet. Import images, sounds, 3D models or fonts{canEdit ? ', drop them here' : ''}, or make a
          stand-in to fill in until the art is ready.
        </p>
      ) : (
        <AssetGrid project={project} rows={rows} />
      )}
    </div>
  );
}

function AssetGrid({ project, rows }: { project: OpenProject; rows: ReturnType<typeof assetRows> }) {
  const search = useUniqueId();
  const kind = useUniqueId();
  const [limit, setLimit] = useState(PAGE);
  const now = view.value;
  const shown = shownRows(rows, now);
  const set = (next: Partial<AssetView>) => {
    view.value = { ...now, ...next };
    setLimit(PAGE);
  };
  const pick = chosen.value;
  return (
    <>
      <div class="asset-tools">
        <label class="visually-hidden" for={search}>
          Search assets
        </label>
        <input
          id={search}
          class="field asset-search"
          type="search"
          placeholder="Search names, licences, sources"
          value={now.search}
          onInput={(event) => set({ search: event.currentTarget.value })}
        />
        <label class="visually-hidden" for={kind}>
          Kind
        </label>
        <select
          id={kind}
          class="field"
          value={now.kind}
          onChange={(event) => set({ kind: event.currentTarget.value as KindFilter })}
        >
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label class="asset-check">
          <input
            type="checkbox"
            class="form-check"
            checked={now.troubled}
            onChange={(event) => set({ troubled: event.currentTarget.checked })}
          />
          With problems
        </label>
      </div>
      <p class="muted asset-count">
        {shown.length === rows.length ? files(rows.length) : `${shown.length} of ${files(rows.length)}`}
      </p>
      <ul class="asset-grid">
        {shown.slice(0, limit).map((row) => (
          <AssetTile
            key={row.path}
            project={project}
            row={row}
            current={pick?.kind === 'asset' && pick.path === row.path}
          />
        ))}
      </ul>
      {shown.length > limit ? (
        <div class="form-actions">
          <button type="button" class="button" onClick={() => setLimit(limit + PAGE)}>
            Show {Math.min(PAGE, shown.length - limit)} more
          </button>
        </div>
      ) : null}
    </>
  );
}

/** A stand-in (D34): the name it stands in for, drawn on a colour from that name. */
function StandInForm({ close }: { close: () => void }) {
  const id = useUniqueId();
  const [label, setLabel] = useState('');
  const [tried, setTried] = useState(false);
  const empty = label.trim() === '';
  const make = async () => {
    setTried(true);
    if (!empty && (await standInAction(label, today()))) close();
  };
  return (
    <section class="entry-form" aria-labelledby={`${id}-head`}>
      <h3 id={`${id}-head`}>New stand-in</h3>
      <div class="form-field">
        <div class="form-label-row">
          <label class="form-label" for={id}>
            What it stands in for
          </label>
        </div>
        <input
          id={id}
          class="field form-input"
          type="text"
          autoComplete="off"
          placeholder="Flamma’s portrait"
          value={label}
          aria-invalid={tried && empty ? 'true' : undefined}
          aria-describedby={tried && empty ? `${id}-problem` : `${id}-help`}
          onInput={(event) => setLabel(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void make();
          }}
        />
        {tried && empty ? (
          <p id={`${id}-problem`} class="field-problem">
            Write what it stands in for
          </p>
        ) : (
          <p id={`${id}-help`} class="form-help">
            Drawn as an image with these words, logged as a stand-in until real art replaces it.
          </p>
        )}
      </div>
      <div class="form-actions">
        <button type="button" class="button primary" onClick={() => void make()}>
          Make stand-in
        </button>
        <button type="button" class="button" onClick={close}>
          Cancel
        </button>
      </div>
    </section>
  );
}
