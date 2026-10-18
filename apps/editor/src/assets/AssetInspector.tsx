import { kindOfAsset } from '@eb/schema';
import { useMemo } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { editing } from '../editing/current.ts';
import { FormContext } from '../forms/formContext.ts';
import type { OpenProject } from '../projects/opened.ts';
import { AssetUsedBy } from '../records/UsedBy.tsx';
import '../styles/assets.css';
import { AssetHead } from './AssetHead.tsx';
import { AssetPreview } from './AssetPreview.tsx';
import { logAction } from './assetActions.ts';
import { assetProblems } from './assetList.ts';
import { entryOf } from './assetLog.ts';
import { EntryForm } from './EntryForm.tsx';
import { today } from './media.ts';
import { logForm, ProvenanceFields } from './ProvenanceFields.tsx';
import { useAssetFile } from './useAssetFile.ts';

/**
 * An asset in the inspector (M2.7): what it is, its provenance as a form over its entry in
 * assets/assets.json, the records that use it, and the ways to rename, replace or delete it.
 */
export function AssetInspector({ project, path }: { project: OpenProject; path: string }) {
  const head = useUniqueId();
  const kind = kindOfAsset(path);
  const file = useAssetFile(project, path, kind === 'image' || kind === 'audio');
  const { catalog } = project;
  const problems = useMemo(() => assetProblems(catalog), [catalog]);
  const canEdit = editing.access.value.kind === 'editing';
  if (!catalog.assets.includes(path)) {
    return <p class="muted">There is no file assets/{path} any more.</p>;
  }
  const own = problems.byAsset.get(path) ?? [];
  const whole = own.filter((problem) => problem.path === '');
  const entry = entryOf(catalog.assetsLog, path);
  return (
    <section class="asset-inspector" aria-label={`Asset ${path}`}>
      <AssetHead project={project} path={path} canEdit={canEdit} />
      <AssetPreview project={project} path={path} kind={kind} file={file} />
      {whole.map((problem) => (
        <p
          key={`${problem.code} ${problem.message}`}
          class={problem.severity === 'error' ? 'field-problem' : 'asset-warning'}
        >
          {problem.message}
        </p>
      ))}
      <section class="asset-provenance" aria-labelledby={head}>
        <h4 id={head}>Provenance</h4>
        {catalog.logProblem !== undefined ? (
          <p class="field-problem">assets/assets.json can’t be read: {catalog.logProblem}. Fix it by hand first.</p>
        ) : entry === undefined ? (
          canEdit ? (
            <EntryForm
              catalog={catalog}
              heading="Log where it came from"
              paths={[path]}
              initial={{ date: today() }}
              goLabel="Log it"
              go={(made) => logAction([path], made)}
            />
          ) : (
            <p class="muted">None logged yet.</p>
          )
        ) : (
          <FormContext.Provider value={logForm(catalog, path, canEdit, own)}>
            <ProvenanceFields entry={entry} withEdits={true} />
          </FormContext.Provider>
        )}
      </section>
      <AssetUsedBy project={project} path={path} />
    </section>
  );
}
