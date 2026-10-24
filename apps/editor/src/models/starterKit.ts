/**
 * The starter kit's files (M5.5, D67): the repo's starter-kit/ bundled into the editor as a chunk
 * of its own, loaded only when Add starter kit is pressed, so the service worker keeps it offline.
 * The GLBs come inlined as data URLs, the records and the log as text.
 */
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

function fromDataUrl(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Every file of the kit, by its path in a project. */
export function kitFiles(): Map<string, Uint8Array> {
  const encoder = new TextEncoder();
  return new Map([
    ...Object.entries(glbs).map(([path, url]) => [path.slice(PREFIX.length), fromDataUrl(url)] as const),
    ...Object.entries(texts).map(([path, text]) => [path.slice(PREFIX.length), encoder.encode(text)] as const),
  ]);
}
