import { parseRef } from '@eb/core';
import type { Usage } from '@eb/schema';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import type { Catalog } from '../forms/catalog.ts';
import type { OpenProject } from '../projects/opened.ts';
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
    <Users
      project={project}
      of={(index) => index.usedBy.get(`${type}:${id}`) ?? []}
      none="Nothing refers to this record."
    />
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
