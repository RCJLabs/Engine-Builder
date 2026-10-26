/**
 * A folder of the repo bundled into the editor (M5.5, M6.5): its GLBs inlined as data URLs and its
 * records and log as text, read back as the files a project gets, by their paths in it.
 */
function fromDataUrl(url: string): Uint8Array {
  const base64 = url.slice(url.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function bundledFiles(
  glbs: Readonly<Record<string, string>>,
  texts: Readonly<Record<string, string>>,
  prefix: string,
): Map<string, Uint8Array> {
  const encoder = new TextEncoder();
  return new Map([
    ...Object.entries(glbs).map(([path, url]) => [path.slice(prefix.length), fromDataUrl(url)] as const),
    ...Object.entries(texts).map(([path, text]) => [path.slice(prefix.length), encoder.encode(text)] as const),
  ]);
}
