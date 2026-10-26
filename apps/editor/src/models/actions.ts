/**
 * The Assets panel's import when the pick holds models (M5.5, D67): each model packed in the model
 * worker, one after another, then every file, GLB and record written as one step undo takes back.
 * A model that can't be packed stops the import before anything is written, saying which and why.
 * Each packing's sizes and time go to the console: readings, not checks.
 */
import type { Provenance } from '@eb/schema';
import { note, noteError } from '../app/state.ts';
import type { Incoming } from '../assets/assetEdits.ts';
import { sizeText } from '../assets/media.ts';
import { openAsset } from '../assets/open.ts';
import { step } from '../editing/step.ts';
import { openRecord } from '../records/actions.ts';
import { addStarterKit } from './kitEdits.ts';
import { importModels, type PackedModel } from './modelEdits.ts';
import { type ModelPlan, modelRecordOf, modelSize, type PickPlan } from './modelImport.ts';
import { packInWorker } from './modelWorker.ts';
import type { PickedFile } from './protocol.ts';

const picked = async (file: File): Promise<PickedFile> => ({
  name: file.name,
  bytes: new Uint8Array(await file.arrayBuffer()),
});

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One model packed and its record made, or null when it couldn't be, said in the console. */
async function packOne(model: ModelPlan<File>, makeRecord: boolean, ids: Set<string>): Promise<PackedModel | null> {
  try {
    const packed = await packInWorker(await picked(model.file), await Promise.all(model.beside.map(picked)));
    note(
      `Packed ${model.file.name}: ${sizeText(modelSize(model))} to ${sizeText(packed.glb.byteLength)}, ` +
        `${packed.triangles} triangles, in ${packed.ms} ms.`,
    );
    const record = makeRecord ? modelRecordOf(model.file.name, model.path, packed, ids) : null;
    if (record) ids.add(record.id);
    return { path: model.path, bytes: packed.glb, record };
  } catch (error) {
    noteError(`Couldn’t import ${model.file.name}: ${message(error)}.`);
    return null;
  }
}

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * The pick imported with one provenance. One model with a record opens that record; any other
 * single file opens in the inspector. Resolves to whether it was imported.
 */
export async function importPickAction(
  plan: PickPlan<File>,
  makeRecords: boolean,
  entry: Provenance,
  modelIds: readonly string[],
): Promise<boolean> {
  const others: Incoming[] = await Promise.all(
    plan.others
      .filter((p) => p.refused === null)
      .map(async (p) => ({ path: p.path, bytes: new Uint8Array(await p.file.arrayBuffer()) })),
  );
  const ids = new Set(modelIds);
  const packed: PackedModel[] = [];
  for (const model of plan.models.filter((m) => m.refused === null)) {
    const one = await packOne(model, makeRecords, ids);
    if (!one) return false;
    packed.push(one);
  }
  const files = others.length + packed.length;
  const [model] = packed;
  const label = files === 1 ? `Import ${model?.path ?? others[0]?.path}` : `Import ${count(files, 'file', 'files')}`;
  if (!(await step(label, (copy) => importModels(copy, others, packed, entry)))) return false;
  note(
    files === 1 ? `Imported assets/${model?.path ?? others[0]?.path}.` : `Imported ${count(files, 'file', 'files')}.`,
  );
  if (files === 1 && model?.record) openRecord('model', model.record.id);
  else if (files === 1) openAsset(model?.path ?? others[0]?.path ?? '');
  return true;
}

/** A bundle's files added to the open project as one step, files it has already kept as they are. */
async function addBundle(name: string, files: ReadonlyMap<string, Uint8Array>): Promise<boolean> {
  let said = '';
  const made = await step(`Add ${name}`, async (copy) => {
    const { changes, added, kept } = await addStarterKit(copy, files);
    said =
      kept === 0
        ? `Added the ${name}: ${count(added, 'file', 'files')}.`
        : `Added ${count(added, 'file', 'files')} of the ${name}; the project had ${kept} of them already.`;
    if (changes.length === 0) throw new Error('every file of it is in the project already');
    return changes;
  });
  if (made) note(said);
  return made;
}

/** The starter kit added to the open project. Resolves to whether anything was added. */
export async function addStarterKitAction(): Promise<boolean> {
  const { kitFiles } = await import('./starterKit.ts');
  return addBundle('starter kit', kitFiles());
}

/**
 * The starter character added (M6.5, D77): its GLB, its model, materials and stock animator, for
 * a project to change or replace. Resolves to whether anything was added.
 */
export async function addStarterCharacterAction(): Promise<boolean> {
  const { characterFiles } = await import('./starterCharacter.ts');
  return addBundle('starter character', characterFiles());
}
