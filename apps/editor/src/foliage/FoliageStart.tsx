/**
 * Start from, above a foliage record's form (M5.6, D68): Trees, Bushes, Grass or Rocks written over
 * the record, keeping its name and model, as one step of undo, as a material's Start from is (M5.5).
 */
import { FOLIAGE_PRESETS } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { useForm } from '../forms/formContext.ts';
import { foliageWithPreset } from './foliageEdits.ts';

export function FoliageStart() {
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
          const preset = FOLIAGE_PRESETS.find((p) => p.id === event.currentTarget.value);
          if (preset) api.update([], (now) => foliageWithPreset(now, preset), `Start from ${preset.name}`);
        }}
      >
        <option value="">A preset…</option>
        {FOLIAGE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
    </div>
  );
}
