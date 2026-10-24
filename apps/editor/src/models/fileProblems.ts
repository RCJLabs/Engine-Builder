/**
 * A model record's file problems for its form (M5.5): E070 and W146 from the index, which
 * modelChecks.ts fills once the records are read. Apart from it so the form loads no compiler.
 */
import { type Diagnostic, MODEL } from '@eb/schema';
import type { RecordIndex } from '../records/recordIndex.ts';

export const modelFileProblems = (index: RecordIndex | undefined, type: string, id: string): Diagnostic[] =>
  type === MODEL ? (index?.models ?? []).filter((d) => d.id === id) : [];
