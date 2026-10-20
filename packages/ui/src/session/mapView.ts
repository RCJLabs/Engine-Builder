/**
 * The map the party is on, as the map widget draws it (M4.6, docs/specs/maps.md#the-map-widget):
 * enter-map's preview, which holds the kit's own travels and verdicts, put in words. A move's
 * button is enabled only while the game offers its action, so what the map lets a player tap is
 * what the sim accepts, at the cost the sim charges.
 */
import { canonicalJson } from '@eb/core';
import type { MapShown, TravelShown } from '@eb/kits';
import type { MapNode, MapTravel, MapView } from './types.ts';
import type { Reading } from './views.ts';
import { changesText, costText, nameOf, takesText, whyText } from './words.ts';

function travelOf(reading: Reading, travel: TravelShown): MapTravel {
  const action = { type: 'maps/travel', move: travel.move, to: travel.to };
  return {
    key: travel.move,
    label: travel.label,
    action,
    enabled: reading.offered.has(canonicalJson(action)),
    cost: costText(travel.cost, reading.content),
    takes: takesText(travel.takes),
    changes: changesText(travel.changes, reading.content),
    why: travel.ok ? null : whyText(travel, reading.catalog, reading.content),
  };
}

function describedKind(reading: Reading, kind: string | undefined): string | null {
  if (kind === undefined || !reading.content.has('node-kind', kind)) return null;
  const { description } = reading.content.get('node-kind', kind) as { description?: unknown };
  return typeof description === 'string' && description !== '' ? description : null;
}

export function mapShows(reading: Reading): MapView | undefined {
  const slice = reading.state.maps as { made?: { map?: unknown } } | undefined;
  const map = slice?.made?.map;
  if (typeof map !== 'string') return undefined;
  const shown = reading.preview({ effect: 'enter-map', map }) as unknown as MapShown;
  if (!shown.on) return undefined;
  const travels = new Map<string, MapTravel[]>();
  for (const travel of shown.travels) {
    travels.set(travel.to, [...(travels.get(travel.to) ?? []), travelOf(reading, travel)]);
  }
  const nodes = shown.nodes.map(
    (node): MapNode => ({
      id: node.id,
      layer: node.layer,
      slot: node.slot,
      ...(node.x === undefined || node.y === undefined ? {} : { x: node.x, y: node.y }),
      known: node.known,
      visited: node.visited,
      name: node.name ?? null,
      kind: node.kind === undefined ? null : (nameOf(reading.content, 'node-kind', node.kind) ?? node.kind),
      description: describedKind(reading, node.kind),
      travels: travels.get(node.id) ?? [],
    }),
  );
  return {
    map,
    name: shown.name,
    shape: shown.shape,
    layers: shown.layers,
    at: shown.at,
    nodes,
    links: shown.links.map(({ from, to, oneWay }) => ({ from, to, oneWay })),
  };
}
