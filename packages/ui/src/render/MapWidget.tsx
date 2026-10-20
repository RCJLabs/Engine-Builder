/**
 * The map widget (M4.6, docs/specs/maps.md#the-map-widget): the map the party is on, its links
 * drawn behind its nodes, each node a button at least 44 px each way. A tap picks a node; under the
 * map, its name, kind and description, and a button for each move that reaches it, saying what it
 * costs and takes and why it can't be taken. A move's button takes its action only while the game
 * offers it, so the map lets a player do just what the sim accepts.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Widget } from '../format/screen.ts';
import type { MapNode, MapView } from '../session/types.ts';
import type { Drawing } from './context.ts';
import { fill } from './fill.ts';
import { type Board, boardOf, HALF_ACROSS, HALF_DOWN, placeStyle, scrollFor } from './mapLayout.ts';

type MapWidget = Extract<Widget, { widget: 'map' }>;

function Links({ map, board }: { readonly map: MapView; readonly board: Board }) {
  return (
    <svg
      class="eb-map-links"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ inset: `${HALF_DOWN}px ${HALF_ACROSS}px` }}
    >
      {map.links.map((link) => {
        const [a, b] = [board.places.get(link.from), board.places.get(link.to)];
        if (!a || !b) return null;
        return (
          <line
            key={`${link.from}>${link.to}`}
            x1={a[0] * 100}
            y1={a[1] * 100}
            x2={b[0] * 100}
            y2={b[1] * 100}
            vector-effect="non-scaling-stroke"
            class={link.oneWay && map.shape === 'drawn' ? 'eb-map-one-way' : undefined}
          />
        );
      })}
    </svg>
  );
}

interface NodeProps {
  readonly node: MapNode;
  readonly map: MapView;
  readonly place: readonly [number, number];
  readonly picked: boolean;
  readonly pick: () => void;
}

function NodeButton({ node, map, place, picked, pick }: NodeProps) {
  const here = node.id === map.at;
  return (
    <button
      type="button"
      class="eb-button eb-map-node"
      style={placeStyle(place)}
      aria-pressed={picked}
      data-node={node.id}
      data-here={here ? '' : undefined}
      data-reached={node.travels.length > 0 ? '' : undefined}
      data-visited={node.visited ? '' : undefined}
      onClick={pick}
    >
      {node.known ? (
        <span class="eb-map-name">{node.name ?? node.id}</span>
      ) : (
        <>
          <span aria-hidden="true">?</span>
          <span class="eb-sr">Unknown</span>
        </>
      )}
      {node.known && node.kind ? <span class="eb-sr">, {node.kind}</span> : null}
      {here ? <span class="eb-sr">, you are here</span> : null}
    </button>
  );
}

function Picked({ node, map, drawing }: { readonly node: MapNode; readonly map: MapView; readonly drawing: Drawing }) {
  const about = [node.kind, node.id === map.at ? 'You are here' : node.visited ? 'Visited' : null].filter(Boolean);
  return (
    <div class="eb-map-picked">
      <p class="eb-text eb-heading">{node.known ? (node.name ?? node.id) : 'Unknown'}</p>
      {about.length > 0 ? <p class="eb-text eb-caption">{about.join(' · ')}</p> : null}
      {node.description ? <p class="eb-text">{node.description}</p> : null}
      {node.travels.length > 0 ? (
        <ul class="eb-list">
          {node.travels.map((travel) => (
            <li key={travel.key}>
              <button
                type="button"
                class="eb-button eb-primary"
                disabled={!travel.enabled || drawing.busy}
                onClick={() => drawing.act(travel.action)}
              >
                {[travel.label, travel.cost, travel.takes, travel.changes].filter(Boolean).join(' · ')}
              </button>
              {travel.why ? <p class="eb-text eb-caption">{travel.why}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MapWidgetView({ widget, drawing }: { readonly widget: MapWidget; readonly drawing: Drawing }) {
  const { view, breakpoint } = drawing;
  const map = view.map;
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const column = useRef<HTMLDivElement>(null);
  const board = map ? boardOf(map, breakpoint) : undefined;
  // Each arrival picks nothing again and, on a phone, scrolls the column to where the party is.
  useEffect(() => {
    setPicked(undefined);
    const scroller = column.current;
    if (scroller && board && map) scroller.scrollTop = scrollFor(board, map.at, scroller.clientHeight);
  }, [map?.map, map?.at, breakpoint]);
  if (!map || !board) {
    return widget.empty === undefined ? null : <p class="eb-text eb-empty">{fill(widget.empty, view)}</p>;
  }
  const shown = map.nodes.find((node) => node.id === (picked ?? map.at));
  const drawn = (
    <div
      class="eb-map-board"
      style={board.tall ? { height: `${board.height}px` } : { aspectRatio: String(board.ratio) }}
    >
      <Links map={map} board={board} />
      {map.nodes.map((node) => (
        <NodeButton
          key={node.id}
          node={node}
          map={map}
          place={board.places.get(node.id) ?? [0.5, 0.5]}
          picked={node.id === (picked ?? map.at)}
          pick={() => setPicked(node.id)}
        />
      ))}
    </div>
  );
  return (
    <section class="eb-map" aria-label={widget.label === undefined ? map.name : fill(widget.label, view)}>
      {board.tall ? (
        <div class="eb-map-column" ref={column}>
          {drawn}
        </div>
      ) : (
        drawn
      )}
      {shown ? <Picked node={shown} map={map} drawing={drawing} /> : null}
    </section>
  );
}
