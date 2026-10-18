import { pointerSegment } from '@eb/core';
import { useUniqueId } from '../app/ids.ts';
import { type DefPath, nodeAt } from './defPaths.ts';
import { useDesign } from './designContext.ts';
import { targetsChange } from './fieldEdits.ts';
import { Problems } from './TypeDesigner.tsx';

const pointer = (path: DefPath) => path.map((key) => `/${pointerSegment(key)}`).join('');

/**
 * The types a ref may name, a box each. One type is written as its name, several as a list, and
 * the records' values follow between the two: bare ids take their type, and lose it again
 * (retargetRefs). The last type ticked can't be ticked off: a ref names at least one.
 */
export function RefTargets({ at, label }: { at: DefPath; label: string }) {
  const design = useDesign();
  const legend = useUniqueId();
  const to = nodeAt(design.json, [...at, 'to']);
  const named =
    typeof to === 'string' ? [to] : Array.isArray(to) ? to.filter((t): t is string => typeof t === 'string') : [];
  // Types the file names that the project has no file for stay on the list, to be ticked off.
  const shown = [...design.types, ...named.filter((type) => !design.types.includes(type))];
  const set = (type: string, on: boolean) => {
    const next = on ? shown.filter((t) => t === type || named.includes(t)) : named.filter((t) => t !== type);
    void design.change(
      `${on ? 'Let' : 'Stop'} ${label} ${on ? 'name' : 'naming'} ${design.titleOf(type)} records`,
      targetsChange(at, next),
    );
  };
  return (
    <fieldset class="ref-targets" aria-labelledby={legend}>
      <legend id={legend} class="form-legend">
        Names records of
      </legend>
      <Problems problems={design.problemsAt(pointer([...at, 'to']))} />
      {shown.map((type, i) => {
        const on = named.includes(type);
        return (
          <div key={type} class="form-bool">
            <input
              id={`${legend}-${i}`}
              type="checkbox"
              class="form-check"
              checked={on}
              disabled={!design.canEdit || (on && named.length === 1)}
              onChange={(event) => set(type, event.currentTarget.checked)}
            />
            <label for={`${legend}-${i}`} class="form-label">
              {design.titleOf(type)}
              {design.types.includes(type) ? null : <span class="field-problem"> (no such type)</span>}
            </label>
            <Problems problems={design.problemsAt(`${pointer([...at, 'to'])}/${named.indexOf(type)}`)} />
          </div>
        );
      })}
    </fieldset>
  );
}
