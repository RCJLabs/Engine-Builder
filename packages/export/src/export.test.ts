import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { hutPacks, hutSource, RUNTIME, SUMMIT_MAP, settingsOf } from '../test/hut.ts';
import { checkLeaks, engineTexts, exportGame, leakTokens, leakWords, scan, scriptJson } from './index.ts';
import { decodePng } from './png.ts';

const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

/** The boot JSON a page holds, parsed back. */
function bootOf(page: string): { edition: string; pack: { hash: string }; sw: boolean } {
  const found = /<script type="application\/json" id="eb-game">(.*?)<\/script>/s.exec(page);
  if (!found?.[1]) throw new Error('No #eb-game in the page');
  return JSON.parse(found[1]);
}

describe('the hut’s exports (M4.10)', async () => {
  const source = hutSource();
  const settings = await settingsOf(source);
  const packs = await hutPacks(source);
  const run = (target: 'web' | 'file' | 'itch' | 'repo', edition: string, more = {}) =>
    exportGame({
      target,
      settings,
      edition,
      pack: edition === 'full' ? packs.full : packs.edition,
      full: packs.full,
      runtime: RUNTIME,
      ...more,
    });

  it('web: the page, the runtime named by its content, the manifest, icons, version.json and sw.js', async () => {
    const web = await run('web', 'full');
    expect([...web.files.keys()].sort()).toEqual([
      '.well-known/assetlinks.json',
      'game.7ef913bf.js',
      'game.b4d5deb2.css',
      'icons/apple-touch-icon.png',
      'icons/favicon.png',
      'icons/icon-192.png',
      'icons/icon-512-maskable.png',
      'icons/icon-512.png',
      'index.html',
      'manifest.webmanifest',
      'sw.js',
      'version.json',
    ]);
    expect(web.name).toBe('the-hut-0.1.0-web.zip');
    const page = text(web.files.get('index.html'));
    expect(bootOf(page)).toEqual({ edition: 'full', pack: packs.full, sw: true });
    expect(page).toContain('<script type="module" src="game.7ef913bf.js"></script>');
    const version = JSON.parse(text(web.files.get('version.json')));
    expect(version).toEqual({ game: 'the-hut', edition: 'full', version: '0.1.0', build: web.build });
    expect(web.build).toMatch(/^[0-9a-f]{12}$/);
    const sw = text(web.files.get('sw.js'));
    expect(sw).toContain(`const CACHE = PREFIX + '${web.build}';`);
    expect(sw).toContain(
      'const FILES = ["./","game.7ef913bf.js","game.b4d5deb2.css","icons/apple-touch-icon.png","icons/favicon.png","icons/icon-192.png","icons/icon-512-maskable.png","icons/icon-512.png","index.html","manifest.webmanifest"];',
    );
    const manifest = JSON.parse(text(web.files.get('manifest.webmanifest')));
    expect(manifest).toMatchObject({
      id: './',
      start_url: './',
      scope: './',
      name: 'The hut',
      background_color: '#10161d',
    });
    expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual([
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/icon-512-maskable.png',
    ]);
    const links = JSON.parse(text(web.files.get('.well-known/assetlinks.json')));
    expect(links[0].target.package_name).toBe('com.rcjlabs.thehut');
    expect(web.leaks).toBeNull();
  });

  it('names the build by its files: the same files the same hash, one byte more a new one', async () => {
    const a = await run('web', 'full');
    const b = await run('web', 'full');
    expect(b.build).toBe(a.build);
    expect(b.bytes).toEqual(a.bytes);
    const changed = await run('web', 'full', { runtime: { ...RUNTIME, css: `${RUNTIME.css} ` } });
    expect(changed.build).not.toBe(a.build);
  });

  it('file: one page with the runtime, the pack and the favicon inside', async () => {
    const file = await run('file', 'taster');
    expect(file.name).toBe('the-hut-0.1.0-taster.html');
    expect([...file.files.keys()]).toEqual(['the-hut-0.1.0-taster.html']);
    const page = text(file.bytes);
    expect(page).toContain('<link rel="icon" href="data:image/png;base64,');
    expect(page).not.toContain('manifest.webmanifest');
    // The runtime's "</script" is broken inside the page, so only the page's own tags close.
    expect(page).toContain('if (a <\\/script>/.test(b))');
    expect(page.match(/<\/script>/g)?.length).toBe(2);
    expect(bootOf(page)).toEqual({ edition: 'taster', pack: packs.edition, sw: false });
    expect(file.ok).toBe(true);
  });

  it('itch: the page, the runtime and the favicon, with no service worker or manifest', async () => {
    const itch = await run('itch', 'taster');
    expect([...itch.files.keys()].sort()).toEqual([
      'game.7ef913bf.js',
      'game.b4d5deb2.css',
      'icons/favicon.png',
      'index.html',
    ]);
    expect(itch.name).toBe('the-hut-0.1.0-taster-itch.zip');
    expect(bootOf(text(itch.files.get('index.html'))).sw).toBe(false);
  });

  it('repo: site/, the workflows, the TWA files and the README, the workflows sound YAML', async () => {
    const repo = await run('repo', 'full');
    const paths = [...repo.files.keys()].sort();
    expect(paths.filter((p) => !p.startsWith('site/'))).toEqual([
      '.github/workflows/android.yml',
      '.github/workflows/pages.yml',
      'README.md',
      'twa-manifest.json',
      'twa/package.json',
    ]);
    expect(paths).toContain('site/.well-known/assetlinks.json');
    const pages = parseYaml(text(repo.files.get('.github/workflows/pages.yml')));
    expect(pages.jobs.deploy.steps[1].with).toEqual({ path: 'site', 'include-hidden-files': true });
    expect(pages.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false });
    expect(pages.jobs.confirm.steps[1].run).toContain('"com.rcjlabs.thehut"');
    const android = parseYaml(text(repo.files.get('.github/workflows/android.yml')));
    expect(android.on.workflow_dispatch.inputs.sign.default).toBe(true);
    expect(android.env.MIN_TARGET_SDK).toBe(36);
    const twa = JSON.parse(text(repo.files.get('twa-manifest.json')));
    expect(twa).toMatchObject({
      packageId: 'com.rcjlabs.thehut',
      host: 'hut.example.com',
      iconUrl: 'https://hut.example.com/icons/icon-512.png',
      appVersionName: '0.1.0',
      signingKey: { alias: 'upload' },
    });
    expect(JSON.parse(text(repo.files.get('twa/package.json'))).overrides).toEqual({ '@bubblewrap/core': '1.25.0' });
    expect(text(repo.files.get('README.md'))).toContain('Source to "GitHub Actions"');
  });

  it('repo without an Android app: no TWA files, and pages.yml checks no assetlinks', async () => {
    const plain = { ...settings, targets: { web: { edition: 'full' } } };
    const repo = await run('repo', 'full', { settings: plain });
    expect([...repo.files.keys()].filter((p) => !p.startsWith('site/')).sort()).toEqual([
      '.github/workflows/pages.yml',
      'README.md',
    ]);
    expect(text(repo.files.get('.github/workflows/pages.yml'))).not.toContain('assetlinks');
    expect(repo.files.has('site/.well-known/assetlinks.json')).toBe(false);
  });
});

describe('the leak check (M4.10)', async () => {
  const source = hutSource();
  const settings = await settingsOf(source);
  const packs = await hutPacks(source);

  it('finds nothing in a clean taster, and every thing it looks for in the full build', async () => {
    const file = await exportGame({
      target: 'file',
      settings,
      edition: 'taster',
      pack: packs.edition,
      full: packs.full,
      runtime: RUNTIME,
    });
    expect(file.ok).toBe(true);
    expect(file.leaks?.tokens.map((t) => `${t.kind} ${t.value}`)).toEqual([
      'id summit-map',
      'text A map of the summit',
      `text ${SUMMIT_MAP.description}`,
    ]);
    expect(file.leaks?.finds).toEqual([]);
    expect(file.leaks?.unseen).toEqual([]);
    expect(leakWords('taster', file.leaks as never)).toEqual([
      'The leak check read 1 file of the taster build for 3 things it leaves out: none there, and every one found in the full build.',
    ]);
  });

  it('finds the left-out map named in a script, and says where', async () => {
    const leaky = hutSource({
      'scripts/hut.ts': `${text(await source.read('scripts/hut.ts'))}\nexport const secret = 'summit-map';\n`,
    });
    const leakyPacks = await hutPacks(leaky);
    const web = await exportGame({
      target: 'web',
      settings,
      edition: 'taster',
      pack: leakyPacks.edition,
      full: leakyPacks.full,
      runtime: RUNTIME,
    });
    expect(web.ok).toBe(false);
    expect(web.leaks?.finds.map((f) => `${f.token.value} ${f.file}`)).toEqual(['summit-map index.html']);
    expect(leakWords('taster', web.leaks as never)[0]).toMatch(
      /^The taster build holds summit-map \(item:summit-map\) in index.html: ….*secret = 'summit-map'.*…$/,
    );
  });

  it('can’t vouch for what the full build doesn’t hold either: its control fails', async () => {
    const web = await exportGame({ target: 'web', settings, edition: 'full', pack: packs.full, runtime: RUNTIME });
    const nowhere = { kind: 'text', value: 'A line no record of the hut holds', from: 'item:nowhere' } as const;
    const report = checkLeaks(web.files, web.files, engineTexts(RUNTIME), [nowhere]);
    expect(report.finds).toEqual([]);
    expect(report.unseen).toEqual([nowhere]);
    expect(leakWords('taster', report)).toEqual([
      'The leak check can’t find A line no record of the hut holds (item:nowhere) in the full build, so it can’t vouch that the taster build lacks it.',
    ]);
  });

  it('drops what a kept record holds too, and takes the engine’s own text out before it reads', () => {
    const shared = 'Words that both records hold';
    const full = {
      records: {
        item: { 'summit-map': { name: 'A map of the summit', note: shared }, rope: { name: 'Rope', note: shared } },
      },
    };
    const tokens = leakTokens(full, { types: [], records: ['item:summit-map'], scenes: [], assets: [] });
    expect(tokens.map((t) => `${t.kind} ${t.value}`)).toEqual(['id summit-map', 'text A map of the summit']);
    const engine = 'const words = "summit-map";';
    const files = new Map([['game.js', new TextEncoder().encode(engine)]]);
    expect(scan(files, [engine], tokens)).toEqual([]);
    expect(scan(files, [], tokens).map((f) => f.token.value)).toEqual(['summit-map']);
  });

  it('won’t check an edition without the full game’s pack', async () => {
    await expect(
      exportGame({ target: 'file', settings, edition: 'taster', pack: packs.edition, runtime: RUNTIME }),
    ).rejects.toThrow('needs the full game’s pack');
  });
});

describe('the page’s boot JSON', () => {
  it('can’t end its tag, whatever a text in the pack says', () => {
    const nasty = '</script><script>alert(1)</script><!-- \u2028 & done';
    const written = scriptJson({ text: nasty });
    expect(written).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(written)).toEqual({ text: nasty });
  });
});

describe('icons', async () => {
  const source = hutSource();
  const settings = await settingsOf(source);
  const packs = await hutPacks(source);
  const web = await exportGame({ target: 'web', settings, edition: 'full', pack: packs.full, runtime: RUNTIME });

  it('come at their sizes, the maskable one full bleed and the others with clear corners', () => {
    const sizes = Object.fromEntries(
      [...web.files].filter(([p]) => p.endsWith('.png')).map(([p, bytes]) => [p, decodePng(bytes).width]),
    );
    expect(sizes).toEqual({
      'icons/apple-touch-icon.png': 180,
      'icons/favicon.png': 32,
      'icons/icon-192.png': 192,
      'icons/icon-512-maskable.png': 512,
      'icons/icon-512.png': 512,
    });
    const corner = (path: string) => decodePng(web.files.get(path) as Uint8Array).data[3];
    expect(corner('icons/icon-512.png')).toBe(0);
    expect(corner('icons/icon-512-maskable.png')).toBe(255);
  });
});
