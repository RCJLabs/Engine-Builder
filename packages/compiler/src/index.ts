/**
 * @eb/compiler: reads a project, checks it and builds content packs (docs/specs/project-format.md).
 * It runs in the editor and in the CLI with the same results. Not pure: it imports zod through
 * @eb/schema. The runtime never imports it; it reads packs through @eb/core's readPack.
 */
export { type CompileResult, compileProject } from './compile.ts';
export { type DirectoryHandleLike, directorySource, type FileHandleLike, type HandleLike } from './directorySource.ts';
export { classifyRecordFile, MANIFEST_FILE, RECORDS_DIR, type RecordFile } from './layout.ts';
export { checkManifest, type ManifestProblem, PROJECT_FORMAT, projectSchema } from './manifest.ts';
export { isHiddenName, memorySource, type ProjectSource } from './source.ts';
export { zipSource } from './zipSource.ts';
