/**
 * SVG text a stage made, drawn as a bitmap for it (M7.4, D86): a worker has no SVG decoder, so the
 * page loads the text as an image and draws it at the size asked, in device pixels.
 */

/** The most a stage may ask an SVG drawn at, each way: a typo can't ask for a gigapixel. */
const MOST_PX = 4096;

export async function svgBitmap(text: string, w: number, h: number): Promise<ImageBitmap> {
  const [width, height] = [Math.round(w), Math.round(h)];
  if (!(width >= 1 && height >= 1 && width <= MOST_PX && height <= MOST_PX))
    throw new Error(`svg() draws from 1 to ${MOST_PX} pixels each way, not ${w} by ${h}`);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const image = new Image(width, height);
    image.src = url;
    await image.decode();
    const canvas = new OffscreenCanvas(width, height);
    (canvas.getContext('2d') as OffscreenCanvasRenderingContext2D).drawImage(image, 0, 0, width, height);
    return canvas.transferToImageBitmap();
  } catch {
    throw new Error('The SVG could not be drawn: is it well formed, with an xmlns?');
  } finally {
    URL.revokeObjectURL(url);
  }
}
