/** The browser's file picker for a zip, shared by the Import button and the palette. */
import { importZip } from './session.ts';

let input: HTMLInputElement | null = null;

/** Asks for a zip and imports it. Browsers open the picker only from a tap, click or key press. */
export function pickZip(): void {
  if (!input) {
    // One input, kept in the page: some mobile browsers drop the change event of a detached one.
    input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.hidden = true;
    input.setAttribute('aria-label', 'Zip to import');
    input.addEventListener('change', () => {
      const file = input?.files?.[0];
      if (input) input.value = '';
      if (file) void importZip(file);
    });
    document.body.append(input);
  }
  input.click();
}
