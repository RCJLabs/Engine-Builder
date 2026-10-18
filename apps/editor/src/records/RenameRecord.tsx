import { formatRef, isRecordId } from '@eb/core';
import { useMemo } from 'preact/hooks';
import { slugify } from '../forms/labels.ts';
import type { OpenProject } from '../projects/opened.ts';
import { RenameForm } from '../types/RenameForm.tsx';
import { conditionMentions } from '../types/rewrites.ts';
import { renameRecordAction } from '../types/typeActions.ts';
import { usersOf } from './recordIndex.ts';

const records = (count: number) => (count === 1 ? '1 record' : `${count} records`);

/**
 * A record's id changed (M2.6, D33): its file moves, and every reference to it follows. The
 * conditions that mention the id as a word are listed, since they aren't changed: the editor
 * doesn't know the game's facts, so it can't tell which of their words are ids.
 */
export function RenameRecord(props: { project: OpenProject; type: string; id: string; close: () => void }) {
  const { project, type, id, close } = props;
  const { catalog, index } = project;
  const others = (catalog.records.get(type) ?? []).filter((each) => each !== id);
  const users = index ? usersOf(index, formatRef(type, id)).length : 0;
  const mentions = useMemo(() => {
    if (!index) return [];
    const found: string[] = [];
    for (const record of index.records.values()) {
      const file = catalog.types.get(record.type)?.file;
      if (file && conditionMentions(file, record.value, id).length > 0) found.push(record.key);
    }
    return found;
  }, [index, catalog, id]);
  return (
    <div class="rename-record">
      <RenameForm
        label={`New id for ${id}`}
        initial={id}
        shape={slugify}
        check={(name) =>
          !isRecordId(name) ? 'Use letters or digits' : others.includes(name) ? `${name} is taken` : null
        }
        said={(name) =>
          `Saved as records/${type}/${name}.json${users > 0 ? `; the ${records(users)} that refer to it follow` : ''}.`
        }
        done={(name) => {
          close();
          void renameRecordAction(type, id, name);
        }}
        cancel={close}
      />
      {mentions.length > 0 ? (
        <p class="form-help">
          Conditions in {mentions.join(', ')} mention {id}. The editor can’t tell whether they name this record, so they
          stay as they are.
        </p>
      ) : null}
    </div>
  );
}
