/**
 * A stage that threw, said over its box (M7.4, D86, docs/specs/stages.md#where-it-runs): its message,
 * and the file and line it came from, as an alert a screen reader reads out, and in the console the
 * editor's Console panel shows. The space goes on: its walkers, clock and use buttons keep working.
 */

/** The words for a stage's error: its message, then where. */
export const stageErrorText = (message: string, file?: string, line?: number): string =>
  file === undefined ? message : `${message} (${file}${line !== undefined ? `:${line}` : ''})`;

export function showStageError(box: HTMLElement, text: string): () => void {
  const alert = document.createElement('p');
  alert.className = 'eb-stage-error';
  alert.setAttribute('role', 'alert');
  alert.textContent = `The stage stopped: ${text}`;
  Object.assign(alert.style, {
    position: 'absolute',
    left: '8px',
    right: '8px',
    top: '8px',
    margin: '0',
    padding: '8px 12px',
    background: '#2a0d0d',
    color: '#ffd9d9',
    border: '1px solid #ff8a8a',
    borderRadius: '6px',
    font: '14px/1.4 system-ui, sans-serif',
    overflowWrap: 'anywhere',
    pointerEvents: 'none',
  });
  box.append(alert);
  console.error(`The stage stopped: ${text}`);
  return () => alert.remove();
}
