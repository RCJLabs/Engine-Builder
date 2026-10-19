import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { OpenProject } from '../projects/opened.ts';
import { noteError } from './state.ts';

type CalendarModule = typeof import('./ProjectCalendar.tsx');

/**
 * The calendar's form, loaded once a project has Time on (M3.5): it brings the record form's
 * fields with it, which the start leaves to the inspector, as the Logic panel's sheets do.
 */
const calendarModule = signal<CalendarModule | null>(null);
let loading = false;

function loadCalendar(): void {
  if (loading) return;
  loading = true;
  import('./ProjectCalendar.tsx').then(
    (module) => {
      calendarModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The calendar’s form couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}

export function CalendarSlot({ project }: { project: OpenProject }) {
  useEffect(loadCalendar, []);
  const ProjectCalendar = calendarModule.value?.ProjectCalendar;
  return ProjectCalendar ? <ProjectCalendar project={project} /> : <p class="muted">Opening the calendar…</p>;
}
