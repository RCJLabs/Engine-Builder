/**
 * The crash screen (M4.3, docs/specs/shell.md#crash), drawn in plain DOM, without Preact, since the
 * renderer may be what broke (Dirtbag's crash.ts). It covers the page and offers a reload, the save
 * in play exactly as stored, never loaded, and a report to copy. Shown once: what follows a crash
 * is noise.
 */

export interface CrashContext {
  readonly game: string;
  readonly build: string;
  readonly slot?: string;
  readonly turn?: number;
  /** The slot's save as stored. */
  readonly raw?: () => Promise<string | undefined>;
}

// The browser's own notices that aren't the game's errors (Dirtbag's crash.ts).
const NOISE = [/ResizeObserver loop/i, /^Script error\.?$/i];
export const isNoise = (message: string): boolean => NOISE.some((pattern) => pattern.test(message));

let showing: HTMLElement | undefined;

/** The report a player copies: what failed, and where. */
export function crashReport(message: string, context: CrashContext): string {
  const where = [
    `Game: ${context.game}`,
    `Build: ${context.build}`,
    ...(context.slot ? [`Slot: ${context.slot}`] : []),
    ...(context.turn !== undefined ? [`Step: ${context.turn}`] : []),
  ];
  return [`What failed: ${message}`, ...where].join('\n');
}

function button(text: string, act: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'eb-crash-button';
  element.textContent = text;
  element.addEventListener('click', act);
  return element;
}

export function showCrash(message: string, context: CrashContext): void {
  if (showing?.isConnected) return;
  const screen = document.createElement('div');
  screen.className = 'eb-crash';
  screen.setAttribute('role', 'alertdialog');
  screen.setAttribute('aria-modal', 'true');
  screen.setAttribute('aria-labelledby', 'eb-crash-title');
  const heading = document.createElement('h2');
  heading.id = 'eb-crash-title';
  heading.tabIndex = -1;
  heading.textContent = 'The game stopped';
  const why = document.createElement('p');
  why.textContent = 'Something went wrong, and the game can’t go on. It was saved after its last step.';
  const what = document.createElement('p');
  what.className = 'eb-crash-message';
  what.textContent = message;
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const row = document.createElement('div');
  row.className = 'eb-crash-row';
  row.append(button('Reload', () => location.reload()));
  const { raw } = context;
  if (raw) {
    row.append(
      button(
        'Save file',
        () =>
          void raw().then((text) => {
            if (text === undefined) status.textContent = 'There is no save to give.';
            else download(`${context.game}-${context.slot ?? 'save'}.save.json`, text);
          }),
      ),
    );
  }
  const report = crashReport(message, context);
  row.append(
    button(
      'Copy report',
      () =>
        void navigator.clipboard.writeText(report).then(
          () => (status.textContent = 'The report is copied.'),
          () => (status.textContent = report),
        ),
    ),
  );
  screen.append(heading, why, what, row, status);
  // Everything else on the page is out of reach behind it.
  for (const child of document.body.children) child.setAttribute('inert', '');
  document.body.append(screen);
  showing = screen;
  heading.focus();
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Shows the crash screen for any error nothing caught, until the returned function is called. */
export function watchCrashes(context: () => CrashContext): () => void {
  const failed = (message: string) => {
    if (!isNoise(message)) showCrash(message, context());
  };
  const error = (event: ErrorEvent) => failed(event.message || String(event.error));
  const rejection = (event: PromiseRejectionEvent) =>
    failed(event.reason instanceof Error ? event.reason.message : String(event.reason));
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  return () => {
    window.removeEventListener('error', error);
    window.removeEventListener('unhandledrejection', rejection);
  };
}
