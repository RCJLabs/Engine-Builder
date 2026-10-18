/**
 * A kit's own fields in the type designer (M3.3, D41): shown, not changed. The kit's module reads
 * them, so renaming or removing one would break it; the project's own fields follow below.
 */
import type { TypeFile } from '@eb/schema';
import { KIND_NAMES } from './kinds.ts';

export function KitFields({ kit, file }: { kit: string; file: TypeFile }) {
  return (
    <section class="kit-fields" aria-label={`The ${kit} kit’s fields`}>
      <h4>{`From the ${kit} kit`}</h4>
      <p class="muted">These fields are the kit’s, which reads them. Add fields of your own below.</p>
      <ul class="kit-field-list">
        {Object.entries(file.fields).map(([name, def]) => (
          <li key={name}>
            <span class="kit-field-name">{def.label ?? name}</span>{' '}
            <span class="muted mono">{`${name} · ${KIND_NAMES[def.kind]}${def.optional ? ' · optional' : ''}`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
