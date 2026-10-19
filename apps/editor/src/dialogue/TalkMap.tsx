/**
 * The talk map (M3.8, D46): above a talk's form, a box for each line in rows by steps from a
 * start, each saying where its options lead. Tapping a box opens its line's form at its text, as
 * the Problems panel opens a field. For seeing and getting around: a line is moved in its list.
 */
import { SPEAKER } from '@eb/kits';
import { useMemo } from 'preact/hooks';
import { fieldToFocus } from '../forms/focusField.ts';
import { useForm } from '../forms/formContext.ts';
import { type Box, type Exit, type MapRow, talkMap } from './talkMap.ts';
import '../styles/talkMap.css';

const CLIP = 90;
const clip = (text: string) => (text.length > CLIP ? `${text.slice(0, CLIP - 1).trimEnd()}…` : text);

function rowTitle(steps: MapRow['steps']): string {
  if (steps === undefined) return 'Nothing leads here';
  if (steps === 0) return 'Opens at';
  return steps === 1 ? '1 step on' : `${steps} steps on`;
}

const exitText = ({ by, to, found }: Exit) => `${by} → ${to ?? 'the end of the talk'}${found ? '' : ' (no such line)'}`;

function MapBox({ box, file, reached }: { box: Box; file: string; reached: boolean }) {
  const { names } = useForm();
  const speaker = box.speaker === undefined ? undefined : (names?.(`${SPEAKER}:${box.speaker}`) ?? box.speaker);
  return (
    <button
      type="button"
      class={reached ? 'talk-map-box' : 'talk-map-box unreached'}
      onClick={() => {
        fieldToFocus.value = { file, at: `/lines/${box.index}/text` };
      }}
    >
      <span class="talk-map-head">
        <strong>{box.id}</strong>
        {speaker ? <span class="muted"> · {speaker}</span> : null}
      </span>
      {box.text ? <span class="talk-map-text">{clip(box.text)}</span> : null}
      {box.exits.map((exit, i) => (
        <span key={i} class={exit.found ? 'talk-map-exit' : 'talk-map-exit lost'}>
          {exitText(exit)}
        </span>
      ))}
    </button>
  );
}

export function TalkMap({ value, file }: { value: unknown; file: string }) {
  const rows = useMemo(() => talkMap(value), [value]);
  if (rows.length === 0) return null;
  return (
    <section class="talk-map" aria-label="Map of the talk">
      <h4>Map</h4>
      {rows.map((row) => (
        <div key={row.steps ?? 'none'} class="talk-map-row">
          <h5 class={row.steps === undefined ? 'talk-map-steps unreached' : 'talk-map-steps'}>{rowTitle(row.steps)}</h5>
          <div class="talk-map-boxes">
            {row.boxes.map((box) => (
              <MapBox key={box.index} box={box} file={file} reached={row.steps !== undefined} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
