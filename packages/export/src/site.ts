/**
 * The web build's small files (docs/specs/export.md#the-files-of-each-target): the manifest that
 * makes it installable, version.json that names the build for the Pages workflow's check, and
 * assetlinks.json that vouches for the Android app.
 */

export interface GameInfo {
  readonly game: string;
  readonly name: string;
  readonly shortName: string;
  readonly description?: string;
  readonly version: string;
  readonly orientation: 'any' | 'portrait' | 'landscape';
  readonly background: string;
  readonly theme: string;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * id, start_url and scope are "./", so the app is the same app at any path (Dirtbag's check.mjs
 * holds its own to this; Sandbagged changed its id once and players got a second app).
 */
export function webManifest(info: GameInfo): string {
  return json({
    id: './',
    name: info.name,
    short_name: info.shortName,
    ...(info.description ? { description: info.description } : {}),
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: info.orientation,
    background_color: info.background,
    theme_color: info.theme,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
}

export const versionJson = (info: GameInfo, edition: string, build: string): string =>
  json({ game: info.game, edition, version: info.version, build });

/** Digital Asset Links: the site's word that the app with this package and these keys is its own. */
export const assetLinks = (pkg: string, fingerprints: readonly string[]): string =>
  json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: pkg,
        sha256_cert_fingerprints: fingerprints.map((f) => f.toUpperCase()),
      },
    },
  ]);
