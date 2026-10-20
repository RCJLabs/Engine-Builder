/**
 * A map drawn above its form (M4.6, D56, docs/specs/maps.md#the-editor), laid out as the map
 * widget lays it out (@eb/ui's mapLayout): a layered map up a narrow inspector and across a wide
 * one, a drawn map at its places. Each node is a button at least 44 px. A drawn map's node is
 * dragged where it goes, the move one step of undo; a tap without a drag picks it.
 */
import { boardOf, HALF_ACROSS, HALF_DOWN, linksInset, placeStyle } from '@eb/ui';
import type { MapNode, MapView } from '@eb/ui/session';
import { useEffect, useRef, useState } from 'preact/hooks';

/** Under this many pixels a press is a tap, not a drag. */
const SLOP = 6;
/** Narrower than this, a layered map runs up the board, as on a phone. */
const NARROW = 480;

interface Props {
  readonly view: MapView;
  readonly label: string;
  readonly picked: string | undefined;
  pick(node: MapNode, index: number): void;
  /** Moves a drawn map's node to a place, 0 to 100 each way. Without it, nodes stay where they are. */
  readonly move?: (node: MapNode, index: number, x: number, y: number) => void;
}

interface Drag {
  readonly id: string;
  readonly fromX: number;
  readonly fromY: number;
  moved: boolean;
}

/** The board's width as it is laid out, so the layout follows the inspector as the widget follows the screen. */
function useWidth(ref: { current: HTMLElement | null }): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const seen = new ResizeObserver(() => setWidth(element.clientWidth));
    seen.observe(element);
    setWidth(element.clientWidth);
    return () => seen.disconnect();
  }, [ref]);
  return width;
}

/** Where a pointer sits on the board's inner box, 0 to 100 each way, as a drawn node's place is written. */
function placeAt(board: HTMLElement, x: number, y: number): readonly [number, number] {
  const box = board.getBoundingClientRect();
  const across = (x - box.left - HALF_ACROSS) / Math.max(box.width - 2 * HALF_ACROSS, 1);
  const down = (y - box.top - HALF_DOWN) / Math.max(box.height - 2 * HALF_DOWN, 1);
  const clamp = (n: number) => Math.round(Math.min(Math.max(n, 0), 1) * 100);
  return [clamp(across), clamp(down)];
}

export function MapBoard({ view, label, picked, pick, move }: Props) {
  const outer = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLElement>(null);
  const width = useWidth(outer);
  const drag = useRef<Drag | null>(null);
  const [held, setHeld] = useState<{ id: string; x: number; y: number } | null>(null);
  const laid = boardOf(view, width > 0 && width < NARROW ? 'phone' : 'desktop');
  const placeOf = (node: MapNode): readonly [number, number] =>
    held?.id === node.id ? [held.x / 100, held.y / 100] : (laid.places.get(node.id) ?? [0.5, 0.5]);
  const style = laid.tall ? { height: `${laid.height}px` } : { aspectRatio: String(laid.ratio) };
  return (
    <div ref={outer} class="world-board-wrap">
      <section ref={board} class="world-board" aria-label={label} style={style}>
        <svg
          class="world-links"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ inset: linksInset(laid) }}
        >
          {view.links.map((link) => {
            const from = view.nodes.find((node) => node.id === link.from);
            const to = view.nodes.find((node) => node.id === link.to);
            if (!from || !to) return null;
            const [a, b] = [placeOf(from), placeOf(to)];
            return (
              <line
                key={`${link.from}>${link.to}`}
                x1={a[0] * 100}
                y1={a[1] * 100}
                x2={b[0] * 100}
                y2={b[1] * 100}
                vector-effect="non-scaling-stroke"
                class={link.oneWay && view.shape === 'drawn' ? 'world-one-way' : undefined}
              />
            );
          })}
        </svg>
        {view.nodes.map((node, index) => (
          <button
            key={node.id}
            type="button"
            class={move ? 'world-node movable' : 'world-node'}
            style={placeStyle(laid, placeOf(node))}
            aria-pressed={picked === node.id}
            data-node={node.id}
            data-start={node.id === view.at ? '' : undefined}
            onPointerDown={(event) => {
              if (!move) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id: node.id, fromX: event.clientX, fromY: event.clientY, moved: false };
            }}
            onPointerMove={(event) => {
              const now = drag.current;
              if (!now || now.id !== node.id || !board.current) return;
              if (!now.moved && Math.hypot(event.clientX - now.fromX, event.clientY - now.fromY) < SLOP) return;
              now.moved = true;
              const [x, y] = placeAt(board.current, event.clientX, event.clientY);
              setHeld({ id: node.id, x, y });
            }}
            onPointerUp={() => {
              const now = drag.current;
              if (now?.moved && held && move) move(node, index, held.x, held.y);
              setHeld(null);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setHeld(null);
            }}
            onClick={() => {
              // The click that ends a drag isn't a tap.
              const dragged = drag.current?.moved === true;
              drag.current = null;
              if (!dragged) pick(node, index);
            }}
          >
            <span class="world-node-name">{node.name ?? node.id}</span>
            {node.kind ? <span class="visually-hidden">, {node.kind}</span> : null}
          </button>
        ))}
      </section>
    </div>
  );
}
