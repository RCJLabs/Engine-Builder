import type { Plugin } from 'vite';

/**
 * three's DRACOLoader names its own decoder files with `new URL`, so Vite would ship them all and
 * the service worker precache them: the asm.js fallback (719 kB) and the glTF build's wrapper and
 * wasm (250 kB), none of them ever fetched. The view always gives the loader its decoder's files
 * (src/spaces/modelsView.ts), so the loader's own names are blanked (M5.5). Five names are
 * expected: a three that names others fails the build here rather than shipping them unseen.
 */
export function dracoDefaultsOff(): Plugin {
  const named = /new URL\( '\.\.\/libs\/draco\/[^']+', import\.meta\.url \)\.toString\(\)/g;
  return {
    name: 'eb-draco-defaults-off',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/three/examples/jsm/loaders/DRACOLoader.js')) return null;
      const found = code.match(named)?.length ?? 0;
      if (found !== 5) this.error(`three's DRACOLoader names ${found} decoder files, not 5`);
      return { code: code.replace(named, "''"), map: null };
    },
  };
}
