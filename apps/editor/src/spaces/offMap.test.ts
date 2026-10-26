/**
 * What a baked map leaves out (M6.6, D78, docs/specs/markers.md#baking): build.ts flags the editor's
 * marks, zones, spawn points and characters OFF_MAP, and fromAbove.ts hides what is flagged. A shape
 * with a collider stays, its collider's wire mark goes: the wire's diagonals drew a line across the
 * glen's first baked map.
 */
import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createBuilder, OFF_MAP } from './build.ts';
import type { SpaceJson } from './spaceFile.ts';

const SPACE = {
  name: 'Glen',
  objects: [
    { id: 'ground', shape: 'box', components: { collider: {} } },
    { id: 'gate', shape: 'box', components: { trigger: { effects: [] } } },
    { id: 'start', shape: 'box', components: { spawn: {} } },
    { id: 'post', shape: 'box' },
    { id: 'smith', record: 'actor:smith' },
  ],
} as unknown as SpaceJson;

const flagged = (node: THREE.Object3D | undefined) => node?.userData[OFF_MAP] === true;

describe('what a baked map leaves out', () => {
  const builder = createBuilder();
  const figure = () => ({ figure: 'person', height: 1.8, chest: 1.3 }) as never;
  const built = builder.build(
    SPACE,
    new Map(),
    () => undefined,
    () => null,
    false,
    figure,
  );
  const node = (id: string) => built.byId.get(id);

  it('keeps shapes a player sees, and leaves out their marks', () => {
    expect(flagged(node('ground'))).toBe(false);
    expect(flagged(node('post'))).toBe(false);
    const marks = node('ground')?.children ?? [];
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every(flagged)).toBe(true);
  });

  it('leaves out zones and spawn points, as play does not draw them', () => {
    expect(flagged(node('gate'))).toBe(true);
    expect(flagged(node('start'))).toBe(true);
  });

  it('leaves out a character, which moves', () => {
    const smith = node('smith');
    expect(flagged(smith)).toBe(false);
    expect(smith?.children.some(flagged)).toBe(true);
  });
});
