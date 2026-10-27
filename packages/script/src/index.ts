/**
 * @eb/script: project scripts (M3.2, D38, docs/specs/scripts.md). A script is
 * scripts/<id>.ts, TypeScript that imports "eb" and other scripts; scripts/game.ts exports the
 * game. Since M7.4 a stage is stages/<id>.ts, which draws a 2D space (docs/specs/stages.md). Checking a script reads it; loading one runs it, which only trusted projects do.
 */
export { EB_MODULE } from './api.ts';
export { type ApiEntry, CTX_API, EB_API, MODULE_API, RNG_API } from './apiDocs.ts';
export { type CatalogFact, type GameCatalog, gameCatalog } from './catalog.ts';
export { type CheckedScript, checkScript, EB, importedScript, type ScriptProblem } from './check.ts';
export { classifyScript, GAME_SCRIPT, SCRIPTS_DIR, type ScriptFile, scriptPath } from './files.ts';
export { type GameProblem, type GameRead, type ProjectGame, readGame } from './game.ts';
export { asScriptError, loadScripts, ScriptError, scriptLocation } from './load.ts';
export { headerLines, type ModuleSet, type Resolved, runModules } from './modules.ts';
export { type LoadedGame, loadProjectGame } from './project.ts';
export {
  asStageError,
  isStageEntry,
  loadStage,
  STAGE_API,
  STAGES_DIR,
  StageError,
  stageImport,
  stagePath,
} from './stageLoad.ts';
export { checkStage, classifyStage, type StageFile } from './stages.ts';
export { type Transpiled, transpileScript } from './transpile.ts';
