/**
 * The frame's devices, its fit and its pick (M4.5, D55, docs/specs/designer.md#the-frame), as plain
 * functions. The sizes are CSS pixels: 2060td's tablet and chooser's Steam Deck beside the phones
 * the editor's own checks use.
 */

export interface Device {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export const DEVICES: readonly Device[] = [
  { id: 'phone-360', name: 'Phone, 360 × 740', width: 360, height: 740 },
  { id: 'phone-390', name: 'Phone, 390 × 844', width: 390, height: 844 },
  { id: 'tablet', name: 'Tablet, 820 × 1180', width: 820, height: 1180 },
  { id: 'desktop', name: 'Desktop, 1280 × 800', width: 1280, height: 800 },
];

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A device's size, turned a quarter when `turned`: a phone or tablet to landscape, the desktop on its side. */
export const sizeOf = (device: Device, turned: boolean): Size =>
  turned ? { width: device.height, height: device.width } : { width: device.width, height: device.height };

/** One scale that fits the device into the box, never above its own size: Dirtbag's fit (app/src/ui/App.tsx). */
export function fitScale(box: Size, device: Size): number {
  if (box.width <= 0 || box.height <= 0) return 1;
  return Math.min(1, box.width / device.width, box.height / device.height);
}

export interface Placed {
  /** The widget's JSON Pointer. */
  readonly at: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const depth = (at: string) => at.split('/').length;

/** The deepest widget whose box holds the point: what a tap on the frame selects. */
export function pick(x: number, y: number, placed: readonly Placed[]): string | undefined {
  let best: string | undefined;
  for (const box of placed) {
    const holds = x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    if (holds && (best === undefined || depth(box.at) > depth(best))) best = box.at;
  }
  return best;
}
