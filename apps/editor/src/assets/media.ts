/**
 * What the browser needs to show an asset (M2.7): its media type by extension, and how big a
 * file the import takes. The limits keep a phone's memory and the save journal, which carries
 * each saved file whole, within what was measured (ROADMAP.md, Readings).
 */
const MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
};

const extensionOf = (path: string) => path.slice(path.lastIndexOf('.') + 1).toLowerCase();

/** The media type a file is served and shown as. */
export const mimeOf = (path: string): string => MIME[extensionOf(path)] ?? 'application/octet-stream';

const MB = 1024 * 1024;

/** The most one file, and one import, may be. */
export const LIMITS = { file: 25 * MB, batch: 100 * MB } as const;

/** A size in plain words: "512 bytes", "3.4 KB", "25 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1024) return bytes === 1 ? '1 byte' : `${bytes} bytes`;
  const [value, unit] = bytes < MB ? [bytes / 1024, 'KB'] : [bytes / MB, 'MB'];
  return `${value < 10 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)} ${unit}`;
}

/** Today, as the log writes dates: YYYY-MM-DD on this device's calendar. */
export function today(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
