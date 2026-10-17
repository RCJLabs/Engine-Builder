/**
 * The deploy check. A live version.json only proves the upload; this proves the page can start:
 * the page and every file it loads (scripts, styles, the manifest, icons), plus the service
 * worker, come from the site itself, answer OK, and arrive as the type their name says. A build
 * for the wrong base path passes the first check and fails this one, as does a host that answers
 * a missing script with an HTML page.
 */

const TAGS = /<(script|link)\b[^>]*>/gi;

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

/** Link relations whose target the browser fetches as part of the page. */
const FETCHED = new Set(['stylesheet', 'modulepreload', 'preload', 'manifest', 'icon', 'apple-touch-icon']);

/** The files a page's HTML loads: each script's src, and the href of each link the browser fetches. */
export function assetsOf(html: string, page: URL): URL[] {
  const found: URL[] = [];
  for (const [tag, kind] of html.matchAll(TAGS)) {
    let ref: string | null;
    if (kind?.toLowerCase() === 'script') {
      ref = attribute(tag, 'src');
    } else {
      const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
      ref = rel.some((r) => FETCHED.has(r)) ? attribute(tag, 'href') : null;
    }
    if (ref) found.push(new URL(ref, page));
  }
  return found;
}

/** What each extension's content type must contain. Files of other extensions only have to load. */
const TYPES: Readonly<Record<string, string>> = {
  js: 'javascript',
  mjs: 'javascript',
  css: 'text/css',
  webmanifest: 'json',
  json: 'json',
  svg: 'image/svg+xml',
  png: 'image/png',
};

async function problemWith(url: URL, fetchFile: typeof fetch): Promise<string | null> {
  const response = await fetchFile(url);
  await response.body?.cancel();
  if (!response.ok) return `answered ${response.status}`;
  const wanted = TYPES[url.pathname.split('.').pop()?.toLowerCase() ?? ''];
  const type = response.headers.get('content-type') ?? '';
  return wanted && !type.includes(wanted) ? `came as ${type || 'no type'}, not ${wanted}` : null;
}

export interface SiteReport {
  /** The paths checked, in the order the page names them, the service worker last. */
  readonly checked: string[];
  readonly failures: string[];
}

export async function checkSite(site: string, fetchFile: typeof fetch = fetch): Promise<SiteReport> {
  const root = new URL(site);
  if (!root.pathname.endsWith('/')) root.pathname += '/';
  // A query of its own, so a CDN can't answer with the page from before this deploy, whose
  // hashed scripts the deploy has removed.
  const page = await fetchFile(new URL(`?site-check=${Date.now()}`, root));
  if (!page.ok) return { checked: [root.pathname], failures: [`${root.href} answered ${page.status}`] };
  const checked: string[] = [];
  const failures: string[] = [];
  for (const url of [...assetsOf(await page.text(), root), new URL('sw.js', root)]) {
    checked.push(url.pathname);
    const problem = url.origin === root.origin ? await problemWith(url, fetchFile) : 'comes from another site';
    if (problem) failures.push(`${url.href} ${problem}`);
  }
  return { checked, failures };
}
