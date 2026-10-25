import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Where the game runtime and the classic scripts beside it are built: one folder is one runtime. */
export const GAME_DIR = resolve(import.meta.dirname, 'dist-game');

/**
 * A classic script beside the game runtime (walk.js, M5.8; nav.js, M6.2): it must be one file, and
 * files.json gains its name under `key`, for Export and for eb export's --runtime.
 */
export function runtimeScript(fileName: string, key: string): Plugin {
  return {
    name: `eb-runtime-${key}`,
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const made = Object.keys(bundle).filter((name) => !name.endsWith('.map'));
      if (made.length !== 1 || made[0] !== fileName) {
        this.error(`${fileName} must be one file; the build made ${made.join(', ')}`);
      }
      const list = resolve(GAME_DIR, 'files.json');
      if (!existsSync(list))
        this.error('No game runtime in dist-game/: build it first (vite build -c vite.game.config.ts)');
      const runtime = JSON.parse(readFileSync(list, 'utf8')) as Record<string, unknown>;
      this.emitFile({
        type: 'asset',
        fileName: 'files.json',
        source: `${JSON.stringify({ ...runtime, [key]: fileName }, null, 2)}\n`,
      });
    },
  };
}

/**
 * A classic script has no import.meta: rolldown leaves `{}` there, and three's KTX2Loader would make
 * its decoders' URLs against "undefined" and throw as walk.js runs. The page's own address stands in,
 * after Vite has made those URLs data URLs (assetsInlineLimit), so it is never fetched against.
 */
export function importMetaUrl(): Plugin {
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
