/**
 * The starter character's files (M6.5, D77): the repo's starter-character/ bundled into the editor
 * as a chunk of its own, loaded only when Add starter character is pressed: its GLB, its model,
 * material and animator records, and its provenance log.
 */
import { bundledFiles } from './bundled.ts';

const glbs = import.meta.glob('../../../../starter-character/**/*.glb', {
  query: '?inline',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const texts = import.meta.glob('../../../../starter-character/**/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Every file of the character, by its path in a project. */
export const characterFiles = (): Map<string, Uint8Array> =>
  bundledFiles(glbs, texts, '../../../../starter-character/');
