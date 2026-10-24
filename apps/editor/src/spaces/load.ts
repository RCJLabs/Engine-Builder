import { signal } from '@preact/signals';
import { noteError } from '../app/state.ts';

type SpacesModule = typeof import('./SceneBrowser.tsx');

/**
 * The Scene panel's list, the Outliner and the object form load with a project, as the World
 * panel's maps do (M4.6); the view, with three, loads only once a space is opened.
 */
export const spacesModule = signal<SpacesModule | null>(null);
let loading = false;

export function loadSpaces(): void {
  if (loading) return;
  loading = true;
  import('./SceneBrowser.tsx').then(
    (module) => {
      spacesModule.value = module;
    },
    (error: unknown) => {
      loading = false;
      noteError(`The Scene panel couldn’t load: ${error instanceof Error ? error.message : String(error)}`);
    },
  );
}
