import { MANIFEST_FILE, memorySource, PROJECT_FOLDERS } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LUDUS, readFixture } from '../../../../packages/compiler/test/fixture.ts';
import { playFiles } from './playFiles.ts';

describe('what Run sends the worker', () => {
  it('is the project’s own files as export zips them, the assets by name alone, audio whole', async () => {
    const ludus = readFixture(FIXTURE_LUDUS);
    const stem = new Uint8Array([82, 73, 70, 70, 1, 2]);
    const project = { ...ludus, 'notes.txt': 'not the project’s', 'assets/audio/theme.wav': stem };
    const files = new Map(await playFiles(memorySource(project)));
    const assets = Object.keys(ludus).filter((path) => path.startsWith('assets/') && path !== 'assets/assets.json');
    expect(assets.length).toBeGreaterThan(0);
    for (const path of assets) expect(files.get(path), path).toEqual(new Uint8Array());
    // A music's stem goes whole: it is packed into the game (M4.8).
    expect(files.get('assets/audio/theme.wav')).toEqual(stem);
    // The provenance log is read when the project is checked, so it goes whole.
    expect(new TextDecoder().decode(files.get('assets/assets.json'))).toBe(ludus['assets/assets.json']);
    expect(new TextDecoder().decode(files.get('project.json'))).toBe(ludus['project.json']);
    // Nothing outside the project's own folders: the fixture's README, a note at the top.
    const own = (path: string) => path === MANIFEST_FILE || PROJECT_FOLDERS.some((dir) => path.startsWith(`${dir}/`));
    expect(files.has('notes.txt')).toBe(false);
    expect([...files.keys()].sort()).toEqual(Object.keys(project).filter(own).sort());
  });

  it('sends models whole, and a .gltf’s buffers and images with it, which a space draws in play (M5.8)', async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const glb = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);
    const gltf = JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ uri: 'hill.bin', byteLength: 4 }],
      images: [{ uri: 'moss.png' }],
    });
    const project = {
      'project.json': '{}',
      'assets/models/crate.glb': glb,
      'assets/models/hill.gltf': encode(gltf),
      'assets/models/hill.bin': new Uint8Array([1, 2, 3, 4]),
      'assets/models/moss.png': new Uint8Array([137, 80, 78, 71]),
      'assets/art/portrait.png': new Uint8Array([137, 80, 78, 71, 9]),
    };
    const files = new Map(await playFiles(memorySource(project)));
    expect(files.get('assets/models/crate.glb')).toEqual(glb);
    expect(new TextDecoder().decode(files.get('assets/models/hill.gltf'))).toBe(gltf);
    expect(files.get('assets/models/hill.bin')).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(files.get('assets/models/moss.png')).toEqual(new Uint8Array([137, 80, 78, 71]));
    // Art no model names still goes by name alone.
    expect(files.get('assets/art/portrait.png')).toEqual(new Uint8Array());
  });

  it('sends the sheets sprite and tileset records name whole, which a 2D space draws in play (M7.1, M7.2)', async () => {
    const sheet = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const project = {
      'project.json': '{}',
      'records/sprite/guard.json': JSON.stringify({ sheet: 'sprites/guard.png', frame: [16, 24], clips: {} }),
      'records/sprite/broken.json': '{ not json',
      'records/tileset/deck.json': JSON.stringify({ sheet: 'sprites/deck-tiles.png', tile: [16, 16], tiles: {} }),
      'assets/sprites/guard.png': sheet,
      'assets/sprites/deck-tiles.png': sheet,
      'assets/sprites/unused.png': sheet,
    };
    const files = new Map(await playFiles(memorySource(project)));
    expect(files.get('assets/sprites/guard.png')).toEqual(sheet);
    expect(files.get('assets/sprites/deck-tiles.png')).toEqual(sheet);
    expect(files.get('assets/sprites/unused.png')).toEqual(new Uint8Array());
  });

  it('sends the images screens show whole, which the pack carries as data URLs (M7.4)', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const hud = { title: 'Shift', layout: { widget: 'panel', children: [{ widget: 'image', asset: 'alarm.svg' }] } };
    const project = {
      'project.json': '{}',
      'ui/shift.json': JSON.stringify(hud),
      'ui/broken.json': '{ not json',
      'assets/alarm.svg': svg,
      'assets/other.svg': svg,
    };
    const files = new Map(await playFiles(memorySource(project)));
    expect(files.get('assets/alarm.svg')).toEqual(svg);
    expect(files.get('assets/other.svg')).toEqual(new Uint8Array());
  });
});
