/**
 * Purity rules for packages marked `"eb": { "pure": true }` (docs/architecture.md, "The sim
 * decides; the stage renders"). Pure code must give the same result in every browser, in Node
 * and in a worker, so a daily seed or a replay never drifts. Ported from chooser-of-the-dead's
 * engine rules, with a tokenizer in place of its comment regex (see scan.ts).
 */
import { scan } from './scan.ts';

export interface Violation {
  file: string;
  line: number;
  rule: string;
}

interface PatternRule {
  rule: string;
  pattern: RegExp;
}

const TRANSCENDENTAL: PatternRule = {
  rule: 'no transcendental Math (results differ between JS engines)',
  pattern:
    /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b/,
};
const POWER: PatternRule = { rule: 'no ** operator (floating-point pow)', pattern: /\*\*/ };

// `(?<![.\w$])` and `(?!\s*\??:)` let property names through: `a.window`, `{ performance: 1 }`.
const PURE_PATTERNS: readonly PatternRule[] = [
  { rule: 'no Math.random (use a seeded rng stream)', pattern: /\bMath\.random\b/ },
  TRANSCENDENTAL,
  POWER,
  { rule: 'no Date (time arrives as actions)', pattern: /\bDate\b/ },
  { rule: 'no Intl or localeCompare (locale-dependent)', pattern: /\bIntl\b|\.localeCompare\s*\(/ },
  {
    rule: 'no timers or clocks',
    pattern:
      /(?<![.\w$])(setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|performance)\b(?!\s*\??:)/,
  },
  {
    rule: 'no eval, Function or import() (code made at run time is code no rule has read)',
    pattern: /(?<![.\w$])(eval|Function)\s*\(|(?<![.\w$])import\s*\(/,
  },
  {
    rule: 'no DOM or host globals',
    pattern:
      /(?<![.\w$])(window|document|navigator|localStorage|sessionStorage|indexedDB|globalThis|process|require|fetch|crypto)\b(?!\s*\??:)/,
  },
];

/**
 * A stage's rules (M7.4, D86): the pure rules less transcendental Math and `**`, since a picture
 * needn't agree to the last bit between engines and the sim never reads one; and no `self` or
 * `postMessage`, so a stage speaks to the page only by what its frame returns.
 */
const STAGE_PATTERNS: readonly PatternRule[] = [
  ...PURE_PATTERNS.filter((p) => p !== TRANSCENDENTAL && p !== POWER),
  {
    rule: 'no self or postMessage (a stage answers through what frame returns)',
    pattern: /(?<![.\w$])(self|postMessage|onmessage|importScripts)\b(?!\s*\??:)/,
  },
];

function violations(rules: readonly PatternRule[], file: string, code: string): Violation[] {
  const out: Violation[] = [];
  code.split('\n').forEach((text, i) => {
    for (const { rule, pattern } of rules) {
      if (pattern.test(text)) out.push({ file, line: i + 1, rule });
    }
  });
  return out;
}

/** The pattern rules' findings in code already scanned (scan's `code`), one per rule and line. */
export const patternViolations = (file: string, code: string): Violation[] => violations(PURE_PATTERNS, file, code);

/** A stage's rules' findings in code already scanned, one per rule and line (M7.4). */
export const stageViolations = (file: string, code: string): Violation[] => violations(STAGE_PATTERNS, file, code);

/**
 * Checks one source file of a pure package. `pureNames` lists the workspace packages that are
 * themselves pure; anything else (npm packages, `node:` modules, impure workspace packages) is
 * off limits.
 */
export function checkPureSource(file: string, source: string, pureNames: ReadonlySet<string>): Violation[] {
  const { code, imports } = scan(source);
  const out = patternViolations(file, code);
  for (const { spec, line } of imports) {
    const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : (spec.split('/')[0] ?? spec);
    if (!spec.startsWith('.') && !pureNames.has(pkg)) {
      out.push({ file, line, rule: `pure code may import only its own files and pure packages (found "${spec}")` });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}
