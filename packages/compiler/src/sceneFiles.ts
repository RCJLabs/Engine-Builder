/**
 * Where a project's ink scenes sit and what each file under scenes/ is (M3.11, D49): apart from
 * scenes.ts, which compiles them, so the editor can name and place scenes as a project opens
 * without loading the ink compiler with it.
 */
import { isRecordId } from '@eb/core';

export const SCENES_DIR = 'scenes';
export const scenePath = (id: string) => `${SCENES_DIR}/${id}.ink`;

export type SceneFile =
  | { readonly kind: 'scene'; readonly id: string }
  | { readonly kind: 'misplaced'; readonly reason: string }
  | { readonly kind: 'ignored' };

/** What a file under scenes/ is: its name is its talk's id, as a record's is. */
export function classifyScene(path: string): SceneFile {
  const parts = path.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (!name.endsWith('.ink')) return { kind: 'ignored' };
  if (parts.length !== 2 || parts[0] !== SCENES_DIR) {
    return { kind: 'misplaced', reason: 'A scene sits at scenes/<id>.ink, not in a folder of its own' };
  }
  const id = name.slice(0, -'.ink'.length);
  if (!isRecordId(id)) {
    return {
      kind: 'misplaced',
      reason: `"${id}" isn’t a talk’s id: name a scene in lowercase words joined by hyphens`,
    };
  }
  return { kind: 'scene', id };
}
