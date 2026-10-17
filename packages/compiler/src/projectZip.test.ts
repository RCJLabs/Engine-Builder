import { strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_V1, readFixture } from '../test/fixture.ts';
import { memorySource, PROJECT_FOLDERS, projectFiles, zipProject, zipSource } from './index.ts';

const fixture = readFixture(FIXTURE_V1);
const text = (bytes: Uint8Array | undefined) => (bytes === undefined ? undefined : new TextDecoder().decode(bytes));

// A project at the root of a game's repo, with the repo's own files around it.
const inRepo = memorySource({
  ...fixture,
  'README.md': '# my game',
  'package.json': '{}',
  'node_modules/fflate/index.js': 'x',
  'src/main.ts': 'x',
  'records/item/notes.md': 'kept: inside a project folder',
  'records/.gitkeep': '',
  'assets/icon.svg': '<svg/>',
});

describe('projectFiles', () => {
  it('takes project.json and the project’s folders, sorted, and nothing else', async () => {
    expect(await projectFiles(inRepo)).toEqual(
      [...Object.keys(fixture), 'assets/icon.svg', 'records/item/notes.md'].sort(),
    );
  });

  it('names the folders the architecture gives a project', () => {
    expect(PROJECT_FOLDERS).toEqual(['records', 'types', 'scenes', 'ui', 'scripts', 'dialogue', 'assets', 'locales']);
  });
});

describe('zipProject', () => {
  const zone = process.env.TZ;
  afterEach(() => {
    process.env.TZ = zone;
  });

  it('puts the project’s own files in one top folder, byte for byte', async () => {
    const unpacked = unzipSync(await zipProject(inRepo, 'salvage-run'));
    expect(Object.keys(unpacked)).toEqual((await projectFiles(inRepo)).map((path) => `salvage-run/${path}`));
    for (const path of await projectFiles(inRepo)) {
      expect(text(unpacked[`salvage-run/${path}`]), path).toBe(text(await inRepo.read(path)));
    }
  });

  it('gives the same bytes for the same files, in any order and any time zone', async () => {
    process.env.TZ = 'UTC';
    const first = await zipProject(memorySource(fixture), 'p');
    const reversed = Object.fromEntries(Object.entries(fixture).reverse());
    process.env.TZ = 'Pacific/Kiritimati';
    expect(await zipProject(memorySource(reversed), 'p')).toEqual(first);
    process.env.TZ = 'America/Los_Angeles';
    expect(await zipProject(memorySource(fixture), 'p')).toEqual(first);
  });

  // Two zips made a moment apart get the same timestamp anyway (zip counts in 2 s steps), so the
  // test above can't tell a fixed date from the clock's: this one reads the dates themselves.
  it('dates every entry midnight, 1 January 1980', async () => {
    const zip = await zipProject(memorySource(fixture), 'p');
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const stamps: [date: number, time: number][] = [];
    // Local file headers: 30 bytes, then the name, the extra field and the compressed data.
    for (let at = 0; view.getUint32(at, true) === 0x04034b50; ) {
      stamps.push([view.getUint16(at + 12, true), view.getUint16(at + 10, true)]);
      at += 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true) + view.getUint32(at + 18, true);
    }
    const jan1st1980 = (0 << 9) | (1 << 5) | 1;
    expect(stamps).toEqual(Object.keys(fixture).map(() => [jan1st1980, 0]));
  });

  it('comes back through zipSource as the same project', async () => {
    const back = zipSource(await zipProject(inRepo, 'salvage-run'));
    expect(await projectFiles(back)).toEqual(await projectFiles(inRepo));
    for (const path of await projectFiles(inRepo))
      expect(text(await back.read(path)), path).toBe(text(await inRepo.read(path)));
  });

  it('refuses a top folder that isn’t one name', async () => {
    for (const top of ['', 'a/b', 'a\\b']) await expect(zipProject(inRepo, top)).rejects.toThrow(RangeError);
  });
});

describe('zipSource limits', () => {
  const files = (count: number, size = 1) =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [`p/records/item/i${i}.json`, new Uint8Array(size)]));
  const zip = (entries: Record<string, Uint8Array>) => zipSync({ 'p/project.json': strToU8('{}'), ...entries });

  it('reads a zip up to its limits, and refuses one past them', () => {
    const limits = { maxFiles: 5, maxBytes: 1_000_000 };
    expect(() => zipSource(zip(files(4)), limits)).not.toThrow();
    expect(() => zipSource(zip(files(5)), limits)).toThrow('This zip holds more than 5 files.');
    expect(() => zipSource(zip(files(2, 600_000)), limits)).toThrow('This zip unpacks to more than 1 MB.');
    expect(() => zipSource(zip(files(2, 499_999)), limits)).not.toThrow();
  });

  it('counts neither hidden files nor folders', () => {
    const extra = { 'p/.git/a': new Uint8Array(9), 'p/__MACOSX/b': new Uint8Array(9), 'p/records/': new Uint8Array(0) };
    expect(() => zipSource(zip({ ...files(4), ...extra }), { maxFiles: 5, maxBytes: 100 })).not.toThrow();
  });
});
