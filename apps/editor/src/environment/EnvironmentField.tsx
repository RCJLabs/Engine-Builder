/**
 * A space's environment in the inspector (M5.4, D66, docs/specs/environments.md#the-editor), with
 * nothing chosen: which of the project's environments it is drawn under, a new one from a preset,
 * Open environment for the whole form, and its hour, fog and weather here too. Those are the
 * record's own fields, so a change shows in every space that names it.
 */
import { ENVIRONMENT, type EnvironmentRecord, WEATHERS } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import type { OpenProject } from '../projects/opened.ts';
import { openRecord } from '../records/actions.ts';
import { nameIn } from '../records/names.ts';
import { NumberRow } from '../spaces/ObjectFields.tsx';
import { chooseEnvironment, newEnvironmentHere, setEnvironmentField } from './actions.ts';
import { lookOf } from './look.ts';
import { PRESETS } from './presets.ts';

/** A fog given where there was none: from 30 m, whole at 300 m, in the colour of the horizon. */
const NEW_FOG = { near: 30, far: 300 } as const;
const FOG_MOST = 10000;

/** An hour as a clock shows it: 6.5 is "06:30". */
export const clockOf = (hour: number): string => {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export function EnvironmentField(props: {
  project: OpenProject;
  id: string | undefined;
  record: EnvironmentRecord | null | undefined;
}) {
  const { project, id, record } = props;
  const canEdit = editing.access.value.kind === 'editing';
  const pickId = useUniqueId();
  const newId = useUniqueId();
  const ids = project.catalog.records.get(ENVIRONMENT) ?? [];
  const file = project.catalog.types.get(ENVIRONMENT)?.file;
  const nameOf = (each: string) => nameIn(file, project.index?.records.get(`${ENVIRONMENT}:${each}`)?.value) ?? each;
  return (
    <form class="object-form environment-form" onSubmit={(event) => event.preventDefault()}>
      <h3>Environment</h3>
      <p class="muted">The sky, the light, fog and weather the space is drawn under.</p>
      <div class="form-field">
        <label for={pickId}>Environment</label>
        <select
          id={pickId}
          class="field form-select"
          value={id ?? ''}
          disabled={!canEdit}
          onChange={(event) => void chooseEnvironment(event.currentTarget.value || null)}
        >
          <option value="">None: the editor’s own light</option>
          {id !== undefined && !ids.includes(id) ? <option value={id}>{id} (no such record)</option> : null}
          {ids.map((each) => (
            <option key={each} value={each}>
              {nameOf(each)}
            </option>
          ))}
        </select>
      </div>
      {canEdit ? (
        <div class="form-field">
          <label for={newId}>New environment from</label>
          <select
            id={newId}
            class="field form-select"
            value=""
            onChange={(event) => {
              const preset = PRESETS.find((p) => p.id === event.currentTarget.value);
              if (preset) void newEnvironmentHere(preset);
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
      ) : null}
      {id !== undefined && ids.includes(id) ? (
        <button type="button" class="button" onClick={() => openRecord(ENVIRONMENT, id)}>
          Open environment
        </button>
      ) : null}
      {id !== undefined && record === null ? (
        <p class="field-problem">
          {ids.includes(id)
            ? `The environment “${id}” has a problem, so it isn’t drawn: open it to see what.`
            : `There is no environment record “${id}”. Choose another, or make a new one.`}
        </p>
      ) : null}
      {id !== undefined && record ? <RecordFields id={id} record={record} canEdit={canEdit} /> : null}
    </form>
  );
}

function RecordFields({ id, record, canEdit }: { id: string; record: EnvironmentRecord; canEdit: boolean }) {
  const look = lookOf(record);
  const set = (field: string, next: unknown, label: string) => void setEnvironmentField(id, [field], next, label);
  const fog = record.fog;
  return (
    <>
      <Slider
        label="Hour"
        value={record.hour ?? 12}
        shown={clockOf(record.hour ?? 12)}
        min={0}
        max={24}
        step={0.25}
        canEdit={canEdit}
        set={(n) => set('hour', n, 'Hour')}
      />
      <Check
        label="Fog"
        checked={fog !== undefined}
        canEdit={canEdit}
        set={(on) => set('fog', on ? { color: look.horizon, ...NEW_FOG } : undefined, on ? 'Add fog' : 'Remove fog')}
      />
      {fog ? (
        <>
          <NumberRow
            label="Fog near, in metres"
            value={fog.near}
            canEdit={canEdit}
            onLeave
            fits={(n) => n >= 0 && n < fog.far}
            why={`From 0 m, and below far, ${fog.far} m`}
            write={(near) => set('fog', { ...fog, near }, 'Fog near')}
          />
          <NumberRow
            label="Fog far, in metres"
            value={fog.far}
            canEdit={canEdit}
            onLeave
            fits={(n) => n > fog.near && n <= FOG_MOST}
            why={`Above near, ${fog.near} m, and at most ${FOG_MOST} m`}
            write={(far) => set('fog', { ...fog, far }, 'Fog far')}
          />
        </>
      ) : null}
      <Weather record={record} canEdit={canEdit} set={set} />
    </>
  );
}

function Weather(props: {
  record: EnvironmentRecord;
  canEdit: boolean;
  set: (field: string, next: unknown, label: string) => void;
}) {
  const { record, canEdit, set } = props;
  const id = useUniqueId();
  const weather = record.weather ?? 'none';
  return (
    <>
      <div class="form-field">
        <label for={id}>Weather</label>
        <select
          id={id}
          class="field form-select"
          value={weather}
          disabled={!canEdit}
          onChange={(event) => {
            const next = event.currentTarget.value;
            set('weather', next === 'none' ? undefined : next, 'Weather');
          }}
        >
          {WEATHERS.map((each) => (
            <option key={each} value={each}>
              {each === 'none' ? 'None' : each === 'rain' ? 'Rain' : 'Snow'}
            </option>
          ))}
        </select>
      </div>
      {weather !== 'none' ? (
        <Slider
          label="Weather amount"
          value={record['weather-amount'] ?? 0.5}
          shown={String(record['weather-amount'] ?? 0.5)}
          min={0}
          max={1}
          step={0.05}
          canEdit={canEdit}
          set={(n) => set('weather-amount', n, 'Weather amount')}
        />
      ) : null}
    </>
  );
}

function Slider(props: {
  label: string;
  value: number;
  shown: string;
  min: number;
  max: number;
  step: number;
  canEdit: boolean;
  set: (n: number) => void;
}) {
  const id = useUniqueId();
  return (
    <div class="form-field environment-slider">
      <label for={id}>{props.label}</label>
      <input
        id={id}
        class="form-slider"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={!props.canEdit}
        onInput={(event) => props.set(Number(event.currentTarget.value))}
      />
      <output for={id}>{props.shown}</output>
    </div>
  );
}

function Check(props: { label: string; checked: boolean; canEdit: boolean; set: (on: boolean) => void }) {
  const id = useUniqueId();
  return (
    <div class="form-field form-bool">
      <input
        id={id}
        type="checkbox"
        class="form-check"
        checked={props.checked}
        disabled={!props.canEdit}
        onChange={(event) => props.set(event.currentTarget.checked)}
      />
      <label for={id}>{props.label}</label>
    </div>
  );
}
