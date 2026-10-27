/**
 * The starter sprites' files (M7.1, D83): the repo's starter-sprites/ bundled into the editor as a
 * chunk of its own, loaded only when Add starter sprites is pressed, so the service worker keeps it
 * offline. The sheets come inlined as data URLs, the records and the log as text.
 */
import { bundledFiles } from '../models/bundled.ts';

const sheets = import.meta.glob('../../../../starter-sprites/**/*.png', {
  query: '?inline',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const texts = import.meta.glob('../../../../starter-sprites/**/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PREFIX = '../../../../starter-sprites/';

/** Every file of the starter sprites, by its path in a project. */
export const spriteFiles = (): Map<string, Uint8Array> => bundledFiles(sheets, texts, PREFIX);
