/**
 * A kit's effect in a row's Do (M3.3, D41): its fields drawn from the same field list its schema is
 * made from (@eb/schema's kitEffects.ts), so the form and the checks can't disagree, and no kit
 * effect needs a form written by hand.
 */
import type { CalendarDef } from '@eb/core';
import { type EffectFile, kitEffectFiles } from '@eb/schema';
import { FieldView } from '../forms/FieldView.tsx';
import { newGroup, type Path } from '../forms/values.ts';

/** The kit effect of this name, when one of the kits on has it with a form: the time kit's in the calendar's units. */
export function kitEffectFile(name: unknown, kits: readonly string[], calendar?: CalendarDef): EffectFile | undefined {
  return typeof name === 'string' ? kitEffectFiles(kits, calendar).find((file) => file.effect === name) : undefined;
}

/** A new effect of the kit's, its fields as a new record's are: what must be filled in, empty. */
export const newKitEffect = (file: EffectFile) => ({ effect: file.effect, ...newGroup(file.fields) });

export function KitEffect({ file, path, value }: { file: EffectFile; path: Path; value: Record<string, unknown> }) {
  return (
    <>
      {Object.entries(file.fields).map(([name, def]) => (
        <FieldView
          key={name}
          label={def.label ?? name}
          def={def}
          info={{
            ...(def.optional ? { optional: true } : {}),
            ...(def.description !== undefined ? { description: def.description } : {}),
          }}
          path={[...path, name]}
          value={value[name]}
        />
      ))}
    </>
  );
}
