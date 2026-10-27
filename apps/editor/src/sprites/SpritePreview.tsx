/**
 * Above a sprite record's form (M7.1, D83, docs/specs/2d-scenes.md#the-editor): its sheet at a
 * whole zoom with the frame grid drawn over it, and each clip playing on the page's clock as play
 * plays it (stage2d's frameAt), held at its first frame when the system asks for less motion. Each
 * clip says the frame it shows in data-frame, for the e2e.
 */
import type { SpriteClip, SpriteRecord } from '@eb/schema';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useAssetFile } from '../assets/useAssetFile.ts';
import type { OpenProject } from '../projects/opened.ts';
import { frameAt, frameBox } from '../stage2d/clips.ts';
import '../styles/sprites.css';

/** The widest the sheet is drawn, in CSS pixels, and the most it is zoomed. */
const SHEET_MOST = 320;
const ZOOM_MOST = 8;
const CLIP_SIDE = 64;

const isSprite = (value: unknown): value is SpriteRecord =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SpriteRecord).sheet === 'string' &&
  Array.isArray((value as SpriteRecord).frame) &&
  typeof (value as SpriteRecord).clips === 'object';

export function SpritePreview({ project, value }: { project: OpenProject; value: unknown }) {
  if (!isSprite(value) || !project.catalog.assets.includes(value.sheet)) return null;
  return <SheetPreview project={project} sprite={value} />;
}

function SheetPreview({ project, sprite }: { project: OpenProject; sprite: SpriteRecord }) {
  const { bytes } = useAssetFile(project, sprite.sheet, false);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    if (!bytes) return;
    let on = true;
    createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' })).then(
      (bitmap) => on && setImage(bitmap),
      () => on && setImage(null),
    );
    return () => {
      on = false;
    };
  }, [bytes]);
  if (bytes === undefined) return <p class="muted">Reading assets/{sprite.sheet}…</p>;
  if (!image) return null;
  return (
    <section class="sprite-head" aria-label="The sprite’s sheet and clips">
      <Sheet image={image} sprite={sprite} />
      <ul class="sprite-clips">
        {Object.entries(sprite.clips).map(([name, clip]) => (
          <ClipPlaying key={name} name={name} clip={clip} image={image} sprite={sprite} />
        ))}
      </ul>
    </section>
  );
}

function Sheet({ image, sprite }: { image: ImageBitmap; sprite: SpriteRecord }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const zoom = Math.max(1, Math.min(ZOOM_MOST, Math.floor(SHEET_MOST / image.width)));
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const [w, h] = [image.width * zoom, image.height * zoom];
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
    // The grid: one line at each frame's edge, across and down.
    ctx.fillStyle = 'rgb(255 209 102 / 80%)';
    for (let x = 0; x <= image.width; x += sprite.frame[0]) ctx.fillRect(Math.min(x * zoom, w - 1), 0, 1, h);
    for (let y = 0; y <= image.height; y += sprite.frame[1]) ctx.fillRect(0, Math.min(y * zoom, h - 1), w, 1);
  }, [image, sprite, zoom]);
  const across = Math.floor(image.width / sprite.frame[0]);
  const down = Math.floor(image.height / sprite.frame[1]);
  return (
    <canvas
      ref={canvas}
      class="sprite-sheet"
      width={image.width * zoom}
      height={image.height * zoom}
      role="img"
      aria-label={`${sprite.sheet}: ${across * down} frames of ${sprite.frame[0]}×${sprite.frame[1]}, drawn at ${zoom}×`}
    />
  );
}

const stillWanted = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ClipPlaying(props: { name: string; clip: SpriteClip; image: ImageBitmap; sprite: SpriteRecord }) {
  const { name, clip, image, sprite } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fw, fh] = sprite.frame;
  const zoom = Math.max(1, Math.floor(CLIP_SIDE / Math.max(fw, fh)));
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const began = performance.now();
    let shown = -1;
    let asked = 0;
    const draw = (now: number) => {
      const frame = frameAt(clip, (now - began) / 1000, 0, stillWanted());
      if (frame !== shown) {
        shown = frame;
        const at = frameBox(sprite, image.width, frame);
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.drawImage(image, at.x, at.y, fw, fh, 0, 0, fw * zoom, fh * zoom);
        el.dataset.frame = String(frame);
      }
      asked = requestAnimationFrame(draw);
    };
    asked = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(asked);
  }, [clip, image, sprite, zoom]);
  const [first, last] = clip.frames;
  return (
    <li class="sprite-clip">
      <canvas
        ref={canvas}
        class="sprite-frame"
        data-clip={name}
        width={fw * zoom}
        height={fh * zoom}
        role="img"
        aria-label={`The clip ${name} playing`}
      />
      <span>
        <strong>{name}</strong> frames {first}–{last}, {clip.fps} a second{clip.loop === false ? ', once' : ''}
      </span>
    </li>
  );
}
