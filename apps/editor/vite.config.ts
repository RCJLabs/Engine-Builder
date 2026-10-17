import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Where the built editor is served from. A github.io project site lives at `/<repo>/`; a
 * custom domain would serve it at `/` (ROADMAP open question: decide before Phase 2 stores
 * projects, because browser storage is per origin). Asset URLs, the manifest's scope and
 * start_url, and the service worker's navigation fallback all derive from this one value.
 */
const BASE = process.env.EB_BASE ?? '/Engine-Builder/';

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

export default defineConfig(({ command, isPreview }) => ({
  // Dev serves from `/`; the build and `vite preview` (which serves the build) use BASE.
  base: command === 'build' || isPreview ? BASE : '/',
  define: { __EB_BUILD__: JSON.stringify(build) },
  plugins: [
    preact(),
    versionFile(),
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
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Every app on rcjlabs.github.io shares one origin; a prefixed cache id keeps this
        // worker's caches apart from the games'.
        cacheId: 'eb-editor',
        cleanupOutdatedCaches: true,
        // The spikes are separate pages deployed beside the editor (apps/spike-3d). Without
        // this, an installed editor would answer /spikes/3d/ with its own index.html.
        navigateFallbackDenylist: [/\/version\.json$/, /\/spikes\//],
      },
    }),
  ],
}));
