# Export (M4.10, D60)

A project exports to four targets: a web build that installs and plays offline, a single HTML file, an itch.io zip, and an Android app built by a GitHub workflow. Editions leave content out of a target, and a leak check reads every built file for it. Publish to GitHub writes a repository, ready to push, that deploys the web build to Pages. The survey behind it is [research/export.md](../research/export.md).

The editor makes no network call in any of this, and an exported game makes none of its own.

## export.json

A project's targets and editions are in `export.json`, at its root beside `project.json`. A project without it exports the full game to the web, file and itch targets, with its name and theme.

```json
{
  "name": "The hut",
  "short-name": "The hut",
  "description": "A season above the tree line.",
  "icon": "art/icon.png",
  "orientation": "any",
  "colors": { "background": "#10161d", "theme": "#10161d" },
  "editions": {
    "taster": { "leave-out": { "records": ["item:summit-map"], "types": [], "scenes": [], "assets": [] } }
  },
  "targets": {
    "web": { "edition": "full", "domain": "hut.example.com" },
    "file": { "edition": "taster" },
    "itch": { "edition": "taster" },
    "android": { "package": "com.rcjlabs.thehut", "fingerprints": ["14:6D:…:2B"] }
  }
}
```

Every key is optional.

| Key | What it is | Without it |
| --- | --- | --- |
| `name` | the game's name, on the title, the tab and the launcher | project.json's name |
| `short-name` | the name under an installed icon | the name |
| `description` | the web manifest's description | none |
| `icon` | an asset: a square PNG of at least 512 px | a drawn icon in the theme's colours |
| `orientation` | `any`, `portrait` or `landscape`, for the installed app | `any` |
| `colors.background`, `colors.theme` | the splash screen's and the browser bar's colours | ui/theme.json's background, else `#10161d` |
| `editions` | each edition's leave-out lists, by id | the full game only |
| `targets.web`, `.file`, `.itch` | the edition each target ships; the web target's `domain` | the full game, at any address |
| `targets.android` | the app's `package` id and its signing keys' `fingerprints` | no Android app |

### Editions

- **An edition is a game less what it leaves out:**
  - `records`, each as `type:id`;
  - `types`, every record of the type and, for a project's own type, its type file;
  - `scenes`, ink scenes by id, which is the same as leaving out `talk:<id>`;
  - `assets`, by path under assets/, with their lines in the provenance log.
- **`full` is the game with nothing left out.** It is always there, and no edition may take its name.
- **Ids** are kebab-case, like records'. An edition's id also names its saves' storage (`eb/<game>/<edition>/`, M1.8), so a taster and the full game on one site, or in one folder of files, keep their saves apart.
- **Leaving out never changes what is kept.** A kept record that names a left-out one is an error (E055), not a reference quietly dropped. Content written for an edition's end, such as a last card or a talk that doesn't offer the next quest, is made as its own records, and the full game leaves nothing out. Swapping a record for an edition's own is open question 1.

### Targets

- **web** builds a folder to serve over HTTPS from any path. It installs as an app and plays offline after its first visit.
  - `domain` is the host it is served at, with no scheme or path (`hut.example.com`).
  - A web build with a domain sits at that domain's root, and only it can carry an Android app, whose link to the site lives at `/.well-known/assetlinks.json`.
  - Without a domain, Pages serves it at `https://<owner>.github.io/<repository>/`.
- **file** builds one HTML file that plays from the device's files, opened in a browser with no server.
- **itch** builds a zip with `index.html` at its root, for itch.io's HTML games. Its paths are relative, and it has no service worker, since itch serves every game from one origin.
- **android** builds the Android app around the web build, as a GitHub workflow that Publish writes (D60). The editor can't build it: Bubblewrap, a JDK and the Android SDK don't run in a browser.
  - `package` is the app's id on Play. Engine-built apps take `com.rcjlabs.<game>`, its id without hyphens (D60); a published app keeps its own (Dirtbag's `io.github.rcjlabs.dirtbag`).
  - `fingerprints` are the SHA-256 fingerprints of the keys the app is signed with: Play's app signing key, and the upload key for builds installed outside Play. Without one the site's assetlinks.json can't vouch for the app, and it opens with a browser bar (W139).

### Checks

Checked whenever the project is, so they show in Problems as they are made (`checkExport`, packages/compiler/src/exportCheck.ts).

| Code | When |
| --- | --- |
| E055 | A record an edition keeps names one it leaves out, from the record index's used-by. It is reported at the naming field, once for each edition. |
| E056 | export.json is malformed, or names something that isn't there: an edition named `full`, or whose name isn't an id; a leave-out naming no type, record, scene or asset; the icon left out; a target naming no edition; an icon that isn't a PNG asset; a domain that isn't a host name; an Android target without a web domain, or with a package id that isn't one. |
| W138 | The short name is over 12 characters, which launchers cut. |
| W139 | The Android target has no fingerprints. |

E055 sees what records name. A screen, the feedback or a script naming left-out content is caught when the edition is built: as an error of the edition's own compile, or by the leak check.

## Building an edition

1. **The full game is compiled,** as Play compiles it (with the game's scripts run). With any error, nothing is exported.
2. **The edition is compiled from the same files less what it leaves out** (`editionSource`), so its pack is the pack of a project that never had them. Its errors stop the export and are listed with the edition's name.
3. **The target's files are made** from the engine's runtime and the edition's pack (below).
4. **The leak check reads every file made** (below). A full edition has nothing to look for.

The same steps run in the editor, where the Play worker compiles, and in `eb export`, where Node does. The same files give the same bytes in both.

## The runtime

The engine's player for an exported game is built once with the editor (`apps/editor/src/game/`, `vite.game.config.ts`) into `apps/editor/dist-game/`:

- `index.html`, with an empty `<script type="application/json" id="eb-game">`;
- `game.js`, every script the page needs, the game's worker inlined;
- `game.css`;
- `files.json`, which lists them with the engine's version.

The editor's build copies them to `runtime/`, which its service worker keeps, so the editor exports offline. `eb export` reads `apps/editor/dist-game/`, or the folder `--runtime` names.

**The page boots from `#eb-game`:** `{ "edition", "pack", "sw" }`, and draws the game in `main#game`, the game's name its heading for screen readers.
- It plays the pack inside the play shell (M4.3), with its saves under the edition's id.
- Its worker is made from the script's own text, through a blob URL, so it starts from `file://` too. The game's scripts run in it, locked down, as on the player page.
- With `sw` true and the page served over HTTP(S), it registers `./sw.js`.
- The JSON is written with `<`, `>`, `&`, U+2028 and U+2029 as `\u` escapes, so no text in the pack can end the script tag.

## The files of each target

| File | web | file | itch |
| --- | --- | --- | --- |
| `index.html`: the runtime's, with `#eb-game` filled | yes | as `<game>-<version>[-<edition>].html`, with `game.js` and `game.css` inside | yes |
| `game.<hash>.js`, `game.<hash>.css`, named by 8 hex characters of their SHA-256 | yes | | yes |
| `manifest.webmanifest` | yes | | |
| `icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` (180), `favicon.png` (32) | yes | the favicon, as a data URL | the favicon |
| `sw.js` | yes | | |
| `version.json` | yes | | |
| `.well-known/assetlinks.json` | with an Android target that has fingerprints | | |

**The build's hash** is the first 12 hex characters of SHA-256 over every file but `sw.js` and `version.json`, each as its path, a zero byte, and its bytes, in path order. It names the build in `version.json` and in the service worker's cache, so a build that changes anything changes both.

**version.json** is `{ "game", "edition", "version", "build" }`. The service worker never caches it, so the Pages workflow can read which build the live site serves.

**The web manifest:**
- `id`, `start_url` and `scope` are `./`, so the app is the same app at any path;
- `display` is `standalone`, and `orientation` is export.json's;
- the name, short name, description and colours are export.json's;
- the icons are the five above, the maskable one marked `maskable`.

### Icons

Drawn by the engine's own PNG code (packages/export/src/png.ts), the same bytes in the browser and in Node.

- **From export.json's icon:** a PNG, 8 bits a channel, not interlaced, at least 512 px and square. It is scaled down by averaging, its alpha premultiplied.
  - The maskable and Apple icons put it on the background colour, full bleed, its art inside the middle 80% (the maskable safe zone).
  - Any other PNG is refused at export with what to save it as.
- **Without one:** a rounded square in the theme colour, with a ring and a dot in the theme's accent (ui/theme.json's `accent`), drawn at four samples a side; full bleed on the background colour for the maskable and Apple icons. Phase 10's icon painter (M10.2) will make better ones.

### The service worker

`sw.js`, written for each build:

- **Its caches are its own.** Each is named `eb <scope> <build>`, where scope is the registration's scope URL. On activating, it deletes only caches named `eb <scope> ` and another build. Other games on the same origin keep theirs (rcjlabs.github.io holds many).
- **Install** fetches every file of the build, `./` among them, with `cache: 'reload'`, past the HTTP cache. It keeps a response only if it is ok, same-origin and not redirected. Any other fails the install, and the old build stays.
- **It waits.** A new build installs beside the old one and takes over only when the player chooses it: the shell offers "Reload to update" on the title, never in play (shell.md). The first build of all takes over at once.
- **Fetch** answers only GET requests inside its scope:
  - `version.json` and `/.well-known/` always go to the network;
  - everything else comes from the cache first, with the network after;
  - a navigation the cache doesn't hold gets `index.html`, except under `/.well-known/`.
- **Looking for a new build:** the page asks for one when it opens, when it becomes visible, and every 6 hours while visible (project-ascent M154).
- **Applying it:** the page messages the waiting worker to skip waiting, then reloads once it controls the page. The editor's `applyUpdate` does it, with its handover for a page opened before any worker (project-ascent M302).

## The leak check

It reads every file of an edition's build for what the edition leaves out, after it is made and before anything is written (packages/export/src/leaks.ts).

**What it looks for**, taken from the full game's pack:
- each left-out record's id, as a string by itself: inside `"…"`, `'…'` or a backtick, or after `type:`;
- each string of 12 characters or more in a left-out record, anywhere;
- each left-out asset's path that the full pack holds, as a music stem or a credit, anywhere.

Something a kept record also holds is dropped from the list, since it is in the edition by right: the same id, or a text that is part of a kept record's text.

**Where it looks:** every file of the build, as text, with the runtime's own `game.js` and `game.css` taken out first. They are the engine, the same in every edition, and hold no project content. PNGs aren't read.

**Its control:** the same scan over the full game's build, made alongside, must find everything on the list. Anything it can't find fails the export: then the check can't see that thing, so it can't vouch that the edition lacks it. This is the full build's marker (D60), one for each thing looked for.

**A find fails the export** and names the thing, what it came from (`item:summit-map`), the file, and the text around it.

## Publish to GitHub

Publish writes a zip of a repository, ready to push (D60). Unzipped into an empty repository, pushed, with Pages set to deploy from Actions, it deploys the web build.

- `site/`: the web build;
- `.github/workflows/pages.yml`: deploys site/ to Pages on every push to `main`, and from the Actions tab;
- `README.md`: the three steps, and the Android steps when there is an Android app;
- with an Android target: `.github/workflows/android.yml`, `twa-manifest.json` and `twa/package.json`.

**pages.yml:**
- one job uploads `site/` with `include-hidden-files: true`, so `.well-known` goes too, and deploys it, in the `pages` concurrency group without cancelling;
- a confirm job reads `version.json` from the deployed URL until its build is the pushed `site/version.json`'s, for up to five minutes. It then checks that `sw.js` is served and, with an Android app, that `/.well-known/assetlinks.json` names the package.

**android.yml**, run from the Actions tab, from Dirtbag's `build-twa.yml`:
- JDK 17, the Android SDK's platform-tools, and Bubblewrap 1.25.0 from `twa/package.json`, whose override pins `@bubblewrap/core` too, since core owns the Android template;
- the version code from the clock (minutes since November 2023), and the version name from project.json;
- `bubblewrap update --skipVersionUpgrade`, which fetches the icons from the live site, so the web build is deployed first;
- the check that `targetSdkVersion` is at least 36 (Play's floor since 31 August 2026);
- `gradlew bundleRelease`, signed with `jarsigner` from the secrets `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD` and `KEY_PASSWORD`, under the key alias `upload`;
- the bundle as an artifact. The upload to Play stays by hand.

**twa-manifest.json** follows Dirtbag's. Its host is the web target's domain, its icons that site's, and its orientation locked unless export.json says `any`.

### eb publish

`eb publish <project> --repo <folder> [--message <text>] [--push]` builds the same files into a git working tree and commits them with your own git. It:
- replaces `site/` and the workflows and TWA files it writes;
- writes README.md only if there is none;
- stages only what it wrote, and commits;
- pushes with `--push`.

It never touches other files. A folder that isn't a git working tree is refused.

## The editor

The Project panel's **Export** section, loaded when opened:
- **Set up export** writes a starting export.json: the three targets, each the full game.
- export.json as a form, drawn by the record form from its fields as a type file (`exportFile.ts`), as the calendar is (M3.5). The editions offered and the types to leave out come from the project.
- One button for each target: **Export web** (a zip of the folder), **Export file**, **Export for itch.io** (the zip), and **Publish to GitHub** (the repository's zip).
- Each export runs the game's scripts, as Play does, so they must be allowed to run. It reports what it wrote: the file, its size, the build, and the leak check in words.

The export's steps run in the Play worker, which compiles, and on the page, which builds the files.

## eb export

`eb export <project> --target web|file|itch|repo [--out <path>] [--edition <id>] [--runtime <folder>]`
- web writes a folder; file an HTML file; itch and repo a zip.
- `--edition` overrides the target's own edition.
- It plays the project's own game, `scripts/game.ts`, as Play does, so it takes no `--types`.
- The exit codes are eb's: 1 for the project's errors or a leak, 2 for bad arguments or a missing runtime.

## Checks of this milestone

- **compiler:**
  - export.json's shape and sense (E056) and W138, W139;
  - E055 at the naming field, for each edition;
  - `editionSource` hides each kind of thing left out, and the log's lines for left-out assets.
- **export:**
  - each target's files for the hut;
  - the build hash the same for the same files, and different when one byte changes;
  - the service worker's file list and cache name;
  - the manifest;
  - icons that decode back to their sizes;
  - an icon PNG that isn't 8-bit, square or 512 px, refused;
  - the leak check finding a left-out id in a script, finding nothing in a clean edition, and its control failing when a thing can't be found in the full build;
  - the workflows parsed as YAML, naming the package and the domain;
  - the `</script>` escape.
- **cli:**
  - eb export to each target;
  - eb publish into a git repository, committing, and pushing to a bare one.
- **e2e, the gate:** the hut in the editor, on desktop (`export.spec.ts`) and by touch at 360, 390 and 844×390 (`exportPhone.spec.ts`):
  - export.json set up with a taster that leaves out a map of the summit, and E055 in Problems while it also leaves out the rope the store stocks;
  - the file played from `file://`: a new game, a step, a reload, Continue;
  - the itch zip served from a folder path and played;
  - the web build served:
    - its service worker controls the page;
    - offline, it reloads and plays;
    - a new version served is offered on the title, and taken;
  - Publish's zip holds the workflows and site/, and the Android files with the domain and package;
  - a script naming the left-out map fails the taster's export, naming it.

  Installing on a phone is a worth-a-look (D60).

## Open questions

1. **Editions only leave out.** A demo's last card, or a talk that stops short of a left-out quest, has to be written as its own record in the full game too. Dirtbag swaps whole modules for its demo (`*.full.ts` and `*.demo.ts`). An edition could swap a record for one of its own: worth doing when Proof #1's demo needs it.
2. **Is `appVersion` or `appVersionName` what Bubblewrap 1.25 reads?** (research note, question 1.)
3. **Blob workers from `file://`** are checked in Chromium only.
4. **The android workflow has no lockfile.** The engine can't make one without the network, so Bubblewrap is pinned by version and override, not by hash. A repository can commit `twa/package-lock.json` after its first build.
