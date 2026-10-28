/**
 * OffscreenCanvas as Node lacks it, for a stage run in a test (M7.4): a size, and a 2D context
 * that draws nothing but writes each call and each field set into a log, keeping its transform
 * so `getTransform()` reads back what was set.
 */

/** A context that logs `name` for each call and `name=value` for each field set. */
export function standInContext(log: string[]): OffscreenCanvasRenderingContext2D {
  let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const fields: Record<string | symbol, unknown> = {};
  return new Proxy(fields, {
    get(target, key) {
      if (key in target) return target[key];
      // Not a thenable, or awaiting one would call it.
      if (typeof key !== 'string' || key === 'then') return undefined;
      return (...args: number[]) => {
        log.push(key);
        if (key === 'getTransform') return { ...transform };
        if (key === 'setTransform') {
          const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = args;
          transform = { a, b, c, d, e, f };
        }
        if (key === 'createRadialGradient' || key === 'createLinearGradient') return { addColorStop() {} };
        if (key === 'measureText') return { width: 0 };
        return undefined;
      };
    },
    set(target, key, value) {
      target[key] = value;
      if (typeof key === 'string') log.push(`${key}=${String(value)}`);
      return true;
    },
  }) as unknown as OffscreenCanvasRenderingContext2D;
}

/** A class to stand in for OffscreenCanvas, every canvas's context logging into `log`. */
export function standInCanvas(log: string[]) {
  return class StandInCanvas {
    width: number;
    height: number;
    #g: OffscreenCanvasRenderingContext2D | undefined;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext(): OffscreenCanvasRenderingContext2D {
      this.#g ??= standInContext(log);
      return this.#g;
    }
  };
}
