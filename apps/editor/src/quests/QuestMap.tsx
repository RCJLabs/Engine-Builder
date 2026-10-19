/**
 * The quest map (M3.9, D47): above a quest's form, a box for each stage in rows by steps from the
 * first, each saying where its objectives and Then lead and how it can fail. Tapping a box opens
 * its stage's form at its id, as the Problems panel opens a field. For seeing and getting around:
 * a stage is moved in its list.
 */
import { useMemo } from 'preact/hooks';
import { fieldToFocus } from '../forms/focusField.ts';
import { type Box, type Exit, type MapRow, questMap } from './questMap.ts';
import '../styles/kitMap.css';

const CLIP = 90;
const clip = (text: string) => (text.length > CLIP ? `${text.slice(0, CLIP - 1).trimEnd()}…` : text);

function rowTitle(steps: MapRow['steps']): string {
  if (steps === undefined) return 'Not reached from the first stage';
  if (steps === 0) return 'Starts at';
  return steps === 1 ? '1 step on' : `${steps} steps on`;
}

function exitText({ by, to, found, never }: Exit): string {
  if (to === undefined) return `${by} → the quest is done`;
  const note = !found ? ' (no such stage)' : never ? ' (never: every objective leads elsewhere)' : '';
  return `${by} → ${to}${note}`;
}

function MapBox({ box, file, reached }: { box: Box; file: string; reached: boolean }) {
  return (
    <button
      type="button"
      class={reached ? 'kit-map-box' : 'kit-map-box unreached'}
      onClick={() => {
        fieldToFocus.value = { file, at: `/stages/${box.index}/id` };
      }}
    >
      <span class="kit-map-head">
        <strong>{box.id}</strong>
      </span>
      {box.log ? <span class="kit-map-text">{clip(box.log)}</span> : null}
      {box.exits.map((exit, i) => (
        <span key={i} class={exit.found && !exit.never ? 'kit-map-exit' : 'kit-map-exit lost'}>
          {exitText(exit)}
        </span>
      ))}
      {box.fails.map((words) => (
        <span key={words} class="kit-map-exit">
          {words}
        </span>
      ))}
      {box.stuck ? <span class="kit-map-exit lost">The quest can never end from here</span> : null}
    </button>
  );
}

export function QuestMap({ id, value, file }: { id: string; value: unknown; file: string }) {
  const rows = useMemo(() => questMap(id, value), [id, value]);
  if (rows.length === 0) return null;
  return (
    <section class="kit-map" aria-label="Map of the quest">
      <h4>Map</h4>
      {rows.map((row) => (
        <div key={row.steps ?? 'none'} class="kit-map-row">
          <h5 class={row.steps === undefined ? 'kit-map-steps unreached' : 'kit-map-steps'}>{rowTitle(row.steps)}</h5>
          <div class="kit-map-boxes">
            {row.boxes.map((box) => (
              <MapBox key={box.index} box={box} file={file} reached={row.steps !== undefined} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
