import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { GAME_DIR, importMetaUrl, runtimeScript } from './vite.classic.ts';
import { dracoDefaultsOff } from './vite.draco.ts';

/**
 * walk.js (M5.8, D70, docs/specs/movement.md#exports): the stage of a game with spaces, three,
 * Rapier and the decoders its models need, built apart from game.js as one classic script, so a
 * game without spaces carries none of it and a single-file export can hold it. It goes into
 * dist-game/ beside the game runtime, after it, and files.json gains its name: one folder is one
 * runtime, for Export and for eb export's --runtime.
 */
export default defineConfig({
  publicDir: false,
  plugins: [dracoDefaultsOff(), importMetaUrl(), runtimeScript('walk.js', 'walk')],
  // Library builds leave process.env alone for their users; walk.js is run as it is.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: GAME_DIR,
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
