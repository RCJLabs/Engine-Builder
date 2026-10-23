import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * The runtime of an exported game (M4.10, D60): src/game built into dist-game/ as one script and
 * one stylesheet, the game's worker inlined, with files.json listing them. Export writes its own
 * page around them (packages/export/src/html.ts), beside it or inside it, so the build must make
 * nothing else: a lazy chunk, a font or an image file would be left behind by a single-file export.
 */
const repoRoot = resolve(import.meta.dirname, '../..');
const { version } = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as { version: string };

const RUNTIME_FILES = ['game.js', 'game.css'];

function runtimeList(): Plugin {
  return {
    name: 'eb-runtime-list',
    apply: 'build',
    // After Vite's own, which emits the stylesheet.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const made = Object.keys(bundle).filter((name) => !name.endsWith('.html'));
      const extra = made.filter((name) => !RUNTIME_FILES.includes(name));
      if (extra.length > 0 || made.length !== RUNTIME_FILES.length) {
        this.error(
          `The game's runtime must be exactly ${RUNTIME_FILES.join(' and ')}; the build made ${made.join(', ')}`,
        );
      }
      this.emitFile({
        type: 'asset',
        fileName: 'files.json',
        source: `${JSON.stringify({ version, files: RUNTIME_FILES }, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  base: './',
  // public/ is the editor's: its icons are no game's.
  publicDir: false,
  plugins: [preact(), runtimeList()],
  // The worker's script goes inside the page's (?worker&inline), as a classic script, so a blob URL
  // starts it from file:// too.
  worker: { format: 'iife' },
  build: {
    outDir: 'dist-game',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    // Anything CSS points at goes inside it: the runtime is two files, whatever it draws with.
    assetsInlineLimit: () => true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'game/index.html'),
      output: {
        entryFileNames: 'game.js',
        assetFileNames: (asset) => (asset.names.some((n) => n.endsWith('.css')) ? 'game.css' : '[name][extname]'),
        inlineDynamicImports: true,
      },
    },
  },
});
