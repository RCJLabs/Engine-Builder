/**
 * The starter kit's files (M5.5, D67): the repo's starter-kit/ bundled into the editor as a chunk
 * of its own, loaded only when Add starter kit is pressed, so the service worker keeps it offline.
 * The GLBs come inlined as data URLs, the records and the log as text.
 */
import { bundledFiles } from './bundled.ts';

const glbs = import.meta.glob('../../../../starter-kit/**/*.glb', {
  query: '?inline',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const texts = import.meta.glob('../../../../starter-kit/**/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PREFIX = '../../../../starter-kit/';

/** Every file of the kit, by its path in a project. */
export const kitFiles = (): Map<string, Uint8Array> => bundledFiles(glbs, texts, PREFIX);
