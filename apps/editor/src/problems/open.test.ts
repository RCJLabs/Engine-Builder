import { beforeEach, expect, it, vi } from 'vitest';
import { fieldToFocus } from '../forms/focusField.ts';
import { openPlace } from './open.ts';

/** What each way of showing something was asked to show, in order. */
const shown = vi.hoisted(() => [] as string[]);

vi.mock('../app/panelControl.ts', () => ({ showPanel: (id: string) => shown.push(`panel ${id}`) }));
vi.mock('../assets/open.ts', () => ({ openAsset: (path: string) => shown.push(`asset ${path}`) }));
vi.mock('../records/actions.ts', () => ({
  openRecord: (type: string, id: string) => shown.push(`record ${type} ${id}`),
}));
vi.mock('../types/open.ts', () => ({ designType: (type: string) => shown.push(`type ${type}`) }));

beforeEach(() => {
  shown.length = 0;
  fieldToFocus.value = null;
});

it('opens a record with the field its form is to focus', () => {
  openPlace({ kind: 'record', type: 'gladiator', id: 'spiculus', at: '/record/wins' });
  expect(shown).toEqual(['record gladiator spiculus']);
  expect(fieldToFocus.value).toEqual({ file: 'records/gladiator/spiculus.json', at: '/record/wins' });
});

it('opens a type in the designer, an asset in the inspector, and the Project and Assets panels', () => {
  openPlace({ kind: 'type', type: 'horse' });
  openPlace({ kind: 'asset', path: 'portraits/spiculus.svg' });
  openPlace({ kind: 'panel', panel: 'project' });
  openPlace({ kind: 'panel', panel: 'assets' });
  expect(shown).toEqual(['type horse', 'asset portraits/spiculus.svg', 'panel project', 'panel assets']);
  expect(fieldToFocus.value).toBeNull();
});
