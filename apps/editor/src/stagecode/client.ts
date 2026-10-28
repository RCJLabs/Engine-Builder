/**
 * The page's end of a stage's worker (M7.4, D86, docs/specs/stages.md#where-it-runs): the worker
 * started from the copy inlined in stage2d.js, the canvas handed over, and frames sent one at a time:
 * `frame` sends only once the last was answered, so a slow stage drops frames and never queues them.
 * An SVG the stage asks for is decoded here, where the browser can.
 */
import type { Drew, Frame, Start } from './api.ts';
import type { FromStage, ToStage } from './protocol.ts';
import StageWorker from './stage.worker.ts?worker&inline';
import { svgBitmap } from './svgImage.ts';

export interface StageClient {
  /** The worker has answered the last frame, so it takes another. */
  idle(): boolean;
  /** Sends the frame if the worker has answered the last; whether it did. */
  frame(frame: Frame): boolean;
  stop(): void;
}

export interface StageAnswers {
  started(): void;
  drew(uses: Drew['uses'] | undefined, ms: number, picked?: Drew['picked']): void;
  failed(message: string, file?: string, line?: number): void;
}

export function startStageWorker(
  canvas: OffscreenCanvas,
  files: Readonly<Record<string, string>>,
  entry: string,
  start: Start,
  answers: StageAnswers,
): StageClient {
  const worker = new StageWorker();
  let busy = true;
  let stopped = false;
  const send = (message: ToStage, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
  worker.onmessage = ({ data }: MessageEvent<FromStage>) => {
    if (stopped) return;
    if (data.kind === 'started') {
      busy = false;
      answers.started();
    } else if (data.kind === 'drew') {
      busy = false;
      answers.drew(data.uses, data.ms, data.picked);
    } else if (data.kind === 'svg') {
      svgBitmap(data.text, data.w, data.h).then(
        (image) => send({ kind: 'svg', id: data.id, image }, [image]),
        (error: unknown) =>
          send({ kind: 'svg', id: data.id, error: error instanceof Error ? error.message : String(error) }),
      );
    } else {
      stopped = true;
      worker.terminate();
      answers.failed(data.message, data.file, data.line);
    }
  };
  worker.onerror = (event) => {
    event.preventDefault();
    if (stopped) return;
    stopped = true;
    worker.terminate();
    answers.failed(event.message || 'The stage’s worker stopped');
  };
  send({ kind: 'start', canvas, files, entry, start }, [canvas]);
  return {
    idle: () => !busy && !stopped,
    frame(frame) {
      if (busy || stopped) return false;
      busy = true;
      send({ kind: 'frame', frame });
      return true;
    },
    stop() {
      stopped = true;
      worker.terminate();
    },
  };
}
