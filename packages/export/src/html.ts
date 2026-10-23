/**
 * The page an exported game opens on (docs/specs/export.md#the-runtime): the engine's runtime
 * (game.js, game.css) and the boot JSON in `#eb-game`, which names the edition and holds the pack.
 * Every text put inside a tag is escaped so nothing in it can end the tag early.
 */

/** What the runtime reads from `#eb-game`. */
export interface Boot {
  readonly edition: string;
  readonly pack: unknown;
  /** Register ./sw.js: the web build's page, served over HTTP(S). */
  readonly sw: boolean;
}

/**
 * JSON safe inside a script tag: `<`, `>` and `&` as \u escapes, so no "</script>" or "<!--" can
 * appear, and U+2028 and U+2029, which old engines took as line ends inside a string.
 */
export const scriptJson = (value: unknown): string =>
  JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/**
 * A script's text inside an inline script tag: `</script` broken, which JavaScript reads the same
 * in a string or a regex. A `<!--` would put the HTML parser in a state where a later `<script`
 * keeps the tag open past its end; no escape is safe in every part of JavaScript, so a runtime
 * with one is refused.
 */
export function inlineScript(js: string): string {
  if (js.includes('<!--')) throw new Error('The runtime holds "<!--", so it can’t sit inside a single page');
  return js.replace(/<\/(script)/gi, '<\\/$1');
}

/** A stylesheet's text inside a style tag. */
export const inlineStyle = (css: string): string => css.replace(/<\/(style)/gi, '<\\/$1');

const attr = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const text = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface PageParts {
  readonly title: string;
  readonly description?: string;
  readonly themeColour: string;
  readonly dark: boolean;
  readonly boot: Boot;
  /** The runtime as files beside the page, or inside it. */
  readonly runtime: { readonly js: string; readonly css: string } | { readonly inline: { js: string; css: string } };
  /** The favicon: a path beside the page, or a data URL. */
  readonly favicon: string;
  /** The web build's: the manifest and the Apple icon. */
  readonly installable: boolean;
}

/** The page. Parts are joined, never put in with String.replace, whose "$&" would read a pattern. */
export function gamePage(parts: PageParts): string {
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<meta name="theme-color" content="${attr(parts.themeColour)}">`,
    `<meta name="color-scheme" content="${parts.dark ? 'dark' : 'light'}">`,
    ...(parts.description ? [`<meta name="description" content="${attr(parts.description)}">`] : []),
    `<title>${text(parts.title)}</title>`,
    `<link rel="icon" href="${attr(parts.favicon)}" type="image/png">`,
    ...(parts.installable
      ? [
          '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
          '<link rel="manifest" href="manifest.webmanifest">',
        ]
      : []),
    ...('inline' in parts.runtime
      ? [
          `<style>${inlineStyle(parts.runtime.inline.css)}</style>`,
          `<script type="module">${inlineScript(parts.runtime.inline.js)}</script>`,
        ]
      : [
          `<link rel="stylesheet" href="${attr(parts.runtime.css)}">`,
          `<script type="module" src="${attr(parts.runtime.js)}"></script>`,
        ]),
  ];
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    ...head,
    '</head>',
    '<body>',
    '<main id="game"></main>',
    `<noscript>${text(parts.title)} needs JavaScript.</noscript>`,
    // After the page's script, which as a module runs only once the page is read, this included.
    `<script type="application/json" id="eb-game">${scriptJson(parts.boot)}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
