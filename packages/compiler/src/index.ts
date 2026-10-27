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
export { SCREENS, screenReads, withScreens } from './flagUses.ts';
export {
  type GltfSummary,
  gltfJson,
  gltfProblems,
  gltfSummary,
  READ_EXTENSIONS,
  slotName,
} from './gltf.ts';
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
export { checkMapFiles, type MapFileRead, mapImageNames, readMapFile, type SpaceMapFile } from './mapFiles.ts';
export { mapHashes, mapInputs, mapInputsHash, terrainFilesOf } from './mapInputs.ts';
export { checkModels, modelDiagnostics, modelFileOf } from './models.ts';
export {
  checkNavFiles,
  NAV_HEADER,
  NAV_VERSION,
  type NavFileRead,
  navFileBytes,
  navHeader,
  navmeshOf,
} from './navFiles.ts';
export {
  NAV_AGENT,
  NAV_CELLS,
  type NavFrame,
  type NavModelOf,
  type NavSolid,
  navHashes,
  navInputs,
  navInputsHash,
  navModelsOf,
  navSolids,
} from './navInputs.ts';
export { actorPlaces, spaceObjectsOf, walkersOf } from './npcPlaces.ts';
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
  eachPlacedRecord,
  type ModelSources,
  modelFieldOf,
  modelHere,
  modelNeeds,
  placedKeys,
} from './placedModels.ts';
export { placesOf, spaceTagsOf } from './places.ts';
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
  mapPath,
  navPath,
  PREFABS_DIR,
  SPACES_DIR,
  type SpaceFile,
  type SpaceKind,
  spacePath,
  type TerrainPart,
  terrainPath,
} from './spaceFiles.ts';
export { checkProjectSpaceParts, checkSpaceParts, type SpacePartsContext, type SpaceUse } from './spaceParts.ts';
export {
  CHUNK,
  FOLIAGE_MOST,
  SHAPES,
  type Shape,
  type SpaceJson,
  type SpaceObject,
  spaceSchema,
  TERRAIN_SIZES,
  type TerrainJson,
  terrainSchema,
} from './spaceShape.ts';
export {
  checkProjectSpaces,
  checkSpaces,
  readSpaces,
  type SpaceFileRead,
} from './spaces.ts';
export { checkSprites, framesOf, spriteDiagnostics, spriteSheetOf } from './sprites.ts';
export { fromTemplate, idFromName, shortNameOf, type TemplateEntry } from './template.ts';
export { checkTerrains, type PngHeader, pngHeader, type TerrainFileRead } from './terrains.ts';
export { type ProjectTypes, readTypes, type TypeReport } from './types.ts';
export { checkProjectUi, packUi, readUi, type UiRead } from './ui.ts';
export { classifyUi, FEEDBACK_FILE, SHELL_FILE, screenPath, THEME_FILE, UI_DIR, type UiFileRole } from './uiFiles.ts';
export { type DrawnSources, spaceSpawns } from './world.ts';
export { type ZipLimits, zipSource } from './zipSource.ts';
