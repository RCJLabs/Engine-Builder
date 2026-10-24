/** The PNG headers the terrain tests (M5.3) need, without an image: the compiler reads no further. */

/** A PNG's signature, its header and an end: enough for pngHeader, which never reads the image. */
export function pngOf(width: number, height: number, bitDepth: number, colorType: number): Uint8Array {
  const bytes = new Uint8Array(8 + 25 + 12);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([bitDepth, colorType, 0, 0, 0], 24);
  bytes.set([73, 69, 78, 68], 8 + 25 + 4);
  return bytes;
}
