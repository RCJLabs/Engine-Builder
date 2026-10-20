import type { Policy } from 'eb';

/** The layer of a node of a layered map, from its id: `n3-1` is in layer 3. */
const layerOf = (id: unknown) => Number(/^n(\d+)-/.exec(String(id))?.[1] ?? -1);

/**
 * A pilot who heads for the jump point: four times in five a jump that goes on a layer, else
 * whatever is offered, as a player who looks around sometimes. It sees only what the map shows.
 */
export const pilot: Policy = {
  name: 'pilot',
  choose({ options, rng, fact }) {
    const here = fact('maps.layer') as number;
    const on = options.filter((o) => o.type === 'maps/travel' && o.move === 'jump' && layerOf(o.to) > here);
    if (on.length > 0 && rng.chance(4, 5)) return rng.pick(on);
    return rng.pick(options);
  },
};
