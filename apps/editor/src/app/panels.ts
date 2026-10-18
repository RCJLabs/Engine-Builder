import type { PanelId } from './layout.ts';

export interface PanelInfo {
  label: string;
  /** Which roadmap phase fills this panel in. */
  phase: string;
  summary: string;
  coming: readonly string[];
}

/** Phase 0 placeholders: each panel says what it will hold and when (ROADMAP.md). */
export const PANELS: Record<PanelId, PanelInfo> = {
  project: {
    label: 'Project',
    phase: 'Phase 2',
    summary: 'Create, open and back up projects. A project is a folder of git-friendly JSON files.',
    coming: ['New project from a template'],
  },
  records: {
    label: 'Records',
    phase: 'Phase 2',
    summary: 'Every record of a type in a table: sort, search, filter, and change many at once.',
    coming: [],
  },
  assets: {
    label: 'Assets',
    phase: 'Phase 2',
    summary: 'Images, sounds, 3D models and fonts, each with where it came from and its licence.',
    coming: [],
  },
  world: {
    label: 'World',
    phase: 'Phases 4–7',
    summary: 'Where worlds get built: route maps first, then 3D terrain and interiors, then 2D tiles.',
    coming: [
      'Node-graph world maps (Phase 4)',
      '3D terrain, props, NPCs, interiors (Phases 5–6)',
      '2D tilemaps and side-view rooms (Phase 7)',
    ],
  },
  inspector: {
    label: 'Inspector',
    phase: 'Phase 2',
    summary: 'Edit whatever is selected, with forms built from each record type’s schema.',
    coming: ['Effect builders (Phase 3)'],
  },
  logic: {
    label: 'Logic',
    phase: 'Phase 3',
    summary: 'Missions, dialogue and game logic, written without code or in TypeScript.',
    coming: [
      'Mission designer: steps, objectives, branches',
      'Dialogue trees and ink scenes',
      'Trigger sheets: When / If / Do, plus scripts',
    ],
  },
  problems: {
    label: 'Problems',
    phase: 'Phase 2',
    summary: 'Every problem `eb validate` would find in the project, each a tap from where it is fixed.',
    coming: [],
  },
  console: {
    label: 'Console',
    phase: 'Phase 2',
    summary: 'What the editor did and what went wrong, to read or copy into a bug report.',
    coming: [],
  },
  play: {
    label: 'Play',
    phase: 'Phase 4',
    summary: 'Play the game inside the editor and see exactly what the simulation is doing.',
    coming: ['State inspector and event log', 'Time controls and save states', 'Quest debugger'],
  },
};
