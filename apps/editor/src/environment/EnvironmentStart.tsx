/**
 * Start from, above an environment's form (M5.4, D66): one of the seven presets written over the
 * record, keeping its name, as one step of undo, as a sound's Start from is (M4.8).
 */
import { useUniqueId } from '../app/ids.ts';
import { useForm } from '../forms/formContext.ts';
import { PRESETS, withPreset } from './presets.ts';

export function EnvironmentStart() {
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
          const preset = PRESETS.find((p) => p.id === event.currentTarget.value);
          if (preset) api.update([], (now) => withPreset(now, preset), `Start from ${preset.name}`);
        }}
      >
        <option value="">A preset…</option>
        {PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
    </div>
  );
}
