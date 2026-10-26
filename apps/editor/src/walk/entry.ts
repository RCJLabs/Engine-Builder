/**
 * walk.js (M5.8, D70, docs/specs/movement.md#exports): the stage, three and Rapier built apart from
 * an exported game's runtime by vite.walk.config.ts, as one classic script that leaves the stage
 * where the runtime's host finds it.
 */
import { mapOf } from './mapPins.ts';
import { startStage } from './stage.ts';

window.__ebWalkStage = { startStage, mapOf };
