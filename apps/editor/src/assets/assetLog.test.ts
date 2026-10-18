import { describe, expect, it } from 'vitest';
import { entryOf, logEntries, movedEntry, setInLog, withEntry } from './assetLog.ts';
import { cleanFolder, cleanName, fileName, folderOf, freePath } from './assetPaths.ts';
import { standInPath, standInSvg } from './standIn.ts';

const entry = { licence: 'CC0-1.0', source: 'kenney.nl', date: '2026-10-18' };

describe('the log', () => {
  it('adds entries where their paths sort, with keys in the format’s order', () => {
    let log: unknown = withEntry(undefined, 'b.png', entry);
    log = withEntry(log, 'a.png', { date: '2026-10-18', source: 'drawn', licence: 'own' });
    log = withEntry(log, 'c.png', entry);
    expect(Object.keys(logEntries(log))).toEqual(['a.png', 'b.png', 'c.png']);
    expect(Object.keys(entryOf(log, 'a.png') as object)).toEqual(['licence', 'source', 'date']);
  });

  it('sets one key of an entry where the format lists it, and takes it out', () => {
    let log = withEntry(undefined, 'a.png', entry);
    log = setInLog(log, ['files', 'a.png', 'author'], 'Kenney');
    expect(Object.keys(entryOf(log, 'a.png') as object)).toEqual(['licence', 'author', 'source', 'date']);
    log = setInLog(log, ['files', 'a.png', 'edits'], ['Cropped']);
    expect(Object.keys(entryOf(log, 'a.png') as object).at(-1)).toBe('edits');
    log = setInLog(log, ['files', 'a.png', 'author'], undefined);
    expect(entryOf(log, 'a.png')).not.toHaveProperty('author');
  });

  it('moves an entry to where its new path sorts, and leaves a log without it as it is', () => {
    let log = withEntry(withEntry(undefined, 'a.png', entry), 'm.png', entry);
    log = movedEntry(log, 'a.png', 'z.png');
    expect(Object.keys(logEntries(log))).toEqual(['m.png', 'z.png']);
    expect(movedEntry(log, 'gone.png', 'x.png')).toBe(log);
    expect(Object.keys(logEntries(withEntry(log, 'm.png', undefined)))).toEqual(['z.png']);
  });

  it('keeps what the log holds beside its entries, and keys an entry was written with by hand', () => {
    const log = { note: 'by hand', files: { 'a.png': { ...entry, mood: 'sunny' } } };
    const next = withEntry(log, 'b.png', entry) as Record<string, unknown>;
    expect(next.note).toBe('by hand');
    expect(entryOf(next, 'a.png')).toEqual({ ...entry, mood: 'sunny' });
  });
});

describe('paths', () => {
  it('cleans names a zip made anywhere can hold, never hidden', () => {
    expect(cleanName('hero: final?.png')).toBe('hero- final-.png');
    expect(cleanName('.hidden.png')).toBe('hidden.png');
    expect(cleanName('  ')).toBe('file');
    expect(cleanName('__MACOSX')).toBe('file');
    expect(cleanName(`a${String.fromCharCode(7)}b.png`)).toBe('a-b.png');
    expect(cleanFolder(' portraits / /heroes ')).toBe('portraits/heroes');
    expect(cleanFolder('')).toBe('');
  });

  it('finds a free path, case aside', () => {
    expect(freePath('images', 'hero.png', [])).toBe('images/hero.png');
    expect(freePath('images', 'hero.png', ['images/HERO.png', 'images/hero-2.png'])).toBe('images/hero-3.png');
    expect(freePath('', 'readme', ['readme'])).toBe('readme-2');
    expect(freePath('', '.png', [])).toBe('png');
  });

  it('splits a path into its folder and name', () => {
    expect(fileName('a/b/c.png')).toBe('c.png');
    expect(folderOf('a/b/c.png')).toBe('a/b');
    expect(folderOf('c.png')).toBe('');
  });
});

describe('stand-ins', () => {
  it('draws the name on a colour from it, the same bytes every time', () => {
    const svg = standInSvg('Hero portrait');
    expect(svg).toBe(standInSvg('Hero portrait'));
    expect(svg).not.toBe(standInSvg('Villain portrait'));
    expect(svg).toContain('<tspan x="256" y="');
    expect(svg).toContain('>Hero portrait<');
    expect(svg).toMatch(/fill="hsl\(\d+ 45% 38%\)"/);
    expect(standInPath('Hero portrait')).toBe('stand-ins/hero-portrait.svg');
    expect(standInPath('!!!')).toBe('stand-ins/stand-in.svg');
  });

  it('escapes the name, so a name is never markup', () => {
    const svg = standInSvg('<script>&"');
    expect(svg).toContain('&lt;script&gt;&amp;&quot;');
    expect(svg).not.toContain('<script>');
  });

  it('wraps a long name over at most three lines', () => {
    const svg = standInSvg('The great hall of the emperor at night in winter');
    expect(svg.match(/<tspan/g)).toHaveLength(3);
    expect(svg).toContain('…');
  });
});
