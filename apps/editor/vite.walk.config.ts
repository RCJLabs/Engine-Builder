import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { dracoDefaultsOff } from './vite.draco.ts';

/**
 * walk.js (M5.8, D70, docs/specs/movement.md#exports): the stage of a game with spaces, three,
 * Rapier and the decoders its models need, built apart from game.js as one classic script, so a
 * game without spaces carries none of it and a single-file export can hold it. It goes into
 * dist-game/ beside the game runtime, after it, and files.json gains its name: one folder is one
 * runtime, for Export and for eb export's --runtime.
 */
const outDir = resolve(import.meta.dirname, 'dist-game');

function walkList(): Plugin {
  return {
    name: 'eb-walk-list',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const made = Object.keys(bundle).filter((name) => !name.endsWith('.map'));
      if (made.length !== 1 || made[0] !== 'walk.js') {
        this.error(`walk.js must be one file; the build made ${made.join(', ')}`);
      }
      const list = resolve(outDir, 'files.json');
      if (!existsSync(list))
        this.error('No game runtime in dist-game/: build it first (vite build -c vite.game.config.ts)');
      const runtime = JSON.parse(readFileSync(list, 'utf8')) as Record<string, unknown>;
      this.emitFile({
        type: 'asset',
        fileName: 'files.json',
        source: `${JSON.stringify({ ...runtime, walk: 'walk.js' }, null, 2)}\n`,
      });
    },
  };
}

/**
 * A classic script has no import.meta: rolldown leaves `{}` there, and three's KTX2Loader would make
 * its decoders' URLs against "undefined" and throw as walk.js runs. The page's own address stands in,
 * after Vite has made those URLs data URLs (assetsInlineLimit), so it is never fetched against.
 */
function importMetaUrl(): Plugin {
  return {
    name: 'eb-import-meta-url',
    enforce: 'post',
    transform(code) {
      return code.includes('import.meta.url')
        ? { code: code.replaceAll('import.meta.url', 'self.location.href'), map: null }
        : null;
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [dracoDefaultsOff(), importMetaUrl(), walkList()],
  // Library builds leave process.env alone for their users; walk.js is run as it is.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir,
    // The game runtime is already there.
    emptyOutDir: false,
    // Every decoder's wasm goes inside the script, which a single-file export holds whole.
    assetsInlineLimit: () => true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/walk/entry.ts'),
      formats: ['iife'],
      name: 'ebWalk',
      fileName: () => 'walk.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
