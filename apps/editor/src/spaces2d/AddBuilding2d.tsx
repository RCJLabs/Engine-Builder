/**
 * Add → Building… in a 2D space (M7.3, D85, docs/specs/rooms.md#the-editor): a slot's width and a floor's
 * height in art pixels, the slots a floor and the floors, and the sprite its stairs are drawn with, then an
 * empty building centred in the view, chosen, with its Rooms row ready.
 */
import { FLOORS_MOST, SLOTS_MOST } from '@eb/core';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { liveOf } from '../spaces/live.ts';
import { openSpace } from '../spaces/state.ts';
import { addBuilding } from './buildingActions.ts';

const whole = (text: string, fallback: number, most: number) => {
  const n = Number.parseInt(text, 10);
  return Number.isInteger(n) ? Math.min(most, Math.max(1, n)) : fallback;
};

/** The sprite stairs are drawn with at first: the starter ladder when the project has it. */
const LADDER = 'ladder';

function Whole(props: { label: string; value: string; set: (v: string) => void; most: number }) {
  const id = useUniqueId();
  return (
    <label class="scene-step" for={id}>
      {props.label}
      <input
        id={id}
        class="form-input"
        type="number"
        min={1}
        max={props.most}
        value={props.value}
        onInput={(e) => props.set(e.currentTarget.value)}
      />
    </label>
  );
}

export function AddBuilding2d({ done }: { done: () => void }) {
  const sprites = [...(liveOf(openSpace.value)?.sprites?.records.keys() ?? [])].sort();
  const [w, setW] = useState('48');
  const [h, setH] = useState('32');
  const [slots, setSlots] = useState('2');
  const [floors, setFloors] = useState('3');
  const [stair, setStair] = useState(sprites.includes(LADDER) ? LADDER : '');
  const stairId = useUniqueId();
  const add = () => {
    done();
    void addBuilding(
      [whole(w, 48, 1024), whole(h, 32, 1024)],
      whole(slots, 2, SLOTS_MOST),
      whole(floors, 3, FLOORS_MOST),
      stair || undefined,
    );
  };
  return (
    <fieldset class="scene-add">
      <legend>A building</legend>
      <Whole label="Slot width" value={w} set={setW} most={1024} />
      <Whole label="Floor height" value={h} set={setH} most={1024} />
      <Whole label="Slots" value={slots} set={setSlots} most={SLOTS_MOST} />
      <Whole label="Floors" value={floors} set={setFloors} most={FLOORS_MOST} />
      <label class="scene-step" for={stairId}>
        Stairs drawn with
        <select id={stairId} class="form-select" value={stair} onChange={(e) => setStair(e.currentTarget.value)}>
          <option value="">none yet</option>
          {sprites.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <button type="button" class="button" onClick={add}>
        Add building
      </button>
      <button type="button" class="button" onClick={done}>
        Cancel
      </button>
    </fieldset>
  );
}
