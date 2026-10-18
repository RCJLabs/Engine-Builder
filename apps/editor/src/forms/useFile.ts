import { useEffect, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { type OpenProject, revision } from '../projects/opened.ts';
import { type LoadedRecord, loadRecord } from './recordEdits.ts';

/**
 * A JSON file of the open project as it is now, for a record's form or a type's designer (M2.6):
 * read again after every change, and when this tab starts or stops editing. Null until first read.
 */
export function useFile(project: OpenProject, file: string): LoadedRecord | null {
  const [loaded, setLoaded] = useState<LoadedRecord | null>(null);
  const changes = revision.value;
  const access = editing.access.value.kind;
  useEffect(() => {
    let live = true;
    void loadRecord(project.source, file).then((read) => {
      if (live) setLoaded(read);
    });
    return () => {
      live = false;
    };
  }, [project.source, file, changes, access]);
  return loaded;
}
