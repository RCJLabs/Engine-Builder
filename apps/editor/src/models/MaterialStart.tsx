/**
 * Start from, above a material's form (M5.5, D67): one of the eight presets written over the
 * record, keeping its name, as one step of undo, as an environment's Start from is (M5.4).
 */
import { MATERIAL_PRESETS } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { useForm } from '../forms/formContext.ts';
import { materialWithPreset } from './modelForm.ts';

export function MaterialStart() {
  const api = useForm();
  const id = useUniqueId();
  return (
    <div class="form-field">
      <label for={id}>Start from</label>
      <select
        id={id}
        class="field form-select"
        value=""
        disabled={!api.canEdit}
        onChange={(event) => {
          const preset = MATERIAL_PRESETS.find((p) => p.id === event.currentTarget.value);
          if (preset) api.update([], (now) => materialWithPreset(now, preset), `Start from ${preset.name}`);
        }}
      >
        <option value="">A preset…</option>
        {MATERIAL_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
    </div>
  );
}
