import type { Attempt } from './types.ts';

/** Thrown by ctx.refuse and caught by reduce: the action is refused, not broken. */
export class Refusal extends Error {
  readonly reason: string;
  readonly data: Readonly<Record<string, unknown>>;
  constructor(reason: string, data: Readonly<Record<string, unknown>>) {
    super(`Refused: ${reason}`);
    this.name = 'Refusal';
    this.reason = reason;
    this.data = data;
  }
}

/** Thrown when an attempt's work refuses: reduce runs the action again with that attempt skipped. */
export class AttemptRefused extends Error {
  readonly id: string;
  readonly refusal: Refusal;
  constructor(id: string, refusal: Refusal) {
    super(`Attempt ${id} refused: ${refusal.reason}`);
    this.name = 'AttemptRefused';
    this.id = id;
    this.refusal = refusal;
  }
}

/**
 * Names each ctx.attempt by where it sits: "2" is the third at the top, "2/0" the first inside
 * it. A run of the action that skips an attempt reaches every attempt before it in the same
 * place, and skipping one never renumbers its siblings, so the names hold from run to run.
 */
export class Attempts {
  private readonly skipped: ReadonlyMap<string, Refusal>;
  private readonly open: number[] = [];
  private count = 0;

  constructor(skipped: ReadonlyMap<string, Refusal>) {
    this.skipped = skipped;
  }

  run(work: () => void): Attempt {
    const ordinal = this.count++;
    const id = [...this.open, ordinal].join('/');
    const known = this.skipped.get(id);
    if (known) return { ok: false, reason: known.reason, data: known.data };
    const outer = this.count;
    this.open.push(ordinal);
    this.count = 0;
    try {
      work();
      return { ok: true };
    } catch (error) {
      // Undoing the work in place would leave handlers holding copies the undo replaced.
      // Running the whole action again without it leaves nothing behind.
      if (error instanceof Refusal) throw new AttemptRefused(id, error);
      throw error;
    } finally {
      this.open.pop();
      this.count = outer;
    }
  }
}
