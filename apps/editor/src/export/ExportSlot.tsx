import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { noteError } from '../app/state.ts';
import type { OpenProject } from '../projects/opened.ts';

type ExportModule = typeof import('./ExportSection.tsx');

/**
 * The Export section (M4.10), loaded once the Project panel shows a project: it brings the record
 * form's fields and the export code with it, which the start leaves out, as the calendar's form does.
 */
const exportModule = signal<ExportModule | null>(null);
let loading = false;

function loadExport(): void {
  if (loading) return;
  loading = true;
  import('./ExportSection.tsx').then(
    (module) => {
      exportModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The Export section couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

export function ExportSlot({ project }: { project: OpenProject }) {
  useEffect(loadExport, []);
  const ExportSection = exportModule.value?.ExportSection;
  return ExportSection ? <ExportSection project={project} /> : <p class="muted">Opening Export…</p>;
}
