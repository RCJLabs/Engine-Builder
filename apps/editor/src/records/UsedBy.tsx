import { classifySpaceFile } from '@eb/compiler';
import { parseRef } from '@eb/core';
import type { Usage } from '@eb/schema';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { Catalog } from '../forms/catalog.ts';
import type { OpenProject } from '../projects/opened.ts';
import { openSpaceAt } from '../spaces/open.ts';
import { openRecord } from './actions.ts';
import { nameIn } from './names.ts';
import { describePath } from './paths.ts';
import type { RecordIndex } from './recordIndex.ts';

/** Records listed before "Show all": enough for most, few enough for a phone. */
const FIRST = 50;

/**
 * The inspector's "used by" (M2.5): every record that refers to this one, each with where, as a
 * button that opens it. References to a record that is gone are kept, so its users can be found.
 */
export function UsedBy({ project, type, id }: { project: OpenProject; type: string; id: string }) {
  return (
    <>
      <Users
        project={project}
        of={(index) => index.usedBy.get(`${type}:${id}`) ?? []}
        none="Nothing refers to this record."
      />
      <PlacedIn project={project} record={`${type}:${id}`} />
    </>
  );
}

/**
 * The spaces and prefabs that place the record, or name it in a component or an override (M5.2),
 * or are drawn under it (an environment, M5.4), each opening there.
 */
function PlacedIn({ project, record }: { project: OpenProject; record: string }) {
  const head = useUniqueId();
  const uses = project.index?.spaceUsers?.get(record) ?? [];
  if (uses.length === 0) return null;
  const places = new Map<string, { file: string; object: string; index: number | undefined }>();
  for (const use of uses) {
    // A space's environment is in no object: it opens with nothing chosen, where its field is.
    const index = use.object === '' ? undefined : Number(use.path.split('/')[2]);
    places.set(`${use.file}#${use.object}`, { file: use.file, object: use.object, index });
  }
  const entries = [...project.catalog.spaces, ...project.catalog.prefabs];
  const title = (file: string) => {
    const role = classifySpaceFile(file);
    if (role.kind !== 'space' && role.kind !== 'prefab') return file;
    const name = entries.find((e) => e.kind === role.kind && e.id === role.id)?.name ?? role.id;
    return `${role.kind === 'space' ? 'Space' : 'Prefab'} ${name}`;
  };
  return (
    <section class="used-by" aria-labelledby={head}>
      <h4 id={head}>
        In spaces <span class="muted">{places.size === 1 ? '1 place' : `${places.size} places`}</span>
      </h4>
      <ul class="used-by-list">
        {[...places.values()].map((place) => (
          <li key={`${place.file}#${place.object}`}>
            <button type="button" class="record-button" onClick={() => openSpaceAt(place.file, place.index)}>
              {title(place.file)}, {place.object === '' ? 'its environment' : place.object}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The records whose asset fields name the file at `path` inside assets/ (M2.7). */
export function AssetUsedBy({ project, path }: { project: OpenProject; path: string }) {
  return <Users project={project} of={(index) => index.assetUsers.get(path) ?? []} none="No record uses this file." />;
}

function Users(props: { project: OpenProject; of: (index: RecordIndex) => readonly Usage[]; none: string }) {
  const { project, of, none } = props;
  const { catalog, index } = project;
  const head = useUniqueId();
  const [all, setAll] = useState(false);
  if (!index) {
    return (
      <section class="used-by" aria-labelledby={head}>
        <h4 id={head}>Used by</h4>
        <p class="muted">Finding what refers to it…</p>
      </section>
    );
  }
  const users = byRecord(of(index));
  const shown = all ? users : users.slice(0, FIRST);
  return (
    <section class="used-by" aria-labelledby={head}>
      <h4 id={head}>
        Used by <span class="muted">{users.length === 1 ? '1 record' : `${users.length} records`}</span>
      </h4>
      {users.length === 0 ? (
        <p class="muted">{none}</p>
      ) : (
        <ul class="used-by-list">
          {shown.map(([from, paths]) => (
            <User key={from} from={from} paths={paths} catalog={catalog} project={project} />
          ))}
        </ul>
      )}
      {users.length > shown.length ? (
        <div class="form-actions">
          <button type="button" class="button" onClick={() => setAll(true)}>
            Show all {users.length}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function User(props: { from: string; paths: readonly string[]; catalog: Catalog; project: OpenProject }) {
  const { from, paths, catalog, project } = props;
  const key = parseRef(from);
  if (!key) return null;
  const file = catalog.types.get(key.type)?.file;
  const name = nameIn(file, project.index?.records.get(from)?.value);
  return (
    <li>
      <button type="button" class="record-button" onClick={() => openRecord(key.type, key.id)}>
        {file?.title ?? key.type} {name ?? key.id}
      </button>{' '}
      <span class="muted">{paths.map((path) => describePath(file, path)).join('; ')}</span>
    </li>
  );
}

/** Usages by the record they come from, in order: each record once, with every place it refers. */
function byRecord(usages: readonly Usage[]): [string, string[]][] {
  const found = new Map<string, string[]>();
  for (const { from, path } of usages) found.set(from, [...(found.get(from) ?? []), path]);
  return [...found];
}
