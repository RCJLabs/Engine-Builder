/**
 * A stage run in its worker (M7.4, D86, docs/specs/stages.md#where-it-runs): its files loaded with
 * `"eb/stage"` answered, `start` called once, then each frame drawn on the canvas with the context's
 * transform set to the frame's pixel ratio, the canvas sized to the box first. A stage that throws is
 * stopped, its error said with its file and line; nothing more is drawn. stage.worker.ts wires this
 * to the worker's messages; the tests hand it a stand-in canvas.
 */
import { asStageError, loadStage } from '@eb/script/stage-load';
import type { Drew, Frame, StageDef } from './api.ts';
import type { FromStage, ToStage } from './protocol.ts';

/** What `"eb/stage"` answers at run time. */
export interface StageModule {
  readonly defineStage: (stage: StageDef) => StageDef;
  readonly svg: (text: string, w: number, h: number) => Promise<ImageBitmap>;
}

/** The context's calls a run makes itself, as a stand-in canvas has them. */
interface Context {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  save(): void;
  restore(): void;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): unknown;
}

export interface StageRunner {
  /** A message from the page; returns nothing, as each answer goes by `post`. */
  take(message: ToStage): void;
}

/** A run of one stage, answering by `post`, timing frames by `now` (performance.now in the worker). */
export function createStageRunner(post: (message: FromStage) => void, now: () => number): StageRunner {
  let stage: StageDef | undefined;
  let canvas: CanvasLike | undefined;
  let g: Context | undefined;
  let stopped = false;
  let asked = 0;
  const waiting = new Map<number, { resolve(image: ImageBitmap): void; reject(error: Error): void }>();

  const fail = (error: unknown) => {
    stopped = true;
    const { message, file, line } = asStageError(error);
    post({ kind: 'failed', message, ...(file !== undefined ? { file } : {}), ...(line !== undefined ? { line } : {}) });
  };
  const api: StageModule = {
    defineStage: (defined) => defined,
    svg: (text, w, h) =>
      new Promise((resolve, reject) => {
        const id = ++asked;
        waiting.set(id, { resolve, reject });
        post({ kind: 'svg', id, text, w, h });
      }),
  };

  const start = (message: Extract<ToStage, { kind: 'start' }>) => {
    canvas = message.canvas as unknown as CanvasLike;
    g = canvas.getContext('2d') as Context;
    const exports = loadStage(new Map(Object.entries(message.files)), message.entry, api);
    const defined = (exports.default ?? exports.stage) as StageDef | undefined;
    if (typeof defined?.frame !== 'function')
      throw new Error(`stages/${message.entry}.ts has no stage: export default defineStage({ frame(g, f) { … } })`);
    stage = defined;
    stage.start?.(message.start);
    post({ kind: 'started' });
  };

  const frame = (f: Frame) => {
    if (!stage || !canvas || !g) return;
    const [w, h] = [Math.max(1, Math.round(f.w * f.dpr)), Math.max(1, Math.round(f.h * f.dpr))];
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const began = now();
    g.save();
    g.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
    let drew: Drew | undefined;
    try {
      drew = stage.frame(g as unknown as OffscreenCanvasRenderingContext2D, f);
    } finally {
      g.restore();
    }
    post({ kind: 'drew', ms: now() - began, ...(drew?.uses !== undefined ? { uses: drew.uses } : {}) });
  };

  return {
    take(message) {
      if (message.kind === 'svg') {
        const asking = waiting.get(message.id);
        waiting.delete(message.id);
        if (message.image) asking?.resolve(message.image);
        else asking?.reject(new Error(message.error ?? 'The SVG could not be drawn'));
        return;
      }
      if (stopped) return;
      try {
        if (message.kind === 'start') start(message);
        else frame(message.frame);
      } catch (error) {
        fail(error);
      }
    },
  };
}
