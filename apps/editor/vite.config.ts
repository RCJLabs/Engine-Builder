import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Where the built editor is served from: the root of engine.rcjlabs.com, its own origin, so its
 * storage is its own (D28). Asset URLs, the manifest's scope and start_url, and the service
 * worker's navigation fallback all derive from this one value; EB_BASE overrides it.
 */
const BASE = process.env.EB_BASE ?? '/';

const repoRoot = resolve(import.meta.dirname, '../..');
// The root package.json is the one place the version is written down.
const { version } = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as { version: string };

function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const build = { version, sha: commitSha(), built: new Date().toISOString() };

/**
 * `version.json` lets a deploy check prove the live site serves this exact commit (the
 * Pages workflow waits for it). It is left out of the precache so it always comes from the
 * network.
 */
function versionFile(): Plugin {
  return {
    name: 'eb-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify(build, null, 2)}\n` });
    },
  };
}

/**
 * The runtime of an exported game (M4.10), built first by vite.game.config.ts into dist-game/, is
 * served at runtime/ beside the editor, so the service worker keeps it and Export works offline.
 * A dev server has none until it is built; Export then says so.
 */
function gameRuntime(): Plugin {
  const dir = resolve(import.meta.dirname, 'dist-game');
  return {
    name: 'eb-game-runtime',
    apply: 'build',
    generateBundle() {
      const list = resolve(dir, 'files.json');
      if (!existsSync(list))
        this.error('No game runtime in dist-game/: build it first (vite build -c vite.game.config.ts)');
      const { files } = JSON.parse(readFileSync(list, 'utf8')) as { files: string[] };
      for (const file of ['files.json', ...files]) {
        this.emitFile({ type: 'asset', fileName: `runtime/${file}`, source: readFileSync(resolve(dir, file)) });
      }
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  // Dev serves from `/`; the build and `vite preview` (which serves the build) use BASE.
  base: command === 'build' || isPreview ? BASE : '/',
  define: { __EB_BUILD__: JSON.stringify(build) },
  // The player page (M4.1) is a page of the editor's own build, so the service worker precaches
  // it with the rest and an exported game plays offline at /play/.
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        play: resolve(import.meta.dirname, 'play/index.html'),
      },
    },
  },
  plugins: [
    preact(),
    versionFile(),
    gameRuntime(),
    VitePWA({
      // Prompt, never auto-update: an editor reloading under someone loses their place. The
      // update gate (src/pwa/updateGate.ts) decides when the prompt may appear.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'Engine-Builder',
        short_name: 'Engine-Builder',
        description: 'Build game worlds, missions, scripts, menus and UI on PC, tablet or phone.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#14161a',
        theme_color: '#14161a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // runtime/files.json too: Export reads it to find the game runtime's files (M4.10). The wasm
        // is three's Draco and Basis decoders, for models offline (M5.5, D67).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,wasm}', 'runtime/files.json'],
        // The editor had rcjlabs.github.io's origin, shared with the games, before it moved to
        // engine.rcjlabs.com (D28). The prefixed cache id stays, so no cache is ever renamed.
        cacheId: 'eb-editor',
        cleanupOutdatedCaches: true,
        // The spikes and the games are separate pages deployed beside the editor (apps/spike-3d,
        // games/, D62), each a game with its own service worker. Without this, an installed
        // editor would answer /spikes/3d/ or /games/space-wrecked/ with its own index.html.
        navigateFallbackDenylist: [/\/version\.json$/, /\/spikes\//, /\/games\//],
      },
    }),
  ],
}));
