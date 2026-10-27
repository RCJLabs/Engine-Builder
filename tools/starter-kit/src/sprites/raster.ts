/**
 * A pixel sheet drawn in code (M7.1): a grid of frames, each filled with the palette's colours by
 * whole pixels, x to the right and y up from the frame's foot, as a 2D space measures; written as
 * an RGBA PNG with rows top to bottom. Nothing here blends: a pixel is a palette colour or clear.
 */
import { encodePng } from '@eb/export';
import { type Colour, PALETTE } from './palette.ts';

export class Sheet {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly across: number;
  readonly down: number;
  readonly cells: (Colour | null)[];

  constructor(frameWidth: number, frameHeight: number, across: number, down = 1) {
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    this.across = across;
    this.down = down;
    this.cells = new Array(this.width * this.height).fill(null);
  }

  get width(): number {
    return this.frameWidth * this.across;
  }

  get height(): number {
    return this.frameHeight * this.down;
  }

  /** Frame `n`, counted across and then down from the sheet's top as the stage reads it, as a drawing surface of its own. */
  frame(n: number): Frame {
    const row = this.down - 1 - Math.floor(n / this.across);
    return new Frame(this, (n % this.across) * this.frameWidth, row * this.frameHeight);
  }

  png(): Uint8Array {
    const data = new Uint8Array(this.width * this.height * 4);
    for (let row = 0; row < this.height; row++)
      for (let x = 0; x < this.width; x++) {
        const colour = this.cells[(this.height - 1 - row) * this.width + x];
        if (!colour) continue;
        const hex = PALETTE[colour];
        const at = (row * this.width + x) * 4;
        data.set(
          [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255],
          at,
        );
      }
    return encodePng({ width: this.width, height: this.height, data });
  }
}

/** One frame of a sheet: what is drawn outside it is dropped, so a frame never bleeds into the next. */
export class Frame {
  private readonly sheet: Sheet;
  private readonly left: number;
  private readonly foot: number;

  constructor(sheet: Sheet, left: number, foot: number) {
    this.sheet = sheet;
    this.left = left;
    this.foot = foot;
  }

  get width(): number {
    return this.sheet.frameWidth;
  }

  get height(): number {
    return this.sheet.frameHeight;
  }

  private index(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    return (this.foot + y) * this.sheet.width + this.left + x;
  }

  get(x: number, y: number): Colour | null {
    const i = this.index(x, y);
    return i === null ? null : (this.sheet.cells[i] ?? null);
  }

  set(x: number, y: number, colour: Colour | null): void {
    const i = this.index(x, y);
    if (i !== null) this.sheet.cells[i] = colour;
  }

  /** A filled rectangle from (x, y) up and to the right. */
  rect(x: number, y: number, w: number, h: number, colour: Colour): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, colour);
  }

  /**
   * Rows of characters, the first row the highest, its foot at (x, y): each character a colour by
   * `key`, '.' clear and left as it was.
   */
  rows(x: number, y: number, rows: readonly string[], key: Readonly<Record<string, Colour>>): void {
    rows.forEach((row, i) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx] as string;
        if (ch === '.') continue;
        const colour = key[ch];
        if (!colour) throw new Error(`No colour for “${ch}”`);
        this.set(x + dx, y + rows.length - 1 - i, colour);
      }
    });
  }

  /** Every clear pixel beside a drawn one, across or up and down, drawn in `colour`: a one-pixel outline, ink boots included. */
  outline(colour: Colour): void {
    const edge: [number, number][] = [];
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== null) continue;
        const near = [this.get(x - 1, y), this.get(x + 1, y), this.get(x, y - 1), this.get(x, y + 1)];
        if (near.some((c) => c !== null)) edge.push([x, y]);
      }
    for (const [x, y] of edge) this.set(x, y, colour);
  }
}

/** A whole number from a seed and a place, the same in every run: the sheets' texture, never Math.random. */
export function hash(seed: number, x: number, y = 0): number {
  let h = (seed * 374761393 + x * 668265263 + y * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
