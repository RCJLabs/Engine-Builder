/**
 * @eb/compiler: reads a project, checks it and builds content packs (docs/specs/project-format.md).
 * It runs in the editor and in the CLI with the same results. Not pure: it imports zod through
 * @eb/schema. The runtime never imports it; it reads packs through @eb/core's readPack.
 */
export { type CompileOptions, type CompileResult, compileProject } from './compile.ts';
export { type ParsedFile, parseJsonFile } from './decode.ts';
export { type DirectoryHandleLike, directorySource, type FileHandleLike, type HandleLike } from './directorySource.ts';
export { placeOfPointer, type TextPlace } from './jsonLines.ts';
export {
  ASSETS_DIR,
  ASSETS_LOG,
  classifyRecordFile,
  classifyTypeFile,
  MANIFEST_FILE,
  PROJECT_FOLDERS,
  RECORDS_DIR,
  type RecordFile,
  TYPES_DIR,
  type TypeFileRole,
} from './layout.ts';
export { checkManifest, type ManifestProblem, PROJECT_FORMAT, projectSchema } from './manifest.ts';
export {
  type KitSettings,
  type ListedRecord,
  type ProjectFilesRead,
  readKitSettings,
  readProjectFiles,
} from './projectCheck.ts';
export { compileWithGame, gameOf, gameOptions, projectGame, type ScriptedGame } from './projectGame.ts';
export { projectFiles, readFiles, zipProject } from './projectZip.ts';
export { classifyScene, SCENES_DIR, type SceneFile, scenePath } from './sceneFiles.ts';
export { atSceneLine, readScenes, type ScenesRead } from './scenes.ts';
export { readScripts, type ScriptsRead } from './scripts.ts';
export { isHiddenName, memorySource, type ProjectSource } from './source.ts';
export { type ProjectTypes, readTypes, type TypeReport } from './types.ts';
export { checkProjectUi, packUi, readUi, type UiRead } from './ui.ts';
export { classifyUi, FEEDBACK_FILE, screenPath, THEME_FILE, UI_DIR, type UiFileRole } from './uiFiles.ts';
export { type ZipLimits, zipSource } from './zipSource.ts';
