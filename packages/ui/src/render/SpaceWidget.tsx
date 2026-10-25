/**
 * The Space widget (M5.8, D70, docs/specs/movement.md#the-space-widget): a box that fills its region,
 * which the page's host draws the space into and walks. Its other widgets stack over it. Designed, or
 * with no host, it shows the space's name and where it is walked. Without a space of its own it draws
 * the one the player is in, and the next as enter-space moves them (M5.9, docs/specs/worldspaces.md).
 */
import { useEffect, useRef } from 'preact/hooks';
import type { Widget } from '../format/screen.ts';
import type { Drawing } from './context.ts';
import { fill } from './fill.ts';
import { placingIn } from './placing.ts';
import type { SpaceDrawn } from './spaceHost.ts';

type SpaceWidget = Extract<Widget, { widget: 'space' }>;

export function SpaceWidgetView({ widget, drawing }: { readonly widget: SpaceWidget; readonly drawing: Drawing }) {
  const stage = useRef<HTMLDivElement>(null);
  const drawn = useRef<SpaceDrawn | undefined>(undefined);
  const host = drawing.design ? undefined : drawing.spaces;
  const world = drawing.view.world;
  const space = widget.space ?? world?.space;
  // The stage keeps the functions it was given: each goes by the latest view's.
  const send = useRef(drawing.send);
  send.current = drawing.send;
  const latest = useRef(world);
  latest.current = world;
  const placing = space === undefined ? undefined : placingIn(space, world);
  const takenKey = placing?.taken.join('\n') ?? '';
  const quality = drawing.quality ?? 'auto';
  // Where to stand is read as the stage starts, not after: each world/at would start it again.
  useEffect(() => {
    const element = stage.current;
    if (!host || !element || space === undefined || !placing) return;
    const made = host.draw(element, {
      space,
      quality,
      ...placing,
      here: () => latest.current?.space === space,
      send: (action) => send.current?.(action) ?? Promise.resolve('dropped'),
    });
    drawn.current = made;
    if (drawing.paused) made.pause(true);
    return () => {
      made.stop();
      drawn.current = undefined;
    };
  }, [host, space]);
  useEffect(() => drawn.current?.pause(drawing.paused === true), [drawing.paused]);
  useEffect(() => drawn.current?.quality(quality), [quality]);
  useEffect(() => drawn.current?.taken(placing?.taken ?? []), [takenKey]);
  const named = space === undefined ? undefined : (drawing.spaces?.name(space) ?? space);
  const label = widget.label === undefined ? (named ?? 'The space the player is in') : fill(widget.label, drawing.view);
  if (!host || space === undefined) {
    return (
      <div class="eb-space eb-space-none" role="img" aria-label={label}>
        <p class="eb-text eb-heading">{label}</p>
        <p class="eb-text eb-caption">{drawing.design ? 'A space, walked in play' : 'Walked as the game is played'}</p>
      </div>
    );
  }
  // The stage draws into its own box, which Preact gives no children, so nothing it adds is diffed away.
  // biome-ignore lint/a11y/noNoninteractiveTabindex: the walk is a control: it takes keys while it has focus, as role application says.
  return <div class="eb-space" role="application" aria-label={label} tabIndex={0} data-eb-walk="" ref={stage} />;
}
