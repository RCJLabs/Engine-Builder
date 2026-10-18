/** The browser's file picker for assets: the Import button's, and Replace's in the inspector. */

let input: HTMLInputElement | null = null;
let then: ((files: File[]) => void) | null = null;

/** Asks for files and hands them on. Browsers open the picker only from a tap, click or key press. */
export function pickFiles(options: { multiple: boolean; accept?: string }, chosen: (files: File[]) => void): void {
  if (!input) {
    // One input, kept in the page: some mobile browsers drop the change event of a detached one.
    input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.setAttribute('aria-label', 'Files to import');
    input.addEventListener('change', () => {
      const files = [...(input?.files ?? [])];
      if (input) input.value = '';
      if (files.length > 0) then?.(files);
    });
    document.body.append(input);
  }
  input.multiple = options.multiple;
  input.accept = options.accept ?? '';
  then = chosen;
  input.click();
}
