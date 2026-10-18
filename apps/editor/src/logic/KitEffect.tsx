/**
 * A kit's effect in a row's Do (M3.3, D41): its fields drawn from the same field list its schema is
 * made from (@eb/schema's kitEffects.ts), so the form and the checks can't disagree, and no kit
 * effect needs a form written by hand.
 */
import { type EffectFile, KIT_EFFECT_FILES } from '@eb/schema';
import { FieldView } from '../forms/FieldView.tsx';
import { newGroup, type Path } from '../forms/values.ts';

const FILES = new Map(KIT_EFFECT_FILES.map((file) => [file.effect, file]));

/** The kit effect of this name, when one of the kits on has it. */
export function kitEffectFile(name: unknown, kits: readonly string[]): EffectFile | undefined {
  const file = typeof name === 'string' ? FILES.get(name) : undefined;
  return file && kits.includes(file.kit) ? file : undefined;
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
