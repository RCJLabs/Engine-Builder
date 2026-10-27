import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { GAME_DIR, runtimeScript } from './vite.classic.ts';

/**
 * stage2d.js (M7.1, D83, docs/specs/2d-scenes.md#play): the 2D stage, built apart from walk.js as one
 * classic script, so a game whose spaces are all 3D carries none of it and one with only 2D spaces
 * carries no three or Rapier. It goes into dist-game/ after nav.js, and files.json gains its name.
 * Since M7.4 it carries the stage worker a space drawn by its own code runs in.
 */
export default defineConfig({
  publicDir: false,
  plugins: [runtimeScript('stage2d.js', 'stage2d')],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  // A stage's worker (M7.4) goes inside stage2d.js (?worker&inline), as a classic script, so a blob
  // URL starts it from file:// as from a server.
  worker: { format: 'iife' },
  build: {
    outDir: GAME_DIR,
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/stage2d/entry.ts'),
      formats: ['iife'],
      name: 'ebStage2d',
      fileName: () => 'stage2d.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
