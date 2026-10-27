/**
 * One frame of a tileset's sheet drawn at a whole zoom, pixelated (M7.2): a tile in the Tiles row's
 * buttons and in the tileset's preview. Frames count across and then down from the sheet's top, as
 * the stage reads them.
 */
import { useEffect, useRef } from 'preact/hooks';
import '../styles/sprites.css';

export function TileFrame(props: { image: ImageBitmap; tile: readonly [number, number]; frame: number; zoom: number }) {
  const { image, tile, frame, zoom } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [w, h] = tile;
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const across = Math.max(1, Math.floor(image.width / w));
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w * zoom, h * zoom);
    ctx.drawImage(image, (frame % across) * w, Math.floor(frame / across) * h, w, h, 0, 0, w * zoom, h * zoom);
  }, [image, w, h, frame, zoom]);
  return <canvas ref={canvas} class="tile-frame" width={w * zoom} height={h * zoom} data-frame={frame} />;
}
