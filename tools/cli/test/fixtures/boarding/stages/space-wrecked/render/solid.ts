// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Solid 3D shapes for the ship seen from outside: faces with outward
// normals, so the painter can drop the ones facing away, light the rest and
// draw them back to front. A face is
//   { pts: [[x, y, z], ...], normal: [x, y, z], color, edge?, emissive?, alpha?, bias? }
// color is '#rrggbb'; edge is a stroke color for its outline, or 'fill' for
// its own lit color (which hides the seams of a curved surface); an emissive
// face isn't shaded; alpha (0 to 1) lets what is behind it show through;
// bias nudges its place in the draw order (negative is
// nearer), and sortAt, a point, sorts it as if it were there (paint on a
// wall sorts with the wall). Coordinates are cells, z up.
//
// The shapes only the ship's outside is made of (cylinders, tubes, a
// module's faces placed) stay behind with it.

export type Vec3 = number[];

export interface Face {
  pts: Vec3[];
  normal: Vec3;
  color: string;
  edge?: string | null;
  emissive?: boolean;
  alpha?: number;
  bias?: number;
  sortAt?: Vec3;
}

// What a face may carry besides its points, normal and color.
export type FaceExtra = Partial<Omit<Face, 'pts' | 'normal' | 'color'>>;

// A box: its top and four sides (the bottom sits on something).
export function solidBox(out: Face[], [x0, y0, z0]: Vec3, [x1, y1, z1]: Vec3, color: string, extra: FaceExtra = {}): void {
  out.push(
    { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], normal: [0, 0, 1], color, ...extra },
    { pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], normal: [0, -1, 0], color, ...extra },
    { pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], normal: [1, 0, 0], color, ...extra },
    { pts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], normal: [0, 1, 0], color, ...extra },
    { pts: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], normal: [-1, 0, 0], color, ...extra },
  );
}

// A flat plate lying at height z.
export function plate(out: Face[], [x0, y0]: number[], [x1, y1]: number[], z: number, color: string, extra: FaceExtra = {}): void {
  out.push({ pts: [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], normal: [0, 0, 1], color, ...extra });
}

// The outward normal of a polygon, given a point inside the solid. Newell's
// method, so a corner given twice (a hull's band where it narrows to a
// point, hullShape.js) is no trouble, and a polygon a little off flat gets
// its average.
export function normalOf(pts: Vec3[], inside: Vec3): Vec3 {
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = [pts[i] as Vec3, pts[(i + 1) % pts.length] as Vec3];
    n = [n[0] + (a[1] - b[1]) * (a[2] + b[2]), n[1] + (a[2] - b[2]) * (a[0] + b[0]), n[2] + (a[0] - b[0]) * (a[1] + b[1])];
  }
  const len = Math.hypot(...n) || 1;
  n = n.map((k) => k / len);
  const mid = [0, 1, 2].map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length);
  const out = [mid[0] - inside[0], mid[1] - inside[1], mid[2] - inside[2]];
  return n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0 ? n.map((k) => -k) : n;
}

// Where the light comes from: above, behind and to port.
export const LIGHT: Vec3 = (() => {
  const v = [-0.35, -0.55, 0.76];
  const len = Math.hypot(...v);
  return v.map((k) => k / len);
})();

// A face's fill: its color lit by LIGHT, as an rgb() string, or rgba() for
// a face with an alpha (marks on the deck that the floor shows through).
export function shade(face: Face, light: Vec3 = LIGHT): string {
  const n = parseInt(face.color.slice(1), 16);
  let [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  if (!face.emissive) {
    const lit = face.normal[0] * light[0] + face.normal[1] * light[1] + face.normal[2] * light[2];
    const k = 0.45 + 0.6 * Math.max(0, lit);
    [r, g, b] = [r, g, b].map((v) => Math.min(255, Math.round(v * k)));
  }
  return face.alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${face.alpha})`;
}
