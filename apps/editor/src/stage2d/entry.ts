/**
 * stage2d.js (M7.1, D83, docs/specs/2d-scenes.md#play): the 2D stage built apart from walk.js by
 * vite.stage2d.config.ts, as one classic script that leaves the stage where the hosts find it. It
 * carries no renderer of its own: a canvas draws it (D83's As built).
 */
import { startStage2d } from './stage.ts';

window.__ebStage2dStage = { startStage2d };
