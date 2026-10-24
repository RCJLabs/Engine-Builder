import { classifySpaceFile } from '@eb/compiler';
import { showPanel } from '../app/panelControl.ts';
import { current } from '../projects/opened.ts';
import { openSpaceFile } from './state.ts';

/**
 * A space or prefab opened in the Scene panel from elsewhere, such as a problem (M2.8): with the
 * object at `index` in its objects chosen, when the file names one there.
 */
export function openSpaceAt(path: string, index?: number): void {
  const role = classifySpaceFile(path);
  if (role.kind !== 'space' && role.kind !== 'prefab') return;
  openSpaceFile(role.kind, role.id);
  showPanel('scene');
  const source = current.value?.source;
  if (index === undefined || !source) return;
  void source.read(path).then((bytes) => {
    if (!bytes) return;
    try {
      const value = JSON.parse(new TextDecoder().decode(bytes)) as { objects?: { id?: unknown }[] };
      const id = value.objects?.[index]?.id;
      if (typeof id === 'string') openSpaceFile(role.kind, role.id, [id]);
    } catch {
      // Not JSON: the file opens, its problem in the panel, and nothing is chosen.
    }
  });
}
