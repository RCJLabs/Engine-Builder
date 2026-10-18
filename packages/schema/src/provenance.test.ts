import { describe, expect, it } from 'vitest';
import { checkProvenance, isDay, kindOfAsset, LICENCES, licenceProblem } from './index.ts';

const files = (entries: Record<string, unknown>) => ({ files: entries });
const ok = { licence: 'CC0-1.0', source: 'https://kenney.nl', date: '2026-10-18' };
const said = (log: unknown, assets: readonly string[]) =>
  checkProvenance(log, new Set(assets)).map((i) => `${i.code} ${i.asset ?? ''}${i.path}: ${i.message}`);

describe('licences', () => {
  it('passes the fixed list, and OFL for fonts and their notices only', () => {
    for (const { id } of LICENCES) expect(licenceProblem(id, id === 'OFL-1.1' ? 'f.woff2' : 'a.png'), id).toBeNull();
    expect(licenceProblem('OFL-1.1', 'fonts/inter.ttf')).toBeNull();
    expect(licenceProblem('OFL-1.1', 'fonts/OFL.txt')).toBeNull();
    expect(licenceProblem('OFL-1.1', 'portraits/spiculus.png')).toBe(
      'SIL Open Font License 1.1 is for font files and their notices',
    );
    expect(licenceProblem('OFL-1.1', 'theme.ogg')).toBe(
      'SIL Open Font License 1.1 is for font files and their notices',
    );
  });

  it.each([
    ['CC-BY-NC-4.0', 'Refused: NonCommercial (NC) forbids selling the game'],
    ['CC-BY-SA-4.0', 'Refused: ShareAlike (SA) would bind what is made with it to the same licence'],
    ['CC-BY-ND-3.0', 'Refused: NoDerivatives (ND) forbids changing the work, even to fit it in'],
    ['cc by-nc-sa 4.0', 'Refused: NonCommercial (NC) forbids selling the game; ShareAlike (SA) would bind'],
  ])('refuses %s by what it forbids', (id, message) => {
    expect(licenceProblem(id, 'a.png')).toContain(message);
  });

  it('refuses a licence it doesn’t know, naming those it accepts', () => {
    expect(licenceProblem('GPL-3.0-only', 'a.png')).toBe(
      '"GPL-3.0-only" isn\'t a licence the engine accepts: own, generated, public-domain, CC0-1.0, CC-BY-4.0, CC-BY-3.0, MIT, Apache-2.0, OFL-1.1',
    );
    // Words that merely contain the letters are not the terms.
    expect(licenceProblem('SANDBOX', 'a.png')).toContain("isn't a licence the engine accepts");
  });

  it('knows the kinds by extension, in either case', () => {
    expect(kindOfAsset('a/B.PNG')).toBe('image');
    expect(kindOfAsset('music/theme.ogg')).toBe('audio');
    expect(kindOfAsset('ship.glb')).toBe('model');
    expect(kindOfAsset('inter.woff2')).toBe('font');
    expect(kindOfAsset('notes.txt')).toBeUndefined();
    expect(kindOfAsset('README')).toBeUndefined();
  });

  it('reads real days only', () => {
    for (const day of ['2026-10-18', '2024-02-29', '2000-01-01']) expect(isDay(day), day).toBe(true);
    for (const day of ['2026-02-29', '2026-13-01', '2026-10-32', '18/10/2026', '2026-10-18T00:00', '']) {
      expect(isDay(day), day).toBe(false);
    }
  });
});

describe('checkProvenance', () => {
  it('finds nothing wrong with a sound log that covers every file', () => {
    expect(
      said(files({ 'a.png': ok, 'fonts/inter.woff2': { ...ok, licence: 'OFL-1.1', author: 'Rasmus' } }), [
        'a.png',
        'fonts/inter.woff2',
      ]),
    ).toEqual([]);
  });

  it('reports each file the log leaves out, and each entry for a file that isn’t there', () => {
    expect(said(files({ 'gone.png': ok }), ['b.ogg', 'a.png'])).toEqual([
      'E019 a.png: No provenance: log its licence and source',
      'E019 b.ogg: No provenance: log its licence and source',
      'W106 /files/gone.png: No file assets/gone.png: the entry can go',
    ]);
    // No log at all: every file is unlogged.
    expect(said(undefined, ['a.png'])).toEqual(['E019 a.png: No provenance: log its licence and source']);
    expect(said(undefined, [])).toEqual([]);
  });

  it('checks each entry’s licence and what it asks for', () => {
    const log = files({
      'nc.png': { ...ok, licence: 'CC-BY-NC-4.0' },
      'by.png': { ...ok, licence: 'CC-BY-4.0' },
      'gen.png': { ...ok, licence: 'generated', tool: 'Imagen' },
      'font.png': { ...ok, licence: 'OFL-1.1', author: 'x' },
    });
    expect(said(log, ['nc.png', 'by.png', 'gen.png', 'font.png'])).toEqual([
      'E020 /files/by.png: CC BY 4.0 asks for credit: say who made it',
      'E020 /files/font.png/licence: SIL Open Font License 1.1 is for font files and their notices',
      'E020 /files/gen.png: Generated art logs its prompt: add it',
      'E020 /files/nc.png/licence: Refused: NonCommercial (NC) forbids selling the game',
    ]);
  });

  it('reports the log’s shape in its own words, and still reads the licences it can', () => {
    const log = files({ 'a.png': { ...ok, date: '2026-02-30', licence: 'CC-BY-SA-4.0', colour: 'red' } });
    expect(said(log, ['a.png'])).toEqual([
      'E021 /files/a.png/date: Expected a date like 2026-10-18',
      'E021 /files/a.png/colour: Unknown field "colour"',
      'E020 /files/a.png/licence: Refused: ShareAlike (SA) would bind what is made with it to the same licence',
    ]);
    expect(said(files({ 'a.png': { ...ok, source: '' } }), ['a.png'])).toEqual([
      'E021 /files/a.png/source: Say where it came from: a link, or words',
    ]);
  });

  it('gives one problem for a log it can’t read as entries, not one per file', () => {
    const list = said([1, 2], ['a.png', 'b.png']);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatch(/^E021 : /);
    expect(said({ files: 'none' }, ['a.png'])).toEqual([expect.stringMatching(/^E021 \/files: /)]);
    expect(said({}, ['a.png'])).toEqual(['E021 /files: Missing field "files"']);
  });

  it('lists stand-ins still in use as warnings, and refuses a stand-in flag that isn’t true', () => {
    expect(
      said(files({ 'stand-ins/hero.svg': { ...ok, licence: 'own', standIn: true } }), ['stand-ins/hero.svg']),
    ).toEqual(['W107 stand-ins/hero.svg: A stand-in: replace it with real art']);
    expect(said(files({ 'a.png': { ...ok, standIn: false } }), ['a.png'])).toEqual([
      'E021 /files/a.png/standIn: Either true or left out',
    ]);
  });

  it('refuses a key that isn’t a path inside assets/', () => {
    expect(said(files({ '../secret.png': ok }), [])[0]).toMatch(/^E021 \/files\/\.\.~1secret\.png: Invalid key/);
  });
});
