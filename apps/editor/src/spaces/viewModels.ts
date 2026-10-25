/**
 * The Scene panel's view and its models (M5.5, D67): modelsView.ts and its loaders are loaded with
 * the first model drawn, never with the panel. Files are decoded one batch at a time, and the view
 * is built again when a batch brings a file it didn't have, a placement drawing its marker until
 * then. The chosen objects' models show their colliders as wires. A file that can't be decoded
 * says so in the console and draws its marker.
 */
import type * as THREE from 'three/webgpu';
import type { LiveModels } from '../models/liveTypes.ts';
import type { DrawModel } from './build.ts';
import type { ModelSummary, ModelsView } from './modelsView.ts';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const holdersIn = (root: THREE.Object3D): THREE.Object3D[] => {
  const found: THREE.Object3D[] = [];
  root.traverse((part) => {
    if (part.userData.model) found.push(part);
  });
  return found;
};

export function createViewModels(
  renderer: THREE.WebGPURenderer,
  rebuild: () => void,
  onError: (message: string) => void,
) {
  let view: ModelsView | null = null;
  let loading: Promise<ModelsView> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  let latest: LiveModels | undefined;
  let wires: THREE.Mesh[] = [];
  let gone = false;

  const prepare = (models: LiveModels) => {
    loading ??= import('./modelsView.ts').then((made) => {
      view = made.createModelsView(renderer, onError);
      return view;
    });
    const next = queue.then(async () => {
      const ready = await (loading as Promise<ModelsView>);
      if (gone || latest !== models) return;
      // Built again even when a newer copy came while this decoded: that copy's own batch finds the
      // files already decoded and has nothing new to build for.
      if ((await ready.prepare(models)) && !gone) rebuild();
    });
    queue = next.catch((error: unknown) => onError(`The models couldn’t be drawn: ${message(error)}`));
  };

  const unwire = () => {
    for (const wire of wires) {
      wire.removeFromParent();
      wire.geometry.dispose();
      (wire.material as THREE.Material).dispose();
    }
    wires = [];
  };

  return {
    /** The drawer for these models, as far as their files are decoded; the rest follow. */
    use(models: LiveModels | undefined): DrawModel {
      latest = models;
      if (models && models.files.size > 0) prepare(models);
      const ready = view;
      return ready && models ? (key, passed) => ready.draw(models, key, passed) : () => null;
    },
    /** The colliders of the models under `chosen` drawn as wires, and no others. */
    wire(chosen: readonly THREE.Object3D[]): void {
      unwire();
      if (!view) return;
      for (const holder of chosen.flatMap(holdersIn)) {
        const wire = view.wireOf(holder);
        if (!wire) continue;
        holder.add(wire);
        wires.push(wire);
      }
    },
    /** What the hook says of each object drawn as a model, by the file's object it is in. */
    summaries(root: THREE.Object3D | undefined): (ModelSummary & { readonly object: string })[] {
      if (!root || !view) return [];
      const shown = view;
      return root.children.flatMap((object) =>
        holdersIn(object).flatMap((holder) => {
          const summary = shown.summary(holder);
          return summary ? [{ object: String(object.userData.objectId), ...summary }] : [];
        }),
      );
    },
    dispose(): void {
      gone = true;
      unwire();
      view?.dispose();
    },
  };
}
