/**
 * A model's or a sprite's file problems for its form: a model's E070 and W146 (M5.5), a sprite's
 * sheet's E091 (M7.1), from the index, which modelChecks.ts fills once the records are read. Apart
 * from it so the form loads no compiler.
 */
import { type Diagnostic, MODEL, SPRITE } from '@eb/schema';
import type { RecordIndex } from '../records/recordIndex.ts';

export const modelFileProblems = (index: RecordIndex | undefined, type: string, id: string): Diagnostic[] =>
  type === MODEL || type === SPRITE ? (index?.models ?? []).filter((d) => d.type === type && d.id === id) : [];
