import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { OpenProject } from '../projects/opened.ts';
import { noteError } from './state.ts';

type FightingModule = typeof import('./ProjectFighting.tsx');

/**
 * Fighting's form, loaded once a project has the fighting kit on (M6.4): it brings the record
 * form's fields with it, which the start leaves to the inspector, as the calendar's does.
 */
const fightingModule = signal<FightingModule | null>(null);
let loading = false;

function loadFighting(): void {
  if (loading) return;
  loading = true;
  import('./ProjectFighting.tsx').then(
    (module) => {
      fightingModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The fighting form couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

export function FightingSlot({ project }: { project: OpenProject }) {
  useEffect(loadFighting, []);
  const ProjectFighting = fightingModule.value?.ProjectFighting;
  return ProjectFighting ? <ProjectFighting project={project} /> : <p class="muted">Opening fighting…</p>;
}
