/**
 * Each target's files (docs/specs/export.md#the-files-of-each-target), from the engine's runtime
 * and an edition's pack. Plain functions of their input: the same project, runtime and edition
 * give the same bytes in the editor and in eb export.
 */
import { type ExportJson, FULL } from '@eb/compiler';
import { buildHash, sha256, utf8 } from './hash.ts';
import { type Boot, gamePage, inlineScript, inlineStyle, WALK_ELEMENT } from './html.ts';
import { iconFiles, readIcon } from './icons.ts';
import type { PackContent } from './leaks.ts';
import { readme } from './readme.ts';
import { assetLinks, type GameInfo, versionJson, webManifest } from './site.ts';
import { cachedFiles, serviceWorker } from './sw.ts';
import { androidWorkflow, pagesWorkflow, twaManifest, twaPackageJson } from './workflows.ts';

/**
 * The engine's player for an exported game: apps/editor's game page, built (vite.game.config.ts),
 * and walk.js, the stage of a game with spaces (vite.walk.config.ts, M5.8).
 */
export interface Runtime {
  readonly version: string;
  readonly js: string;
  readonly css: string;
  readonly walk?: string;
}

/** A pack as the build reads it: its project, records and theme, and its world when it has spaces. */
export interface BuildPack extends PackContent {
  readonly project: { readonly id: string; readonly name: string; readonly version: string };
  readonly ui?: { readonly theme?: unknown };
  readonly world?: unknown;
}

export interface BuildInput {
  readonly settings: ExportJson | undefined;
  readonly edition: string;
  readonly pack: BuildPack;
  readonly runtime: Runtime;
  /** export.json's icon, read from assets/. */
  readonly icon?: Uint8Array;
}

export type Files = Map<string, Uint8Array>;

const COLOUR = /^#[0-9a-fA-F]{6}$/;

function themeColour(pack: BuildPack, name: string): string | undefined {
  const colours = (pack.ui?.theme as { colors?: Record<string, unknown> } | undefined)?.colors;
  const value = colours?.[name];
  return typeof value === 'string' && COLOUR.test(value) ? value : undefined;
}

/** The game's names and colours: export.json's, else the project's and its theme's. */
export function gameInfo({ settings, pack }: Pick<BuildInput, 'settings' | 'pack'>): GameInfo & { accent: string } {
  const name = settings?.name ?? pack.project.name;
  const background = settings?.colors?.background ?? themeColour(pack, 'background') ?? '#10161d';
  return {
    game: pack.project.id,
    name,
    shortName: settings?.['short-name'] ?? name,
    ...(settings?.description ? { description: settings.description } : {}),
    version: pack.project.version,
    orientation: settings?.orientation ?? 'any',
    background,
    theme: settings?.colors?.theme ?? background,
    accent: themeColour(pack, 'accent') ?? '#f4b860',
  };
}

/** Whether a "#rrggbb" colour is dark, by its relative luminance (WCAG's weights, without gamma). */
const isDark = (colour: string): boolean => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(colour.slice(i, i + 2), 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
};

const boot = (input: BuildInput, sw: boolean, walk?: string): Boot => ({
  edition: input.edition,
  pack: input.pack,
  sw,
  ...(walk === undefined ? {} : { walk }),
});

/** walk.js for a game with spaces, none for one without; a runtime built without it can't export one. */
function walkOf(input: BuildInput): string | undefined {
  if (input.pack.world === undefined) return undefined;
  if (input.runtime.walk === undefined) {
    throw new Error(
      'This game has spaces, and the runtime it is exported with has no walk.js: build it with the editor',
    );
  }
  return input.runtime.walk;
}

/** The runtime's files, named by their content so a browser never pairs an old script with a new page. */
async function runtimeNames(
  runtime: Runtime,
  walk: string | undefined,
): Promise<{ js: string; css: string; walk?: string }> {
  const named = async (text: string, name: string, ext: string) =>
    `${name}.${(await sha256(utf8.encode(text))).slice(0, 8)}.${ext}`;
  return {
    js: await named(runtime.js, 'game', 'js'),
    css: await named(runtime.css, 'game', 'css'),
    ...(walk === undefined ? {} : { walk: await named(walk, 'walk', 'js') }),
  };
}

/** The engine's own texts as each target holds them: what the leak check takes out before it reads. */
export const engineTexts = (runtime: Runtime): string[] => [
  runtime.js,
  runtime.css,
  inlineScript(runtime.js),
  inlineStyle(runtime.css),
  ...(runtime.walk === undefined ? [] : [runtime.walk, inlineScript(runtime.walk)]),
];

function icons(input: BuildInput) {
  const info = gameInfo(input);
  return iconFiles(input.icon ? readIcon(input.icon) : undefined, info);
}

/** The web build: installable, offline after its first visit, with its service worker and version.json. */
export async function webFiles(input: BuildInput): Promise<Files> {
  const info = gameInfo(input);
  const walk = walkOf(input);
  const names = await runtimeNames(input.runtime, walk);
  const files: Files = new Map();
  const page = gamePage({
    title: info.name,
    ...(info.description ? { description: info.description } : {}),
    themeColour: info.theme,
    dark: isDark(info.background),
    boot: boot(input, true, names.walk),
    runtime: names,
    favicon: 'icons/favicon.png',
    installable: true,
  });
  files.set('index.html', utf8.encode(page));
  files.set(names.js, utf8.encode(input.runtime.js));
  files.set(names.css, utf8.encode(input.runtime.css));
  if (walk !== undefined && names.walk) files.set(names.walk, utf8.encode(walk));
  files.set('manifest.webmanifest', utf8.encode(webManifest(info)));
  for (const [path, bytes] of icons(input)) files.set(path, bytes);
  const android = input.settings?.targets?.android;
  if (android && (android.fingerprints ?? []).length > 0) {
    files.set('.well-known/assetlinks.json', utf8.encode(assetLinks(android.package, android.fingerprints ?? [])));
  }
  const build = await buildHash(files);
  files.set('version.json', utf8.encode(versionJson(info, input.edition, build)));
  files.set('sw.js', utf8.encode(serviceWorker({ game: info.game, build, files: cachedFiles(files.keys()) })));
  return files;
}

/** The itch.io build: relative paths, no service worker or manifest, since itch serves every game from one origin. */
export async function itchFiles(input: BuildInput): Promise<Files> {
  const info = gameInfo(input);
  const walk = walkOf(input);
  const names = await runtimeNames(input.runtime, walk);
  const page = gamePage({
    title: info.name,
    ...(info.description ? { description: info.description } : {}),
    themeColour: info.theme,
    dark: isDark(info.background),
    boot: boot(input, false, names.walk),
    runtime: names,
    favicon: 'icons/favicon.png',
    installable: false,
  });
  return new Map([
    ['index.html', utf8.encode(page)],
    [names.js, utf8.encode(input.runtime.js)],
    [names.css, utf8.encode(input.runtime.css)],
    ...(walk !== undefined && names.walk ? [[names.walk, utf8.encode(walk)] as [string, Uint8Array]] : []),
    ['icons/favicon.png', icons(input).get('icons/favicon.png') as Uint8Array],
  ]);
}

const base64 = (bytes: Uint8Array): string => {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
};

/** One HTML file that plays from the device's files: the runtime, walk.js, the pack and the favicon inside it. */
export function singleFile(input: BuildInput): { readonly name: string; readonly bytes: Uint8Array } {
  const info = gameInfo(input);
  const favicon = icons(input).get('icons/favicon.png') as Uint8Array;
  const walk = walkOf(input);
  const page = gamePage({
    title: info.name,
    ...(info.description ? { description: info.description } : {}),
    themeColour: info.theme,
    dark: isDark(info.background),
    boot: boot(input, false, walk === undefined ? undefined : `#${WALK_ELEMENT}`),
    runtime: { inline: { js: input.runtime.js, css: input.runtime.css } },
    ...(walk === undefined ? {} : { walk }),
    favicon: `data:image/png;base64,${base64(favicon)}`,
    installable: false,
  });
  const edition = input.edition === FULL ? '' : `-${input.edition}`;
  return { name: `${info.game}-${info.version}${edition}.html`, bytes: utf8.encode(page) };
}

/** The repository Publish writes: the web build under site/, its workflows, and the README. */
export async function repoFiles(input: BuildInput): Promise<Files> {
  const info = gameInfo(input);
  const files: Files = new Map();
  for (const [path, bytes] of await webFiles(input)) files.set(`site/${path}`, bytes);
  const targets = input.settings?.targets;
  const android =
    targets?.android && targets.web?.domain ? { ...targets.android, domain: targets.web.domain } : undefined;
  files.set(
    '.github/workflows/pages.yml',
    utf8.encode(pagesWorkflow({ name: info.name, ...(android ? { androidPackage: android.package } : {}) })),
  );
  if (android) {
    files.set('.github/workflows/android.yml', utf8.encode(androidWorkflow({ name: info.name, game: info.game })));
    files.set(
      'twa-manifest.json',
      utf8.encode(
        twaManifest({
          name: info.name,
          shortName: info.shortName,
          domain: android.domain,
          package: android.package,
          version: info.version,
          orientation: info.orientation,
          background: info.background,
          theme: info.theme,
        }),
      ),
    );
    files.set('twa/package.json', utf8.encode(twaPackageJson(info.game)));
  }
  files.set(
    'README.md',
    utf8.encode(
      readme({
        name: info.name,
        version: info.version,
        ...(targets?.web?.domain ? { domain: targets.web.domain } : {}),
        ...(android ? { android: { package: android.package, signed: (android.fingerprints ?? []).length > 0 } } : {}),
      }),
    ),
  );
  return files;
}
