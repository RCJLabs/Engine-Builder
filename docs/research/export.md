# How the games we have ship (M4.10)

A survey of how Evan's browser games build, cache, version and publish themselves, read for M4.10, Export ([D60](../decisions.md)). It records what the code does, with where; what we infer from it is marked as such. Paths are inside each game's repository. No game's story is quoted.

## Targets

- **Chooser of the Dead names its builds** in one file, `packages/content-schema/src/targets.ts`: eight targets, each with an edition, its packs, a platform, whether it is a PWA, its base (`pages`, `relative` or `root`), whether it carries the labs, its storage namespace and its app names. `vite build --mode <target>` builds one; an unknown target throws (`apps/web/vite.config.ts`). Targets without a PWA get a do-nothing `virtual:pwa-register`.
- **Dirtbag** builds by Vite mode (`demo`, `gated`) and wraps the site for Play with Bubblewrap in CI (`twa-manifest.json`, `.github/workflows/build-twa.yml`).
- **A single HTML file:**
  - 2060td's `scripts/single-file.mjs` inlines the build and asserts no `./assets` link is left.
  - Sandbagged's `scripts/build-html.mjs` inlines with function replacers, because a replacement string's `$&` would otherwise be read as a pattern, and then extracts the script back out and runs `node --check` on it.
  - Landnam uses `vite-plugin-singlefile` and a release allowlist; Ludus its own `build.js`.
- **itch.io:** Chooser deploys with butler (`deploy-itch.yml`), within itch's limits of 1,000 files and 500 MB; 2060td builds with base `./` so the zip plays from any folder.

## Editions

- **Chooser keeps the campaign out of the demo by its packs** (`compile.ts`, `ALLOWED_PACK_DEPS`) and checks the built bytes after (`tools/leak-check/scan.ts`, `cli.ts`):
  - a demo build fails on the campaign's canary string, on any of its ids as quoted literals, and on any `.map` file;
  - a full build must contain the canary, so the scan is seen to work;
  - the labs' marker must appear only in builds that carry the labs.
- **Dirtbag swaps whole modules:** each `*.full.ts` has a `*.demo.ts` twin that the demo build takes instead (`app/build/demo.ts`). `app/harness/demo.diff.ts` scans `dist-demo` for full-only strings: any of 25 characters or more anywhere, shorter ones as quoted literals. Each group of strings must be non-empty, as its control.
- **Storage namespaces:** Chooser's playtest builds save under their own namespace, since every itch game shares one origin; Dirtbag's demo keeps `dirtbag.demo.` keys apart from the full game's `dirtbag.`.

## Service workers

- **A cache named by a hash of the build:**
  - Dirtbag names its cache `dirtbag-app-` and 10 hex characters of SHA-256 over the sorted file names and bytes (`app/build/pwa.ts`).
  - Space-Wrecked uses `wt-<hash>`, written by a pre-commit hook; its Pages workflow fails if the hash is stale (`tools/precache.js`). Spliceworld does the same in `tools/release.js`.
- **Deleting only its own caches:** Rule or Drool (`public/sw.js:11-16`, on the shared rcjlabs.github.io origin), Space-Wrecked and Dirtbag delete only caches with their own prefix, and Space-Wrecked answers only requests inside its registration's scope. FMS (`sw.js:23`), Spliceworld (`sw.js:229`), Ludus, Sandbagged, Wasteland Protocol and 2060td delete every other cache. (Inferred:) on rcjlabs.github.io, those wipe each other's caches.
- **Bugs met and fixed:**
  - An install read stale files from the HTTP cache (Pages serves `max-age=600`). The fix is `cache: 'reload'` (Space-Wrecked `sw.js:263`, Sandbagged DEV-2, Spliceworld R122b).
  - Only responses that are ok, same-origin (`basic`) and not redirected should be cached (Sandbagged, Afterglass's `good()`, Spliceworld, FMS).
  - Chunks needed on the first visit can be missing. 2060td reads `index.html` at install; Wasteland Protocol's page posts its asset list.
  - Network-first was slow on a poor connection (Spliceworld R100), so it moved to cache-first with revalidation; Afterglass gives the network 3 s.
  - The navigation fallback answered `/.well-known/assetlinks.json` with the page, which broke the Play app's domain check (project-ascent `vite.config.ts`, M12).
  - "Update now" did nothing on the first launch after an install (project-ascent `src/lib/swUpdate.ts`, M302; ported as the editor's `applyUpdate.ts`).
  - An installed app never checked for updates. The fix is `registration.update()` when the page becomes visible, and every 6 hours (project-ascent M154).
  - The base path broke after a repository was renamed (Chooser `docs/tech-spec.md` §64).
- **How an update is offered:**
  - Chooser and project-ascent prompt, never mid-session. project-ascent's `src/engine/offline.ts` puts "later" off for 24 hours. who-am-i-, Space-Wrecked and Rule or Drool skip waiting when the player taps.
  - A page reloads on `controllerchange` only if a controller existed before. Sandbagged (DEV-7) also waits until the game isn't busy.

## version.json

- **Dirtbag** writes `{ version, commit }` (`scripts/stage-site.mjs`). The deploy's confirm job polls `version.json?$GITHUB_SHA` until it serves the commit, then checks `service-worker.js` and `assetlinks.json` and runs a smoke test.
- **Afterglass** writes `{ build, channel }` (`tools/site.mjs`). The page fetches it with `no-store` on open, on becoming visible and every 30 minutes, then shows a toast and reloads after saving (`src/page/screen.js`).
- **Landnam** writes `build.txt` and checks it in `src/freshness.ts`, never on `file://`.

## Icons

- **Drawn at build time, nothing binary committed:**
  - Dirtbag's `app/build/pwa.ts` supersamples 4×4, encodes PNG through zlib, keeps the maskable icon's art in the middle 80%, and wraps a PNG as `favicon.ico`.
  - project-ascent has `scripts/gen-icons.mjs`; Space-Wrecked has `tools/icons.js`, over a strict SVG subset.
  - Chooser renders through headless Chromium (`tools/icons/make-icons.ts`), as the editor's own `scripts/icons.ts` does.
- **Sizes:** 192, 512 and maskable 512, with maskable 192 and a 32 px favicon in some.
- **The manifest's `id` is load-bearing:** Dirtbag's `scripts/check.mjs` requires `id: '/'` and `scope: './'`. Sandbagged had to take its id from the homepage after a case mismatch in release 42.

## Workflows

- **Pages through Actions:**
  - `concurrency: pages` without cancelling;
  - `include-hidden-files: true` on `upload-pages-artifact` v4 and later, or `.well-known` is dropped (Dirtbag `deploy.yml:84`, project-ascent `deploy.yml:84-89`);
  - the `github-pages` environment deploys from the default branch only;
  - a confirm job checks the live site: Dirtbag's above, Chooser's fetching each page and its first script, project-ascent's `live` job.
- **Play (TWA), Dirtbag's `build-twa.yml`:**
  - JDK 17, and `setup-android` with `platform-tools` only, since the legacy `tools` package is gone;
  - Bubblewrap pinned by `twa/package-lock.json`, with core, which owns the Android template;
  - `~/.bubblewrap/config.json` pointing at the runner's JDK and SDK;
  - the version code from the clock;
  - `bubblewrap update --skipVersionUpgrade`, which fetches the icons from the live site, so the site deploys first;
  - a check that `targetSdkVersion` is at least 36, then `gradlew bundleRelease` and `jarsigner`;
  - the bundle uploaded as an artifact, and the upload to Play done by hand.
- **Publish to GitHub:** no game has one.

## Store and signing

- **The papers:** Dirtbag's `docs/STORE.md` (`check.mjs` holds its text to 80, 4,000 and 500 characters), `PAPERWORK.md`, and its privacy and terms pages; Rule or Drool's `twa/STORE.md`.
- **Secrets:** `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_PASSWORD` (Dirtbag's `build-twa.yml`).
- **assetlinks.json must carry the app signing key's fingerprint:**
  - Sandbagged refuses a placeholder; project-ascent ships `[]` with a test.
  - Dirtbag's `check.mjs` asserts the TWA's host equals `CNAME` and that assetlinks names the package.
  - Rule or Drool notes that a site under `rcjlabs.github.io/<repo>/` can't serve assetlinks at the origin's root, so a TWA needs its own domain.
- **Package ids in use:** `io.github.rcjlabs.dirtbag` (published), `io.github.rcjlabs.ruleordrool`, `com.rcjlabs.projectascent`, `com.rcjlabs.sandbagged`, `com.rcjlabs.spliceworld`, and `com.rcjlabs.chooseroftheslain` (Electron's appId).
- **A conflict, not checked:** Rule or Drool's `twa/README.md` says Bubblewrap 1.25.0 reads `appVersion`, not `appVersionName`. The others write `appVersionName`, and Dirtbag ships on Play with it.

## Open questions

1. **Is `appVersion` or `appVersionName` the key Bubblewrap 1.25 reads?** The engine writes `appVersionName`, as Dirtbag does. The first engine-built bundle uploaded to Play settles it.
2. **Do blob workers, IndexedDB and `new Function` work from `file://` on every browser?** They work in Chromium (a spike on 2026-10-23, Playwright 1.56.1); Firefox and Safari aren't checked.
