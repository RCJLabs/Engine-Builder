/**
 * The terrain in the Scene panel's view (M5.3, D65): its chunks as three meshes, each at the detail
 * its distance from the camera gives it, its edges laid on coarser neighbours' so no seam cracks; a
 * stroke's dabs drawn as they land; the brush's ring under the pointer. The grid it draws is decoded
 * from the space's two files, and again only when they change.
 */
import { CHUNK, type TerrainJson } from '@eb/compiler';
import { decodeGray16, decodePng } from '@eb/export';
import * as THREE from 'three/webgpu';
import type { Area, Brush } from '../terrain/brushes.ts';
import { chunkMesh, chunksOf, chunksPerSide, edgeLine, lodFor, rgbOf, seamGap } from '../terrain/chunks.ts';
import { cellOf, extentOf, gridFromFiles, heightAt, heightOf, type TerrainGrid } from '../terrain/grid.ts';
import { groundHit } from '../terrain/ray.ts';
import { type Stroke, startStroke } from '../terrain/stroke.ts';
import type { Ray } from './gizmoMath.ts';
import type { Vec3 } from './vec.ts';

export interface TerrainFiles {
  readonly heights: Uint8Array | null;
  readonly paint: Uint8Array | null;
}

/** What the e2e reads of it: each chunk's level and triangles, and the widest gap at any seam, from the buffers. */
export interface TerrainSummary {
  readonly size: number;
  /** Each chunk's level, the triangles it draws, and its centre's distance from the camera that chose the level. */
  readonly chunks: readonly { cx: number; cz: number; lod: number; triangles: number; distance: number }[];
  readonly seams: { readonly mixed: number; readonly gap: number };
  /** The widest gap, in metres, between a chunk's inner vertices as drawn and the grid's heights there. */
  readonly drawn: number;
}

const same = (a: Uint8Array | null, b: Uint8Array | null) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
};

/** The vertices whose heights or paint differ, or null for none. */
function differing(a: TerrainGrid, b: TerrainGrid): Area | null {
  let area: { i0: number; i1: number; j0: number; j1: number } | null = null;
  const repainted = (v: number) => {
    for (let c = v * 4; c < v * 4 + 4; c++) if (a.paint[c] !== b.paint[c]) return true;
    return false;
  };
  for (let v = 0; v < a.heights.length; v++) {
    if (a.heights[v] === b.heights[v] && !repainted(v)) continue;
    const i = v % a.size;
    const j = (v - i) / a.size;
    if (!area) area = { i0: i, i1: i, j0: j, j1: j };
    else {
      area.i0 = Math.min(area.i0, i);
      area.i1 = Math.max(area.i1, i);
      area.j0 = Math.min(area.j0, j);
      area.j1 = Math.max(area.j1, j);
    }
  }
  return area;
}

export function createTerrainView(ringColor: string, draw: () => void) {
  const root = new THREE.Group();
  const chunks = new THREE.Group();
  root.add(chunks);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const ringPoints = 64;
  // A line closed by its last point on its first: WebGPURenderer draws no LineLoop.
  const ring = new THREE.Line(
    new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array((ringPoints + 1) * 3), 3),
    ),
    new THREE.LineBasicMaterial({ color: ringColor, depthTest: false }),
  );
  ring.renderOrder = 10;
  ring.visible = false;
  root.add(ring);

  let grid: TerrainGrid | null = null;
  let shown: { settings: string; heights: Uint8Array | null; paint: Uint8Array | null } | null = null;
  let colours: [number, number, number][] = [];
  let meshes: THREE.Mesh[] = [];
  let lods: number[] = [];
  let distances: number[] = [];
  let stroke: Stroke | null = null;

  const clear = () => {
    for (const mesh of meshes) mesh.geometry.dispose();
    chunks.clear();
    meshes = [];
    lods = [];
    distances = [];
  };

  const build = (k: number) => {
    if (!grid) return;
    const n = chunksPerSide(grid);
    const [cx, cz] = [k % n, Math.floor(k / n)];
    const made = chunkMesh(
      grid,
      cx,
      cz,
      lods[k] as number,
      {
        west: cx > 0 ? lods[k - 1] : undefined,
        east: cx < n - 1 ? lods[k + 1] : undefined,
        north: cz > 0 ? lods[k - n] : undefined,
        south: cz < n - 1 ? lods[k + n] : undefined,
      },
      colours,
    );
    const mesh = meshes[k] as THREE.Mesh;
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (position && position.array.length === made.positions.length) {
      // The same level: the same buffers, written again, so a stroke re-uploads and allocates nothing.
      for (const [name, data] of [
        ['position', made.positions],
        ['normal', made.normals],
        ['color', made.colors],
      ] as const) {
        const attribute = mesh.geometry.getAttribute(name) as THREE.BufferAttribute;
        (attribute.array as Float32Array).set(data);
        attribute.needsUpdate = true;
      }
    } else {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(made.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(made.normals, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(made.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(made.indices, 1));
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    }
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  };

  /** Draws again the chunks an area of vertices reaches, and the vertices beside it, whose normals it moved. */
  const rebuild = (area: Area | null) => {
    if (!grid || !area) return;
    const last = grid.size - 1;
    const wider = {
      i0: Math.max(0, area.i0 - 1),
      i1: Math.min(last, area.i1 + 1),
      j0: Math.max(0, area.j0 - 1),
      j1: Math.min(last, area.j1 + 1),
    };
    const n = chunksPerSide(grid);
    for (const [cx, cz] of chunksOf(grid, wider)) build(cz * n + cx);
    draw();
  };

  const lay = (next: TerrainGrid) => {
    clear();
    grid = next;
    const n = chunksPerSide(next);
    lods = new Array(n * n).fill(0);
    for (let k = 0; k < n * n; k++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      meshes.push(mesh);
      chunks.add(mesh);
    }
    for (let k = 0; k < n * n; k++) build(k);
  };

  const hitOf = (ray: Ray) => (grid ? groundHit(grid, ray.origin, ray.dir) : null);

  return {
    root,
    chunks,
    grid: () => grid,
    /** Shows a space's terrain, or none: a problem in words when its files can't be read, which the Problems panel names too. */
    show(settings: TerrainJson | null, files: TerrainFiles | null): string | null {
      if (!settings || !files) {
        if (grid) clear();
        grid = null;
        shown = null;
        return null;
      }
      const text = JSON.stringify(settings);
      if (shown && shown.settings === text && same(shown.heights, files.heights) && same(shown.paint, files.paint)) {
        return null;
      }
      if (stroke) stroke = null;
      try {
        if (!files.heights || !files.paint) throw new Error('its heights or paint file is missing');
        const next = gridFromFiles(settings, decodeGray16(files.heights), decodePng(files.paint));
        colours = settings.layers.map((l) => rgbOf(l.color));
        const before = grid;
        const kept = before && shown?.settings === text;
        shown = { settings: text, heights: files.heights, paint: files.paint };
        if (kept && before) {
          // The same settings, other bytes (a stroke written, an undo): only what changed is drawn again.
          const area = differing(before, next);
          before.heights.set(next.heights);
          before.paint.set(next.paint);
          rebuild(area);
        } else lay(next);
        draw();
        return null;
      } catch (error) {
        clear();
        grid = null;
        shown = null;
        draw();
        return error instanceof Error ? error.message : String(error);
      }
    },
    ground: (ray: Ray): Vec3 | null => hitOf(ray),
    height: (x: number, z: number): number | null => (grid ? heightAt(grid, x, z) : null),
    /** The four paint weights of the vertex nearest (x, z). */
    paint(x: number, z: number): number[] | null {
      const g = grid;
      if (!g) return null;
      const [fi, fj] = cellOf(g, x, z);
      const clamp = (v: number) => Math.min(g.size - 1, Math.max(0, Math.round(v)));
      const at = (clamp(fj) * g.size + clamp(fi)) * 4;
      return [...g.paint.subarray(at, at + 4)];
    },
    /** Each chunk's level for a camera at `eye`; a chunk whose level changed is drawn again with its neighbours. */
    levels(eye: Vec3): void {
      if (!grid) return;
      const n = chunksPerSide(grid);
      const width = CHUNK * grid.spacing;
      const e = extentOf(grid);
      const dirty = new Set<number>();
      for (let k = 0; k < n * n; k++) {
        const x = ((k % n) + 0.5) * width - e;
        const z = (Math.floor(k / n) + 0.5) * width - e;
        const distance = Math.hypot(eye[0] - x, eye[1] - heightAt(grid, x, z), eye[2] - z);
        distances[k] = distance;
        const lod = lodFor(distance, width);
        if (lod === lods[k]) continue;
        lods[k] = lod;
        for (const near of [k, k % n > 0 ? k - 1 : -1, k % n < n - 1 ? k + 1 : -1, k - n, k + n]) {
          if (near >= 0 && near < n * n) dirty.add(near);
        }
      }
      for (const k of dirty) build(k);
    },
    /** A stroke starting under the ray: false when the ray misses the ground. */
    start(ray: Ray, brush: Brush): boolean {
      const hit = hitOf(ray);
      if (!grid || !hit) return false;
      stroke = startStroke(grid, brush, hit[0], hit[2]);
      rebuild(stroke.area());
      return true;
    },
    to(ray: Ray): void {
      if (!stroke) return;
      const hit = hitOf(ray);
      if (!hit) stroke.lift();
      else rebuild(stroke.to(hit[0], hit[2]));
    },
    /** The stroke over: kept, it is returned for its file to be written; not kept, the grid goes back. */
    end(keep: boolean): Stroke | null {
      const done = stroke;
      stroke = null;
      if (!done) return null;
      if (!keep) {
        rebuild(done.undo());
        return null;
      }
      return done.area() ? done : null;
    },
    /** The brush's ring on the ground under the ray, or hidden for null. */
    ring(ray: Ray | null, radius: number): void {
      const hit = ray ? hitOf(ray) : null;
      const was = ring.visible;
      ring.visible = hit !== null && grid !== null;
      if (hit && grid) {
        const position = ring.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k <= ringPoints; k++) {
          const x = hit[0] + radius * Math.cos((k / ringPoints) * 2 * Math.PI);
          const z = hit[2] + radius * Math.sin((k / ringPoints) * 2 * Math.PI);
          position.setXYZ(k, x, heightAt(grid, x, z) + 0.05, z);
        }
        position.needsUpdate = true;
        ring.geometry.computeBoundingSphere();
      }
      if (was || ring.visible) draw();
    },
    summary(): TerrainSummary | null {
      if (!grid) return null;
      const n = chunksPerSide(grid);
      const lines = (k: number, side: 'east' | 'west' | 'north' | 'south') =>
        edgeLine((meshes[k] as THREE.Mesh).geometry.getAttribute('position').array as Float32Array, side);
      let mixed = 0;
      let gap = 0;
      for (let k = 0; k < n * n; k++) {
        for (const [other, mine, theirs] of [
          [k % n < n - 1 ? k + 1 : -1, 'east', 'west'],
          [k + n < n * n ? k + n : -1, 'south', 'north'],
        ] as const) {
          if (other < 0) continue;
          if (lods[k] !== lods[other]) mixed++;
          gap = Math.max(gap, seamGap(lines(k, mine), lines(other, theirs)));
        }
      }
      let drawn = 0;
      for (let k = 0; k < n * n; k++) {
        const positions = (meshes[k] as THREE.Mesh).geometry.getAttribute('position').array as Float32Array;
        const side = Math.round(Math.sqrt(positions.length / 3)) - 1;
        const step = CHUNK / side;
        for (let b = 1; b < side; b++) {
          for (let a = 1; a < side; a++) {
            const i = (k % n) * CHUNK + a * step;
            const j = Math.floor(k / n) * CHUNK + b * step;
            const y = positions[(b * (side + 1) + a) * 3 + 1] as number;
            drawn = Math.max(drawn, Math.abs(y - heightOf(grid, i, j)));
          }
        }
      }
      return {
        size: grid.size,
        drawn,
        chunks: lods.map((lod, k) => ({
          cx: k % n,
          cz: Math.floor(k / n),
          lod,
          triangles: ((meshes[k] as THREE.Mesh).geometry.index?.count ?? 0) / 3,
          distance: distances[k] ?? 0,
        })),
        seams: { mixed, gap },
      };
    },
    dispose(): void {
      clear();
      grid = null;
      stroke = null;
      material.dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
    },
  };
}

export type TerrainView = ReturnType<typeof createTerrainView>;
