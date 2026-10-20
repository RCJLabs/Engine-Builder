/**
 * A play's feedback on the page (M4.2, docs/specs/input.md): the log's lines, the toast showing,
 * and the announcer that speaks each step's lines once. The rules are feedback.ts's; this keeps
 * them in state, step by step, and times the toasts.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Said } from '../format/feedback.ts';
import { type LogLine, logAfter, spokenOf, toastsOf, toastTime } from './feedback.ts';

interface Toast {
  readonly id: number;
  readonly text: string;
}

export interface Fed {
  readonly log: readonly LogLine[];
  readonly toast: Toast | undefined;
  /** The last step's lines as spoken, and how many steps have spoken, so the same words twice still speak. */
  readonly spoken: { readonly text: string; readonly n: number };
}

/** Takes each step's lines once, as `said` changes: a new array each step, however few its lines. */
export function useFeedback(said: readonly Said[]): Fed {
  const [log, setLog] = useState<readonly LogLine[]>([]);
  const [queue, setQueue] = useState<readonly Toast[]>([]);
  const [spoken, setSpoken] = useState({ text: '', n: 0 });
  const next = useRef(0);
  useEffect(() => {
    if (said.length === 0) return;
    setLog((was) => logAfter(was, said));
    const toasts = toastsOf(said).map((text) => ({ id: next.current++, text }));
    if (toasts.length > 0) setQueue((was) => [...was, ...toasts]);
    setSpoken((was) => ({ text: spokenOf(said), n: was.n + 1 }));
  }, [said]);
  const head = queue[0];
  const waiting = queue.length > 1;
  const shownAt = useRef(0);
  useEffect(() => {
    if (head) shownAt.current = performance.now();
  }, [head?.id]);
  useEffect(() => {
    if (!head) return;
    // A toast cut short when others queue keeps the time it has already had.
    const left = toastTime(head.text, waiting) - (performance.now() - shownAt.current);
    const timer = setTimeout(() => setQueue((was) => was.slice(1)), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [head?.id, waiting]);
  return { log, toast: head, spoken };
}

/** The toast showing. Taps go through it, and screen readers hear its words from the announcer instead. */
export function ToastView({ toast }: { readonly toast: Toast | undefined }) {
  return toast ? (
    <div key={toast.id} class="eb-toast" aria-hidden="true">
      {toast.text}
    </div>
  ) : null;
}

/**
 * The one region that speaks: emptied, then filled on the next frame (from Spliceworld's live.js),
 * so the same words twice are still read, and it exists before anything is said in it.
 */
export function Announcer({ spoken }: { readonly spoken: Fed['spoken'] }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (spoken.n === 0) return;
    setText('');
    const frame = requestAnimationFrame(() => setText(spoken.text));
    return () => cancelAnimationFrame(frame);
  }, [spoken]);
  return (
    <div class="eb-sr" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
