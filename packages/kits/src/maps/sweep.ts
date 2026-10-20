/**
 * The check over seeds (M4.6, D56, docs/specs/maps.md#checks): a layered map made from seeds 1 to
 * 300, each of its rules held to what the author wrote, as space-wrecked's and wasteland's tests
 * hold their generators. The editor shows it rule by rule; `eb validate` warns of each rule some
 * seed breaks (W135), naming the first.
 */
import { crosses, makeLayered } from './layered.ts';
import { linksWithin, neighbours } from './roads.ts';
import type { KindNames, LayerRules, MadeMap, MadeNode, PlaceRule } from './types.ts';

export const SWEEP_SEEDS = 300;

export interface RuleCheck {
  /** Which rule: `place 0`, `reach`, `crossing`. */
  readonly rule: string;
  /** The seeds that keep it. */
  readonly kept: number;
  /** The first seed that doesn't, and what it made. */
  readonly first?: { readonly seed: string; readonly found: string };
}

const inWindow = (node: MadeNode, rule: PlaceRule, last: number) =>
  node.layer >= (rule.from ?? 1) && node.layer <= (rule.to ?? last);

/** What a seed's map breaks of a place rule, in words, or undefined when it keeps it. */
export function placeBroken(made: MadeMap, rule: PlaceRule, last: number): string | undefined {
  const of = made.nodes.filter((node) => node.kind === rule.kind && inWindow(node, rule, last));
  if (of.length < rule.min || of.length > rule.max) return `${of.length} ${rule.kind}`;
  if (rule.apart) {
    const layers = of.map((node) => node.layer);
    const twice = layers.find((layer, i) => layers.indexOf(layer) !== i);
    if (twice !== undefined) return `two ${rule.kind} in layer ${twice}`;
  }
  if (rule.avoidable) {
    const forced = of.find((node) => onlyWayOn(made, node));
    if (forced) return `${forced.id}, the only way on`;
  }
  return undefined;
}

function onlyWayOn(made: MadeMap, node: MadeNode): boolean {
  const before = made.nodes.filter((each) => each.layer === node.layer - 1).map((each) => each.id);
  return before.some((parent) => {
    const on = made.links.filter(([a]) => a === parent).map(([, b]) => b);
    return on.length === 1 && on[0] === node.id;
  });
}

/** What a seed's map breaks of reaching: a node the start doesn't reach, or, going forward only, one that can't reach the end. */
export function reachBroken(made: MadeMap): string | undefined {
  const next = neighbours(made, undefined);
  const from = linksWithin(next, made.start, made.nodes.length);
  const lost = made.nodes.find((node) => node.id !== made.start && !from.has(node.id));
  if (lost) return `${lost.id} unreached`;
  if (made.forward && made.end !== undefined) {
    const stuck = made.nodes.find(
      (node) => node.id !== made.end && !linksWithin(next, node.id, made.nodes.length).has(made.end as string),
    );
    if (stuck) return `${stuck.id} can’t reach the end`;
  }
  return undefined;
}

/** Two links between the same layers that cross, in words, or undefined. */
export function crossingBroken(made: MadeMap): string | undefined {
  const at = new Map(made.nodes.map((node) => [node.id, node]));
  const pairs = made.links.map(([a, b]) => [at.get(a) as MadeNode, at.get(b) as MadeNode] as const);
  for (const [i, x] of pairs.entries())
    for (const y of pairs.slice(i + 1))
      if (x[0].layer === y[0].layer && crosses([x[0].slot, x[1].slot], [y[0].slot, y[1].slot]))
        return `${x[0].id}–${x[1].id} crosses ${y[0].id}–${y[1].id}`;
  return undefined;
}

/** Every rule of a layered map against seeds 1 to `seeds`: how many keep it, and the first that doesn't. */
export function sweepLayered(
  map: string,
  rules: LayerRules,
  kindNames: KindNames,
  seeds: number = SWEEP_SEEDS,
): RuleCheck[] {
  const last = rules.count - 2;
  const checks: { rule: string; broken: (made: MadeMap) => string | undefined }[] = [
    ...(rules.place ?? []).map((rule, i) => ({
      rule: `place ${i}`,
      broken: (made: MadeMap) => placeBroken(made, rule, last),
    })),
    { rule: 'reach', broken: reachBroken },
    { rule: 'crossing', broken: crossingBroken },
  ];
  const kept = checks.map(() => 0);
  const first: (RuleCheck['first'] | undefined)[] = checks.map(() => undefined);
  for (let n = 1; n <= seeds; n++) {
    const seed = String(n);
    const made = makeLayered(map, rules, kindNames, seed);
    for (const [i, check] of checks.entries()) {
      const found = check.broken(made);
      if (found === undefined) kept[i] = (kept[i] as number) + 1;
      else if (first[i] === undefined) first[i] = { seed, found };
    }
  }
  return checks.map((check, i) => {
    const firstBroken = first[i];
    return firstBroken
      ? { rule: check.rule, kept: kept[i] as number, first: firstBroken }
      : { rule: check.rule, kept: kept[i] as number };
  });
}
