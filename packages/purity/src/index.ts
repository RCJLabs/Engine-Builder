/**
 * The purity rules (docs/architecture.md, "The sim decides; the stage renders"): what code that
 * must give the same result everywhere may not use. tools/lint-boundaries holds the workspace's
 * pure packages to them, and project scripts are held to them too (M3.2, docs/specs/scripts.md).
 */
export { checkPureSource, patternViolations, type Violation } from './rules.ts';
export { type Scanned, scan } from './scan.ts';
