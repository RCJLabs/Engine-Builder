// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// The one grid model: ship layouts now, battle maps and the colony later.
// A grid is plain data, { width, height, cells }, with cells in row-major
// order. Functions never change their input.

export type Side = 'n' | 'e' | 's' | 'w';

export interface Grid<T> {
  width: number;
  height: number;
  cells: T[];
}

export const SIDES: Side[] = ['n', 'e', 's', 'w'];
export const OPPOSITE: Record<Side, Side> = { n: 's', e: 'w', s: 'n', w: 'e' };
const STEP: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

export function createGrid<T>(width: number, height: number, fill: T): Grid<T> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`createGrid: bad size ${width}x${height}`);
  }
  return { width, height, cells: new Array(width * height).fill(fill) };
}

export function inBounds<T>(grid: Grid<T>, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

// The value at (x, y), or undefined outside the grid.
export function cellAt<T>(grid: Grid<T>, x: number, y: number): T | undefined {
  return inBounds(grid, x, y) ? grid.cells[y * grid.width + x] : undefined;
}

// A copy of the grid with each [x, y] in positions set to value.
export function withCells<T>(grid: Grid<T>, positions: [number, number][], value: T): Grid<T> {
  const cells = grid.cells.slice();
  for (const [x, y] of positions) {
    if (!inBounds(grid, x, y)) throw new RangeError(`withCells: (${x}, ${y}) is outside the grid`);
    cells[y * grid.width + x] = value;
  }
  return { ...grid, cells };
}

// The cell across the given side of (x, y).
export function step(x: number, y: number, side: Side): [number, number] {
  const [dx, dy] = STEP[side];
  return [x + dx, y + dy];
}

// A predicate for "(x, y) is outside": beyond the grid, or an open cell
// joined to the grid's edge through open cells. Open means isOpen(value) is
// true. Enclosed holes are not outside.
export function exteriorOf<T>(grid: Grid<T>, isOpen: (value: T) => boolean): (x: number, y: number) => boolean {
  const { width, height } = grid;
  const outside = new Uint8Array(width * height);
  const queue: number[] = [];
  const visit = (x: number, y: number) => {
    const i = y * width + x;
    if (!outside[i] && isOpen(grid.cells[i] as T)) {
      outside[i] = 1;
      queue.push(x, y);
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    visit(0, y);
    visit(width - 1, y);
  }
  while (queue.length) {
    const y = queue.pop() as number;
    const x = queue.pop() as number;
    for (const side of SIDES) {
      const [nx, ny] = step(x, y, side);
      if (inBounds(grid, nx, ny)) visit(nx, ny);
    }
  }
  return (x, y) => !inBounds(grid, x, y) || outside[y * width + x] === 1;
}
