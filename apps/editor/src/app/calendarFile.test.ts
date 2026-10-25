/**
 * project.json's calendar and clock as the Project panel's forms see their problems (M3.5, M6.3):
 * each at its place inside the form, and W149, said of the file as a whole, at the clock's rate.
 */
import { MANIFEST_FILE } from '@eb/compiler';
import type { Diagnostic, DiagnosticCode } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { calendarProblems, clockProblems } from './calendarFile.ts';

const at = (code: DiagnosticCode, path: string, file: string = MANIFEST_FILE): Diagnostic => ({
  code,
  severity: code.startsWith('W') ? 'warning' : 'error',
  message: code,
  file,
  path,
});
const PROBLEMS = [
  at('W149', ''),
  at('E080', '/clock/rate'),
  at('E038', '/calendar/ticksPerDay'),
  at('E001', '/clock', 'records/actor/smith.json'),
];
const places = (problems: Diagnostic[]) => problems.map((d) => `${d.code} ${d.path}`);

describe('the calendar’s and the clock’s problems', () => {
  it('puts the clock’s at its fields, and W149, of a clock left out, at its rate', () => {
    expect(places(clockProblems(PROBLEMS))).toEqual(['W149 /rate', 'E080 /rate']);
  });

  it('puts the calendar’s at its fields, and leaves the clock’s out', () => {
    expect(places(calendarProblems(PROBLEMS))).toEqual(['E038 /ticksPerDay']);
  });
});
