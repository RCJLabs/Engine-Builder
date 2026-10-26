/**
 * The space-map widget (M6.6, D78, docs/specs/markers.md#in-play): the space the player is in from
 * above, its baked image or plain ground, with a pin where the sim last heard the player stood, the
 * way they faced, and one for each of the tracked quest's targets here or the door it stands in at.
 * A tap on a target's pin says its objective. The page's host works out where each pin goes; designed,
 * or with no host, the box says what it shows. Each pin carries where it stands, for a test to read.
 */
import { useEffect, useState } from 'preact/hooks';
import type { Widget } from '../format/screen.ts';
import type { Drawing } from './context.ts';
import { fill } from './fill.ts';
import type { MapPin, SpaceMapShown } from './spaceHost.ts';

type SpaceMapWidget = Extract<Widget, { widget: 'space-map' }>;

const percent = (value: number, low: number, high: number) => `${((value - low) / (high - low)) * 100}%`;

function Pin({ pin, bounds, pick }: { pin: MapPin; bounds: SpaceMapShown['bounds']; pick: (pin: MapPin) => void }) {
  const style = { left: percent(pin.at[0], bounds[0], bounds[2]), top: percent(pin.at[1], bounds[1], bounds[3]) };
  const data = { 'data-pin': pin.kind, 'data-x': String(pin.at[0]), 'data-z': String(pin.at[1]) };
  if (pin.kind === 'player') {
    // Yaw turns left as it grows, as the walk's camera does: the arrow turns the other way to CSS.
    return (
      <span class="eb-pin eb-pin-player" style={style} {...data} role="img" aria-label="You">
        <span class="eb-pin-arrow" style={{ transform: `rotate(${-(pin.yaw ?? 0)}deg)` }} />
      </span>
    );
  }
  return (
    <button
      type="button"
      class={`eb-pin eb-pin-${pin.kind}`}
      style={style}
      {...data}
      data-objective={pin.objective}
      aria-label={pin.kind === 'door' ? `The way to: ${pin.text ?? ''}` : (pin.text ?? 'A target')}
      onClick={() => pick(pin)}
    >
      <span class="eb-pin-mark" />
    </button>
  );
}

export function SpaceMapWidgetView({
  widget,
  drawing,
}: {
  readonly widget: SpaceMapWidget;
  readonly drawing: Drawing;
}) {
  const host = drawing.design ? undefined : drawing.spaces;
  const world = drawing.view.world;
  const space = world?.space;
  const here = world?.at?.space === space ? world?.at : undefined;
  const ask =
    space === undefined
      ? undefined
      : {
          space,
          markers: drawing.markers === false ? [] : (world?.markers ?? []),
          ...(here ? { at: { feet: here.feet, yaw: here.yaw } } : {}),
          ...(world?.arrive !== undefined ? { arrive: world.arrive } : {}),
          ...(world?.npcs ? { npcs: world.npcs } : {}),
        };
  const key = JSON.stringify(ask ?? null);
  const [shown, setShown] = useState<SpaceMapShown | undefined>(undefined);
  const [picked, setPicked] = useState<MapPin | undefined>(undefined);
  useEffect(() => {
    if (!host?.map || !ask) return;
    let live = true;
    void host.map(ask).then((map) => {
      if (live) setShown(map);
    });
    return () => {
      live = false;
    };
  }, [host, key]);
  const named = space === undefined ? undefined : (drawing.spaces?.name(space) ?? space);
  const label =
    widget.label === undefined ? `Map of ${named ?? 'the space the player is in'}` : fill(widget.label, drawing.view);
  if (!host || !shown) {
    return (
      <div class="eb-space-map eb-space-map-none" role="img" aria-label={label}>
        <p class="eb-text eb-caption">
          {drawing.design ? 'The space walked, from above' : 'Drawn as the game is played'}
        </p>
      </div>
    );
  }
  const targets = shown.pins.filter((pin) => pin.kind !== 'player');
  const said = picked?.text ?? (targets.length > 0 ? 'Tap a marker for its objective.' : 'No tracked objective here.');
  return (
    <figure class="eb-space-map" aria-label={label}>
      <div
        class={`eb-space-map-ground${shown.image ? '' : ' eb-space-map-plain'}`}
        style={{ aspectRatio: `${shown.bounds[2] - shown.bounds[0]} / ${shown.bounds[3] - shown.bounds[1]}` }}
      >
        {shown.image ? <img class="eb-space-map-image" src={shown.image} alt="" /> : null}
        {shown.pins.map((pin) => (
          <Pin key={`${pin.kind}:${pin.objective ?? ''}`} pin={pin} bounds={shown.bounds} pick={setPicked} />
        ))}
      </div>
      <figcaption class="eb-text eb-caption" aria-live="polite">
        {said}
      </figcaption>
    </figure>
  );
}
