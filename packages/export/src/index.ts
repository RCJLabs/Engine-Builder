/**
 * @eb/export: a game's exports (M4.10, D60, docs/specs/export.md). It takes the engine's runtime
 * and compiled packs and makes the web build, the single file, the itch.io zip and the repository
 * Publish writes, with the leak check. It never compiles a project or runs its scripts: the editor's
 * worker and eb export do that first. Not pure: it hashes with crypto.subtle and zips with fflate.
 */
export {
  EXPORT_TARGETS,
  type Exported,
  type ExportRequest,
  type ExportTarget,
  exportGame,
  zipFiles,
} from './exportGame.ts';
export { buildHash, sha256 } from './hash.ts';
export { type Boot, gamePage, inlineScript, scriptJson } from './html.ts';
export { drawnIcon, ICONS, iconFiles, onGround, readIcon, scaled } from './icons.ts';
export {
  checkLeaks,
  type Find,
  type LeakReport,
  type LeakToken,
  leakTokens,
  leakWords,
  MIN_TEXT,
  type PackContent,
  scan,
} from './leaks.ts';
export { decodePng, encodePng, type Rgba } from './png.ts';
export { readme } from './readme.ts';
export { assetLinks, type GameInfo, versionJson, webManifest } from './site.ts';
export { cachedFiles, serviceWorker } from './sw.ts';
export {
  type BuildInput,
  type BuildPack,
  engineTexts,
  type Files,
  gameInfo,
  itchFiles,
  type Runtime,
  repoFiles,
  singleFile,
  webFiles,
} from './targets.ts';
export { androidWorkflow, pagesWorkflow, twaManifest, twaPackageJson } from './workflows.ts';
