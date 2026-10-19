/**
 * The talk map (M3.8, D46): above a talk's form, a box for each line in rows by steps from a
 * start, each saying where its options lead. Tapping a box opens its line's form at its text, as
 * the Problems panel opens a field. For seeing and getting around: a line is moved in its list.
 * Beside an ink scene (M3.11) it is drawn from the talk the scene makes, and a box opens the
 * scene at the line it came from.
 */
import { SPEAKER } from '@eb/kits';
import { useContext, useMemo } from 'preact/hooks';
import { fieldToFocus } from '../forms/focusField.ts';
import { FormContext } from '../forms/formContext.ts';
import type { NameOf } from '../records/cells.ts';
import { type Box, type Exit, type MapRow, talkMap } from './talkMap.ts';
import '../styles/kitMap.css';

const CLIP = 90;
const clip = (text: string) => (text.length > CLIP ? `${text.slice(0, CLIP - 1).trimEnd()}…` : text);

function rowTitle(steps: MapRow['steps']): string {
  if (steps === undefined) return 'Nothing leads here';
  if (steps === 0) return 'Opens at';
  return steps === 1 ? '1 step on' : `${steps} steps on`;
}

const exitText = ({ by, to, found }: Exit) => `${by} → ${to ?? 'the end of the talk'}${found ? '' : ' (no such line)'}`;

interface Shown {
  readonly file: string;
  /** Records' names; a form's own when left out. */
  readonly names?: NameOf;
  /** What tapping a box does; opening its line's form at its text when left out. */
  readonly open?: (box: Box) => void;
}

function MapBox({ box, reached, shown }: { box: Box; reached: boolean; shown: Shown }) {
  const form = useContext(FormContext);
  const names = shown.names ?? form?.names;
  const speaker = box.speaker === undefined ? undefined : (names?.(`${SPEAKER}:${box.speaker}`) ?? box.speaker);
  return (
    <button
      type="button"
      class={reached ? 'kit-map-box' : 'kit-map-box unreached'}
      onClick={() => {
        if (shown.open) shown.open(box);
        else fieldToFocus.value = { file: shown.file, at: `/lines/${box.index}/text` };
      }}
    >
      <span class="kit-map-head">
        <strong>{box.id}</strong>
        {speaker ? <span class="muted"> · {speaker}</span> : null}
      </span>
      {box.text ? <span class="kit-map-text">{clip(box.text)}</span> : null}
      {box.passes ? <span class="muted">Passes on</span> : null}
      {box.exits.map((exit, i) => (
        <span key={i} class={exit.found ? 'kit-map-exit' : 'kit-map-exit lost'}>
          {exitText(exit)}
        </span>
      ))}
    </button>
  );
}

export function TalkMap({ value, ...shown }: { value: unknown } & Shown) {
  const rows = useMemo(() => talkMap(value), [value]);
  if (rows.length === 0) return null;
  return (
    <section class="kit-map" aria-label="Map of the talk">
      <h4>Map</h4>
      {rows.map((row) => (
        <div key={row.steps ?? 'none'} class="kit-map-row">
          <h5 class={row.steps === undefined ? 'kit-map-steps unreached' : 'kit-map-steps'}>{rowTitle(row.steps)}</h5>
          <div class="kit-map-boxes">
            {row.boxes.map((box) => (
              <MapBox key={box.index} box={box} reached={row.steps !== undefined} shown={shown} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
