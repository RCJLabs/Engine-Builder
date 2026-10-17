import { log } from './state.ts';

/** The editor's log. Docked, it is a plain block: the dock's group is already a region named Console. */
export function Console({ docked = false }: { docked?: boolean }) {
  const lines = (
    <>
      <h2 class="console-title">Console</h2>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the log scrolls, so keyboard users must reach it (axe scrollable-region-focusable) */}
      <ol class="console-lines" aria-live="polite" aria-label="Console messages" tabIndex={0}>
        {log.value.map((line) => (
          <li key={line.id}>
            <time>{line.at}</time> {line.text}
          </li>
        ))}
      </ol>
    </>
  );
  return docked ? (
    <div class="console">{lines}</div>
  ) : (
    <section class="console" aria-label="Console">
      {lines}
    </section>
  );
}
