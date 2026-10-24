/**
 * Above a model record's form (M5.5, D67, docs/specs/models.md#the-models-form): its file's facts,
 * a picker of material records for each of the file's materials, which writes `materials`, and
 * Fit collider, which measures the decoded mesh in the model worker and writes `collider`.
 */
import { type GltfSummary, gltfSummary } from '@eb/compiler';
import { MATERIAL } from '@eb/schema';
import { useMemo } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { ModelFacts } from '../assets/AssetPreview.tsx';
import { useAssetFile } from '../assets/useAssetFile.ts';
import { useForm } from '../forms/formContext.ts';
import type { OpenProject } from '../projects/opened.ts';
import { FitCollider } from './FitCollider.tsx';
import { slotMaterial, withSlot } from './modelForm.ts';

export function ModelHead({ project, value }: { project: OpenProject; value: unknown }) {
  const file = typeof value === 'object' && value !== null ? (value as { file?: unknown }).file : undefined;
  if (typeof file !== 'string' || !project.catalog.assets.includes(file)) return null;
  return <ModelFile project={project} path={file} value={value} />;
}

function ModelFile({ project, path, value }: { project: OpenProject; path: string; value: unknown }) {
  const { bytes } = useAssetFile(project, path, false);
  const assets = project.catalog.assets;
  const summary = useMemo(() => (bytes ? gltfSummary(path, bytes, new Set(assets)) : null), [path, bytes, assets]);
  if (!bytes) return <p class="muted">Reading assets/{path}…</p>;
  return (
    <section class="model-head" aria-label="The model’s file">
      <ModelFacts project={project} path={path} bytes={bytes} />
      {summary && typeof summary !== 'string' ? (
        <>
          <Slots summary={summary} value={value} />
          <FitCollider project={project} path={path} bytes={bytes} summary={summary} />
        </>
      ) : null}
    </section>
  );
}

/** A picker for each of the file's materials: drawn as the file has it, or with a material record. */
function Slots({ summary, value }: { summary: GltfSummary; value: unknown }) {
  const api = useForm();
  const head = useUniqueId();
  const materials = (value as { materials?: unknown }).materials;
  const ids = api.catalog.records.get(MATERIAL) ?? [];
  if (summary.slots.length === 0) return null;
  return (
    <fieldset class="model-slots" aria-labelledby={head}>
      <legend id={head}>Its materials</legend>
      {summary.slots.map((slot) => (
        <SlotPicker
          key={slot}
          slot={slot}
          chosen={slotMaterial(materials, slot)}
          ids={ids}
          set={(material) =>
            api.update(
              ['materials'],
              (now) => withSlot(now, slot, material),
              material === null ? `Draw ${slot} as the file has it` : `Draw ${slot} with ${material}`,
            )
          }
        />
      ))}
    </fieldset>
  );
}

function SlotPicker(props: {
  slot: string;
  chosen: string | null;
  ids: readonly string[];
  set: (material: string | null) => void;
}) {
  const { slot, chosen, ids, set } = props;
  const api = useForm();
  const id = useUniqueId();
  const name = (each: string) => api.names?.(`${MATERIAL}:${each}`);
  return (
    <div class="form-field">
      <label for={id}>
        Slot <span class="mono">{slot}</span>
      </label>
      <select
        id={id}
        class="field form-select"
        value={chosen ?? ''}
        disabled={!api.canEdit}
        onChange={(event) => set(event.currentTarget.value || null)}
      >
        <option value="">As the file has it</option>
        {chosen !== null && !ids.includes(chosen) ? <option value={chosen}>{chosen} (no such material)</option> : null}
        {ids.map((each) => (
          <option key={each} value={each}>
            {name(each) ? `${name(each)} (${each})` : each}
          </option>
        ))}
      </select>
    </div>
  );
}
