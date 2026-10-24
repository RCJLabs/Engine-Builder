/**
 * Fit collider, above a model record's form (M5.5, D67): a box, sphere, capsule or hull measured
 * from the decoded mesh, every node's transform applied, in the model worker, and written to
 * `collider` as one step. A hull keeps at most 64 points, the farthest first.
 */
import type { GltfSummary } from '@eb/compiler';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { assetFile } from '../assets/assetEdits.ts';
import { useForm } from '../forms/formContext.ts';
import type { OpenProject } from '../projects/opened.ts';
import { FITS } from './modelForm.ts';
import { fitInWorker } from './modelWorker.ts';
import type { PickedFile } from './protocol.ts';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function FitCollider(props: { project: OpenProject; path: string; bytes: Uint8Array; summary: GltfSummary }) {
  const { project, path, bytes, summary } = props;
  const api = useForm();
  const head = useUniqueId();
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const fit = async (shape: (typeof FITS)[number]) => {
    setBusy(shape.label);
    setProblem(null);
    try {
      const beside: PickedFile[] = [];
      for (const need of summary.external.filter((each) => each.found)) {
        const found = await project.source.read(assetFile(need.path));
        if (found) beside.push({ name: need.path, bytes: found });
      }
      const collider = await fitInWorker({ name: path, bytes }, beside, shape.shape);
      api.update(['collider'], () => collider, `Fit a ${shape.label.toLowerCase()} collider`);
    } catch (error) {
      setProblem(`It couldn’t be fitted: ${message(error)}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div class="fit-collider" role="group" aria-labelledby={head}>
      <p id={head} class="form-label">
        Fit collider
      </p>
      <div class="form-actions">
        {FITS.map((shape) => (
          <button
            key={shape.shape}
            type="button"
            class="button"
            disabled={!api.canEdit || busy !== null}
            onClick={() => void fit(shape)}
          >
            {busy === shape.label ? `Fitting a ${shape.label.toLowerCase()}…` : shape.label}
          </button>
        ))}
      </div>
      {problem ? (
        <p class="field-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
