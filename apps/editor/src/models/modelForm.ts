/**
 * The model's and the material's forms as plain functions (M5.5, D67, docs/specs/models.md#the-models-form):
 * a slot given a material record or given back to the file, and a material started from a preset.
 */
import type { ColliderShape, MaterialPreset, MaterialRecord, ModelSlot } from '@eb/schema';

const isSlot = (item: unknown): item is ModelSlot =>
  typeof item === 'object' && item !== null && typeof (item as ModelSlot).slot === 'string';

/** The material record a slot is drawn with, or null when it is drawn as the file has it. */
export function slotMaterial(materials: unknown, slot: string): string | null {
  const found = Array.isArray(materials) ? materials.filter(isSlot).find((item) => item.slot === slot) : undefined;
  return typeof found?.material === 'string' ? found.material : null;
}

/**
 * `materials` with `slot` drawn with `material`, or as the file has it when that is null: the
 * slot's entry changed in place, or added after the others; undefined once no slot is listed.
 */
export function withSlot(materials: unknown, slot: string, material: string | null): ModelSlot[] | undefined {
  const now = Array.isArray(materials) ? materials : [];
  const at = now.findIndex((item) => isSlot(item) && item.slot === slot);
  const next =
    material === null
      ? now.filter((_, i) => i !== at)
      : at >= 0
        ? now.map((item, i) => (i === at ? { ...(item as ModelSlot), material } : item))
        : [...now, { slot, material }];
  return next.length > 0 ? (next as ModelSlot[]) : undefined;
}

/** A material record become a preset, keeping its name. */
export function materialWithPreset(value: unknown, preset: MaterialPreset): MaterialRecord {
  const name = typeof value === 'object' && value !== null ? (value as { name?: unknown }).name : undefined;
  return { ...(typeof name === 'string' ? { name } : {}), ...preset.value };
}

/** Fit collider's buttons, in the order the spec lists them. */
export const FITS: readonly { readonly shape: ColliderShape; readonly label: string }[] = Object.freeze([
  { shape: 'box', label: 'Box' },
  { shape: 'sphere', label: 'Sphere' },
  { shape: 'capsule', label: 'Capsule' },
  { shape: 'hull', label: 'Hull' },
]);
