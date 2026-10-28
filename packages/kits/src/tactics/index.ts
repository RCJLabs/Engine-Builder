/** The tactics kit (M7.5, D87, docs/specs/tactics.md): Space-Wrecked's boarding fight on a 2D space's tilemap. */
export { aiAction, bestPlan, harm, type Plan, plansFor } from './ai.ts';
export { type Arena, fieldOf, type Rolls, reachOf, sees } from './field.ts';
export { type LineWords, lineOf } from './lines.ts';
export { tacticsModule } from './module.ts';
export { type Band, dartOdds, type Odds, type Part, rangeBand, shotOdds } from './odds.ts';
export { optionsOf } from './options.ts';
export { orderTargets } from './orders.ts';
export { arenaOf, battleRecord, numbersOf, rulesRecord } from './records.ts';
export { act, createBattle, type Setting } from './turns.ts';
export * from './types.ts';
