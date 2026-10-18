/**
 * Opening a record's form at a field (M2.8): the Problems panel names a record and a JSON Pointer,
 * and the form, once it shows, focuses the deepest field that holds it, as its problems are shown
 * there (routeProblems). Fields carry their pointer as `data-at` (FieldView).
 */
import { signal } from '@preact/signals';

/** The field a record's form is to focus when it next shows, by its file and pointer. */
export const fieldToFocus = signal<{ readonly file: string; readonly at: string } | null>(null);

/** Focuses the control of the deepest field under `root` holding `at`. False when none does. */
export function focusField(root: ParentNode, at: string): boolean {
  let pointer = at;
  for (;;) {
    const holder = root.querySelector(`[data-at="${CSS.escape(pointer)}"]`);
    const control = holder?.querySelector<HTMLElement>('input, select, textarea, button');
    if (control) {
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: 'center' });
      return true;
    }
    if (pointer === '') return false;
    pointer = pointer.slice(0, pointer.lastIndexOf('/'));
  }
}
