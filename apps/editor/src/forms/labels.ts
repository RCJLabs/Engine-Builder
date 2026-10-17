/** The words forms show for fields and records. */
import type { FieldInfo } from '@eb/schema';

/**
 * A field name as words, for a field with no label of its own: "hitPoints", "hit_points" and
 * "hit-points" all read "Hit points". A run of capitals stays one word: "maxHP" reads "Max HP".
 */
export function humanize(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z][a-z])/g, (_, a: string, b: string) => `${a} ${b.toLowerCase()}`)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const labelOf = (name: string, info: FieldInfo): string => info.label ?? humanize(name);

/**
 * An id from what someone typed: lowercase words joined by hyphens, accents dropped, at most 64
 * characters. "Ludus Magnus" gives "ludus-magnus". Empty when nothing usable was typed.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}
