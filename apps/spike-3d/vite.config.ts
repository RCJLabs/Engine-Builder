import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * The spike builds into the editor's dist, at /spikes/3d/, after the editor has built. So it is
 * deployed with the editor, but never part of the editor's bundle or its offline precache: the
 * worker's file list is made before these files exist.
 */
const BASE = `${process.env.EB_BASE ?? '/'}spikes/3d/`;

export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE : '/',
  build: {
    outDir: resolve(import.meta.dirname, '../editor/dist/spikes/3d'),
    emptyOutDir: true,
    // three's WebGPU build and Rapier's inlined WebAssembly are megabytes by design: the
    // readings record their sizes rather than a warning hiding them.
    chunkSizeWarningLimit: 6000,
  },
}));
