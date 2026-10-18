/**
 * The editor's own errors into its console (M2.8). It sends nothing anywhere (offline always),
 * so the console is where a person sees them, and copies them into a bug report.
 */
import { noteError } from './state.ts';

// Chrome reports a ResizeObserver whose callback resized something again; nothing went wrong.
const HARMLESS = /^ResizeObserver loop/;

const said = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

export function catchErrors(target: Window = window): void {
  target.addEventListener('error', (event) => {
    const text = event.message || said(event.error);
    if (!HARMLESS.test(text)) noteError(`Something went wrong in the editor: ${text}`);
  });
  target.addEventListener('unhandledrejection', (event) => {
    noteError(`Something went wrong in the editor: ${said(event.reason)}`);
  });
}
