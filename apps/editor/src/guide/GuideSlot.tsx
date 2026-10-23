import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { noteError } from '../app/state.ts';
import type { OpenProject } from '../projects/opened.ts';

type GuideModule = typeof import('./GuideSection.tsx');

/** The Make it yours section (M4.11), loaded once the Project panel shows a project, as Export is. */
const guideModule = signal<GuideModule | null>(null);
let loading = false;

function loadGuide(): void {
  if (loading) return;
  loading = true;
  import('./GuideSection.tsx').then(
    (module) => {
      guideModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The guide couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

export function GuideSlot({ project }: { project: OpenProject }) {
  useEffect(loadGuide, []);
  const GuideSection = guideModule.value?.GuideSection;
  return GuideSection ? <GuideSection project={project} /> : null;
}
