/**
 * What a scene's compile reports, at its line: E046 for ink the engine doesn't read, E012 and E013
 * for an EXTERNAL that names no fact, or names it wrongly. The codes are @eb/schema's table's; the
 * compiler turns these into its diagnostics.
 */
import type { At } from './ast.ts';

export type InkCode = 'E046' | 'E012' | 'E013';

export interface InkProblem {
  readonly code: InkCode;
  readonly message: string;
  readonly line: number;
  readonly column?: number;
}

/** A problem found while reading one line, thrown to its caller, which reports it and goes on. */
export class InkError extends Error {
  readonly column: number | undefined;
  readonly code: InkCode;

  constructor(message: string, column?: number, code: InkCode = 'E046') {
    super(message);
    this.column = column;
    this.code = code;
  }
}

/** A problem already reported where it was made, as an EXTERNAL that names no fact: a use of it says nothing more. */
export class Reported extends InkError {}

export class Problems {
  readonly list: InkProblem[] = [];

  add(at: At, message: string, code: InkCode = 'E046'): void {
    this.list.push({ code, message, line: at.line, ...(at.column === undefined ? {} : { column: at.column }) });
  }

  /** Runs `read`; an InkError it throws is reported at the line, its column counted from `offset`. */
  catching<T>(line: number, read: () => T, offset = 0): T | undefined {
    try {
      return read();
    } catch (error) {
      if (!(error instanceof InkError)) throw error;
      if (error instanceof Reported) return undefined;
      const column = error.column === undefined ? undefined : error.column + offset;
      this.add({ line, ...(column === undefined ? {} : { column }) }, error.message, error.code);
      return undefined;
    }
  }
}

/** Runs `read`, its errors' columns moved on by `offset`. */
export function shifted<T>(read: () => T, offset: number): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof InkError && error.column !== undefined) {
      throw new InkError(error.message, error.column + offset, error.code);
    }
    throw error;
  }
}
