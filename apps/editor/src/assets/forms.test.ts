import { describe, expect, it } from 'vitest';
import { entryProblems, entryWith } from './entries.ts';
import { importBlocked, planImport } from './importPlan.ts';
import { LIMITS } from './media.ts';
import { keptEntry, replacementPath, replaceProblem } from './replacing.ts';

const MB = 1024 * 1024;
const said = (entry: unknown, paths: string[], tried: boolean) =>
  entryProblems(entry, paths, tried).map((p) => `${p.code} ${p.path}: ${p.message}`);

describe('a new entry', () => {
  it('shows only the problems of boxes with something in them until Go is tried, then all, in its own words', () => {
    expect(said({ date: '2026-10-18' }, ['a.png'], false)).toEqual([]);
    expect(said({ date: '2026-02-30' }, ['a.png'], false)).toEqual(['E021 /date: Expected a date like 2026-10-18']);
    expect(said({ date: '2026-10-18' }, ['a.png'], true)).toEqual([
      'E021 /licence: Choose a licence',
      'E021 /source: Say where it came from: a link, or words',
    ]);
  });

  it('checks the licence against every file it will cover, saying each problem once', () => {
    const entry = { licence: 'OFL-1.1', author: 'SIL', source: 'Google Fonts', date: '2026-10-18' };
    expect(said(entry, ['fonts/inter.ttf', 'fonts/OFL.txt'], true)).toEqual([]);
    expect(said(entry, ['fonts/inter.ttf', 'a.png', 'b.png'], true)).toEqual([
      'E020 /licence: SIL Open Font License 1.1 is for font files and their notices',
    ]);
    expect(said({ ...entry, licence: 'CC-BY-4.0', author: undefined }, ['a.png'], true)).toEqual([
      'E020 /author: CC BY 4.0 asks for credit: say who made it',
    ]);
  });

  it('is set key by key in the format’s order, and a key emptied goes', () => {
    let entry = entryWith({}, ['date'], '2026-10-18');
    entry = entryWith(entry, ['licence'], 'own');
    entry = entryWith(entry, ['source'], 'Drawn');
    expect(Object.keys(entry)).toEqual(['licence', 'source', 'date']);
    expect(entryWith(entry, ['source'], undefined)).toEqual({ licence: 'own', date: '2026-10-18' });
  });
});

describe('an import’s plan', () => {
  const file = (name: string, size = 10) => ({ name, size });

  it('puts each file in its kind’s folder or the one typed, under a name no file has, this import’s included', () => {
    const plan = planImport([file('a.png'), file('A.png'), file('theme.ogg'), file('OFL.txt')], '', ['images/a-2.png']);
    expect(plan.map((p) => p.path)).toEqual(['images/a.png', 'images/A-3.png', 'audio/theme.ogg', 'OFL.txt']);
    expect(planImport([file('a.png'), file('b.ogg')], 'ui', []).map((p) => p.path)).toEqual(['ui/a.png', 'ui/b.ogg']);
  });

  it('refuses a file over the limit, and an import with nothing left or too much at once', () => {
    const plan = planImport([file('big.png', LIMITS.file + MB), file('ok.png', LIMITS.file)], '', []);
    expect(plan.map((p) => p.refused)).toEqual(['Too big: 26 MB, and the most is 25 MB', null]);
    expect(importBlocked(plan)).toBeNull();
    expect(importBlocked(planImport([file('big.png', LIMITS.file + 1)], '', []))).toBe(
      'None of these files can be imported.',
    );
    const many = planImport([file('a.png', 20 * MB), file('b.png', 20 * MB), file('c.png', 20 * MB)], '', []);
    expect(importBlocked(many)).toBe('These come to 60 MB, and the most at once is 50 MB: import fewer.');
    expect(importBlocked(many.slice(0, 2))).toBeNull();
  });
});

describe('a replacement', () => {
  it('keeps the path for the same extension, case aside, and finds a free one beside it for another', () => {
    expect(replacementPath('portraits/hero.png', 'NEW.PNG', ['portraits/hero.png'])).toBe('portraits/hero.png');
    // Kept as it is, capitals and all: only a change of extension moves it.
    expect(replacementPath('portraits/hero.PNG', 'new.png', ['portraits/hero.PNG'])).toBe('portraits/hero.PNG');
    expect(replacementPath('portraits/hero.png', 'new.webp', ['portraits/hero.png', 'portraits/hero.webp'])).toBe(
      'portraits/hero-2.webp',
    );
  });

  it('refuses another kind of file, which records naming this one don’t ask for, and one too big', () => {
    expect(replaceProblem('portraits/hero.png', { name: 'theme.ogg', size: 1 })).toBe('Replace it with another image.');
    expect(replaceProblem('music/theme.ogg', { name: 'hero.png', size: 1 })).toBe('Replace it with another sound.');
    expect(replaceProblem('fonts/OFL.txt', { name: 'hero.png', size: 1 })).toBe(
      'Replace it with a file of the same kind.',
    );
    expect(replaceProblem('portraits/hero.png', { name: 'hero.webp', size: LIMITS.file + 1 })).toContain('Too big');
    expect(replaceProblem('portraits/hero.png', { name: 'hero.webp', size: 1 })).toBeNull();
  });

  it('starts from the old entry without its date and edits, and from nothing over a stand-in', () => {
    const old = { licence: 'CC-BY-4.0', author: 'Kenney', source: 'kenney.nl', date: '2026-01-01', edits: ['Cropped'] };
    expect(keptEntry(old)).toEqual({ licence: 'CC-BY-4.0', author: 'Kenney', source: 'kenney.nl' });
    expect(
      keptEntry({ licence: 'own', source: 'A stand-in the editor made', date: '2026-10-18', standIn: true }),
    ).toEqual({});
    expect(keptEntry(undefined)).toEqual({});
  });
});
