import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { GAME_DIR, importMetaUrl, runtimeScript } from './vite.classic.ts';

/**
 * nav.js (M6.2, D74, docs/specs/navigation.md#the-stage): Recast and Detour, their wasm inside, built
 * apart from walk.js as one classic script, so a game whose spaces have no navmesh carries none of
 * it. It goes into dist-game/ after walk.js, and files.json gains its name. The editor's bake worker
 * imports the same file, so the editor keeps one copy of Recast.
 */
export default defineConfig({
  publicDir: false,
  plugins: [importMetaUrl(), runtimeScript('nav.js', 'nav')],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: GAME_DIR,
    emptyOutDir: false,
    assetsInlineLimit: () => true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/nav/entry.ts'),
      formats: ['iife'],
      name: 'ebNav',
      fileName: () => 'nav.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
