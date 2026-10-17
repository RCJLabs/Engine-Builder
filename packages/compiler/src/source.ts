/**
 * Where a project's files come from. The compiler reads only through this, so a folder on disk
 * (the CLI), OPFS or an opened folder (the editor), a zip, and memory (tests) compile the same.
 */
export interface ProjectSource {
  /**
   * Every file under `dir`, at any depth, as paths relative to the project root joined with `/`.
   * Hidden entries (see isHiddenName) and everything inside them are left out.
   */
  files(dir: string): Promise<readonly string[]>;
  /** A file's bytes, or undefined when there is no such file. */
  read(path: string): Promise<Uint8Array | undefined>;
}

/**
 * Names the compiler never reads: dotfiles and dot-folders (`.git`, `.DS_Store`, `.gitkeep`) and
 * the `__MACOSX` folder that macOS adds to zips.
 */
export const isHiddenName = (name: string): boolean => name.startsWith('.') || name === '__MACOSX';

const isVisible = (path: string): boolean => !path.split('/').some(isHiddenName);

/** Files held in memory, keyed by path. Strings are stored as UTF-8. */
export function memorySource(files: Readonly<Record<string, string | Uint8Array>>): ProjectSource {
  const encoder = new TextEncoder();
  const bytes = new Map<string, Uint8Array>();
  for (const [path, content] of Object.entries(files)) {
    bytes.set(path, typeof content === 'string' ? encoder.encode(content) : content);
  }
  return {
    files: async (dir) =>
      [...bytes.keys()].filter((path) => (dir === '' || path.startsWith(`${dir}/`)) && isVisible(path)),
    read: async (path) => bytes.get(path),
  };
}
