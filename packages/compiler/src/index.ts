/**
 * @eb/compiler: reads a project, checks it and builds content packs (docs/specs/project-format.md).
 * It runs in the editor and in the CLI with the same results. Not pure: it imports zod through
 * @eb/schema. The runtime never imports it; it reads packs through @eb/core's readPack.
 */
export { type CompileOptions, type CompileResult, compileProject } from './compile.ts';
export { type ComponentKinds, readComponentKinds } from './components.ts';
export { type ParsedFile, parseJsonFile } from './decode.ts';
export { type DirectoryHandleLike, directorySource, type FileHandleLike, type HandleLike } from './directorySource.ts';
export { editionSource, hiddenByEdition, leavesOutAnything, leftOutRecords } from './edition.ts';
export { checkExport, type ExportChecked, type ExportContext, leavesOutRecord } from './exportCheck.ts';
export {
  EXPORT_FILE,
  type ExportJson,
  editionOf,
  exportSchema,
  FULL,
  type LeaveOut,
  leaveOutOf,
  NOTHING_LEFT_OUT,
  packageIdFor,
  TARGETS,
  type TargetName,
} from './exportFile.ts';
export {
  checkGuide,
  GUIDE_FILE,
  GUIDE_PANELS,
  GUIDE_TITLE,
  type GuideChecked,
  type GuideJson,
  type GuidePanel,
  type GuideStep,
  guideSchema,
  opensInEditor,
} from './guide.ts';
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
  eachPlaced,
  type Fields,
  isFields,
  mergeComponents,
  overridden,
  passedOn,
  placedObjects,
  recordHere,
} from './overrides.ts';
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
export {
  COMPONENTS_DIR,
  type ComponentFile,
  classifyComponentFile,
  classifySpaceFile,
  componentPath,
  PREFABS_DIR,
  SPACES_DIR,
  type SpaceFile,
  type SpaceKind,
  spacePath,
} from './spaceFiles.ts';
export { checkProjectSpaceParts, checkSpaceParts, type SpacePartsContext, type SpaceUse } from './spaceParts.ts';
export { SHAPES, type Shape, type SpaceJson, type SpaceObject, spaceSchema } from './spaceShape.ts';
export {
  checkProjectSpaces,
  checkSpaces,
  readSpaces,
  type SpaceFileRead,
} from './spaces.ts';
export { fromTemplate, idFromName, shortNameOf, type TemplateEntry } from './template.ts';
export { type ProjectTypes, readTypes, type TypeReport } from './types.ts';
export { checkProjectUi, packUi, readUi, type UiRead } from './ui.ts';
export { classifyUi, FEEDBACK_FILE, SHELL_FILE, screenPath, THEME_FILE, UI_DIR, type UiFileRole } from './uiFiles.ts';
export { type ZipLimits, zipSource } from './zipSource.ts';
