/**
 * The engine's figure in three (M6.1, D73, docs/specs/npcs.md#the-look): a body, a waist band, a head
 * and a nose on its −z side, standing on its origin as every placed thing does. Its parts share
 * geometry by height and materials by colour, so a hamlet of figures costs a few of each.
 */
import * as THREE from 'three/webgpu';
import { FIGURE, type FigureLook } from './figureLook.ts';

export function createFigures() {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const material = (color: string) => {
    let made = materials.get(color);
    if (!made) {
      made = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      materials.set(color, made);
    }
    return made;
  };
  const shape = (key: string, make: () => THREE.BufferGeometry) => {
    let made = geometries.get(key);
    if (!made) {
      made = make();
      geometries.set(key, made);
    }
    return made;
  };

  return {
    /** A figure at its look's height and colours, its origin at its feet. */
    figure(look: FigureLook): THREE.Group {
      const h = look.height;
      const r = FIGURE.radius;
      const bodyTop = h * 0.75;
      const head = h * 0.1;
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        shape(`body:${h}`, () =>
          new THREE.CapsuleGeometry(r, Math.max(0.01, bodyTop - 2 * r), 4, 12).translate(0, bodyTop / 2, 0),
        ),
        material(look.clothes),
      );
      const band = new THREE.Mesh(
        shape(`band:${h}`, () =>
          new THREE.CylinderGeometry(r * 1.04, r * 1.04, h * 0.05, 16).translate(0, h * 0.45, 0),
        ),
        material(look.trim),
      );
      const skull = new THREE.Mesh(
        shape(`head:${h}`, () => new THREE.SphereGeometry(head, 16, 12).translate(0, h - head, 0)),
        material(look.skin),
      );
      const nose = new THREE.Mesh(
        shape(`nose:${h}`, () =>
          new THREE.BoxGeometry(head * 0.35, head * 0.35, head * 0.5).translate(0, h - head, -head),
        ),
        material(look.skin),
      );
      for (const part of [body, band, skull, nose]) {
        part.castShadow = true;
        group.add(part);
      }
      // Its look, for the hooks: what the e2e reads of a figure drawn.
      group.userData.figure = look;
      return group;
    },
    dispose() {
      for (const each of materials.values()) each.dispose();
      for (const each of geometries.values()) each.dispose();
      materials.clear();
      geometries.clear();
    },
  };
}

/** The figures drawn under each top-level object, as their looks: the hooks' figures(). */
export function figuresIn(root: THREE.Object3D | undefined): (FigureLook & { readonly object: string })[] {
  if (!root) return [];
  return root.children.flatMap((object) => {
    const found: (FigureLook & { readonly object: string })[] = [];
    object.traverse((node) => {
      const look = node.userData.figure as FigureLook | undefined;
      if (look) found.push({ object: String(object.userData.objectId), ...look });
    });
    return found;
  });
}
