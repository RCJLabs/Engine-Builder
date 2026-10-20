/**
 * The map above a map's form (M4.6, D56, docs/specs/maps.md#the-editor). A layered map: the map
 * its rules make from a seed, typed or moved on by Next seed, and the check over 300 seeds, each
 * rule with how many keep it and the first seed that doesn't, which opens it. A drawn map: as
 * written, each node dragged where it goes, one step of undo, and a tap opening its row of the form.
 */
import { formatRef } from '@eb/core';
import { MAP, type MapRecord, NODE_KIND } from '@eb/kits';
import type { MapNode } from '@eb/ui/session';
import { useMemo, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { fieldToFocus } from '../forms/focusField.ts';
import { useForm } from '../forms/formContext.ts';
import type { OpenProject } from '../projects/opened.ts';
import { MapBoard } from './MapBoard.tsx';
import { drawnMade, type Kinds, layeredMade, nextSeed, previewView, ruleRows } from './mapPreview.ts';
import '../styles/world.css';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Each node kind as the index reads it. */
function kindsOf(project: OpenProject): Kinds {
  return (kind) => {
    const value = project.index?.records.get(formatRef(NODE_KIND, kind))?.value;
    if (!isObject(value)) return undefined;
    const names = Array.isArray(value.names) ? value.names.filter((n): n is string => typeof n === 'string') : [];
    return {
      name: typeof value.name === 'string' && value.name !== '' ? value.name : kind,
      ...(names.length > 0 ? { names } : {}),
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
    };
  };
}

interface Props {
  readonly id: string;
  readonly value: unknown;
  readonly file: string;
  readonly project: OpenProject;
}

export function MapPreview({ id, value, file, project }: Props) {
  if (!isObject(value)) return null;
  const map = value as unknown as MapRecord;
  const record = project.index?.records.get(formatRef(MAP, id));
  // Rules the checks reject can't be trusted to make a map; their problems are shown above.
  const unsound = (record?.problems ?? []).some(
    (p) => p.severity === 'error' && (p.path === '' || p.path.startsWith('/layers')),
  );
  if (map.layers) {
    return unsound ? (
      <p class="muted world-note">Fix the map’s problems above to see what its rules make.</p>
    ) : (
      <LayeredPreview id={id} map={map} kinds={kindsOf(project)} />
    );
  }
  if (map.nodes) return <DrawnPreview id={id} map={map} kinds={kindsOf(project)} file={file} />;
  return null;
}

function LayeredPreview({ id, map, kinds }: { id: string; map: MapRecord; kinds: Kinds }) {
  const [seed, setSeed] = useState('1');
  const [picked, setPicked] = useState<MapNode | undefined>(undefined);
  const box = useUniqueId();
  const layers = map.layers as NonNullable<MapRecord['layers']>;
  const made = useMemo(() => layeredMade(id, layers, kinds, seed), [id, layers, kinds, seed]);
  const rows = useMemo(() => ruleRows(id, layers, kinds), [id, layers, kinds]);
  const view = made ? previewView(made, map, kinds) : undefined;
  return (
    <section class="world-preview" aria-label={`What ${map.name || id} makes`}>
      <div class="world-seed">
        <label for={box}>Seed</label>
        <input
          id={box}
          type="text"
          inputMode="numeric"
          value={seed}
          onInput={(event) => setSeed(event.currentTarget.value)}
        />
        <button type="button" class="button" onClick={() => setSeed(nextSeed(seed))}>
          Next seed
        </button>
      </div>
      {view ? (
        <MapBoard
          view={view}
          label={`${map.name || id}, seed ${seed}`}
          picked={picked?.id}
          pick={(node) => setPicked(node)}
        />
      ) : (
        <p class="muted world-note">These rules make no map from this seed.</p>
      )}
      {picked && view?.nodes.some((node) => node.id === picked.id) ? (
        <p class="world-picked">
          <strong>{picked.name}</strong>, {picked.kind}, layer {picked.layer}
          {picked.description ? `: ${picked.description}` : ''}
        </p>
      ) : null}
      <h4>Over 300 seeds</h4>
      {rows ? null : <p class="muted world-note">These rules make no map yet.</p>}
      <ul class="world-rules">
        {(rows ?? []).map((row) => (
          <li key={row.rule} class={row.first ? 'world-rule broken' : 'world-rule'}>
            <span>
              {row.rule}: kept in {row.kept} of {row.of}
              {row.first ? `; seed ${row.first.seed} makes ${row.first.found}` : ''}
            </span>
            {row.first ? (
              <button type="button" class="button" onClick={() => setSeed(row.first?.seed ?? seed)}>
                Open seed {row.first.seed}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DrawnPreview({ id, map, kinds, file }: { id: string; map: MapRecord; kinds: Kinds; file: string }) {
  const form = useForm();
  const view = useMemo(() => previewView(drawnMade(id, map, kinds), map, kinds), [id, map, kinds]);
  return (
    <section class="world-preview" aria-label={`${map.name || id}, drawn`}>
      <p class="muted world-note">
        {form.canEdit ? 'Drag a place to move it; tap one to open it below.' : 'Tap a place to open it below.'}
      </p>
      <MapBoard
        view={view}
        label={map.name || id}
        picked={undefined}
        pick={(_, index) => {
          fieldToFocus.value = { file, at: `/nodes/${index}/id` };
        }}
        {...(form.canEdit
          ? {
              move: (node: MapNode, index: number, x: number, y: number) =>
                form.update(
                  ['nodes', index],
                  (now) => (isObject(now) ? { ...now, x, y } : now),
                  `Move ${node.id} to ${x}, ${y}`,
                ),
            }
          : {})}
      />
    </section>
  );
}
