/**
 * The 2D view's Rooms row, under its toolbar while a building is chosen (M7.3, D85,
 * docs/specs/rooms.md#the-editor): the project's room records as buttons drawn with their sprites, Place,
 * Erase and Stairs, and Add floor and Remove top floor. A tool stays on until pressed again; while one is
 * on, a press on the view places, erases or sets a stair rather than choosing or panning. Every button is
 * 44 px.
 */
import type { RoomRecord, SpriteRecord } from '@eb/schema';
import { useEffect, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { liveOf } from '../spaces/live.ts';
import { openSpace } from '../spaces/state.ts';
import { TileFrame } from '../sprites/TileFrame.tsx';
import { addFloorStep, buildingOf, removeTopFloorStep } from './buildingActions.ts';
import type { LiveSprites } from './liveSprites.ts';
import { type RoomTool, roomChoice, roomTool } from './rooms2d.ts';
import { sheetOf } from './sheets2d.ts';

export function RoomsRow2d({ id }: { id: string }) {
  const now = liveOf(openSpace.value);
  const space = now?.space ?? undefined;
  const fields = buildingOf(space, id);
  const [said, setSaid] = useState('');
  if (!fields) return null;
  const canEdit = editing.access.value.kind === 'editing';
  const tool = roomTool.value;
  const toggle = (next: RoomTool) => {
    roomTool.value = tool === next ? null : next;
  };
  const live = now?.sprites ?? undefined;
  return (
    <fieldset class="scene-toolbar tiles-row">
      <legend class="visually-hidden">Rooms</legend>
      {live && live.rooms.size > 0 ? (
        <RoomButtons live={live} />
      ) : (
        <p class="muted">No rooms yet: add the starter sprites in the Assets panel, or make a room record.</p>
      )}
      <button
        type="button"
        class="button"
        aria-pressed={tool === 'place'}
        disabled={!canEdit || roomChoice.value === null}
        onClick={() => toggle('place')}
      >
        Place
      </button>
      <button
        type="button"
        class="button"
        aria-pressed={tool === 'erase'}
        disabled={!canEdit}
        onClick={() => toggle('erase')}
      >
        Erase
      </button>
      <button
        type="button"
        class="button"
        aria-pressed={tool === 'stairs'}
        disabled={!canEdit}
        onClick={() => toggle('stairs')}
      >
        Stairs
      </button>
      <button type="button" class="button" disabled={!canEdit} onClick={() => void addFloorStep(id)}>
        Add floor
      </button>
      <button
        type="button"
        class="button"
        disabled={!canEdit}
        onClick={() => void removeTopFloorStep(id, space).then(setSaid)}
      >
        Remove top floor
      </button>
      <output class="muted" aria-live="polite">
        {said || `${fields.floors} ${fields.floors === 1 ? 'floor' : 'floors'} of ${fields.slots}`}
      </output>
    </fieldset>
  );
}

/** A sprite's sheet as the view decoded it, from the live copy's bytes (as the Tiles row's are). */
function useLiveSheet(live: LiveSprites, path: string | undefined): ImageBitmap | null {
  const [image, setImage] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    let on = true;
    if (path !== undefined) void sheetOf(live, path).then((found) => on && setImage(found));
    return () => {
      on = false;
    };
  }, [live, path]);
  return image;
}

function RoomButtons({ live }: { live: LiveSprites }) {
  return (
    <fieldset class="tiles-choices">
      <legend class="visually-hidden">Rooms</legend>
      {[...live.rooms].map(([id, room]) => (
        <RoomButton key={id} id={id} room={room} sprite={live.records.get(room.sprite)} live={live} />
      ))}
    </fieldset>
  );
}

function RoomButton(props: { id: string; room: RoomRecord; sprite: SpriteRecord | undefined; live: LiveSprites }) {
  const { id, room, sprite, live } = props;
  const image = useLiveSheet(live, sprite?.sheet);
  return (
    <button
      type="button"
      class="button tile-button"
      aria-pressed={roomChoice.value === id}
      data-room={id}
      onClick={() => {
        roomChoice.value = id;
        roomTool.value = 'place';
      }}
    >
      {image && sprite ? <TileFrame image={image} tile={sprite.frame} frame={0} zoom={1} /> : null}
      <span>{room.name ?? id}</span>
    </button>
  );
}
