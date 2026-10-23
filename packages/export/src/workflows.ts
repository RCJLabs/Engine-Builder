/**
 * The GitHub workflows Publish writes (docs/specs/export.md#publish-to-github): pages.yml deploys
 * site/ and checks the live site serves the build; android.yml builds the Play app around it, from
 * Dirtbag's build-twa.yml. Both are written whole for each publish, so a new engine's fixes reach a
 * game's repository with its next publish.
 */

export interface PagesParts {
  readonly name: string;
  /** With an Android app: its package, which the live assetlinks.json must name. */
  readonly androidPackage?: string;
}

export function pagesWorkflow({ name, androidPackage }: PagesParts): string {
  const assetlinks = androidPackage
    ? `
          # The Android app opens without a browser bar only while this names it.
          origin=$(echo "$site" | sed -E 's#^(https?://[^/]+).*#\\1#')
          curl -fsS "$origin/.well-known/assetlinks.json" | grep -q '"${androidPackage}"' || {
            echo "::error::$origin/.well-known/assetlinks.json doesn't name ${androidPackage}"
            exit 1
          }`
    : '';
  return `# Deploys site/, ${name} as Engine-Builder exported it, to GitHub Pages, then checks the live
# site serves this build. Written by Engine-Builder's Publish: publish again rather than edit it.
#
# Once, by hand: Settings -> Pages -> Build and deployment -> Source: "GitHub Actions".
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

# One deploy at a time, and none cancelled halfway.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    outputs:
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/upload-pages-artifact@v5
        with:
          path: site
          # .well-known is a dot folder, which the upload leaves out unless told.
          include-hidden-files: true
      - id: deployment
        uses: actions/deploy-pages@v5

  confirm:
    needs: deploy
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7
      - name: The live site serves this build
        env:
          URL: \${{ needs.deploy.outputs.url }}
        run: |
          build=$(sed -n 's/.*"build": *"\\([0-9a-f]*\\)".*/\\1/p' site/version.json)
          site="\${URL%/}"
          for i in $(seq 1 30); do
            if curl -fsS -H 'Cache-Control: no-cache' "$site/version.json?$GITHUB_SHA" | grep -q "\\"$build\\""; then
              echo "live: build $build at $site"
              break
            fi
            if [ "$i" = 30 ]; then echo "::error::$site is still not serving build $build after 5 minutes"; exit 1; fi
            sleep 10
          done
          curl -fsS -H 'Cache-Control: no-cache' "$site/sw.js" | grep -q "$build" || { echo "::error::$site/sw.js isn't this build's"; exit 1; }${assetlinks}
`;
}

export interface AndroidParts {
  readonly name: string;
  /** The file name the signed bundle is uploaded as, without .aab. */
  readonly game: string;
}

export function androidWorkflow({ name, game }: AndroidParts): string {
  return `# Builds the Android App Bundle (.aab) for Play around ${name}'s web build: a Trusted Web
# Activity, made by Bubblewrap from twa-manifest.json. Run it from the Actions tab once the web
# build is deployed: Bubblewrap fetches the icons from the live site. Written by Engine-Builder's
# Publish, from Dirtbag's build-twa.yml: publish again rather than edit it.
#
# Secrets (Settings -> Secrets and variables -> Actions): KEYSTORE_BASE64, the upload keystore as
# base64; KEYSTORE_PASSWORD; KEY_PASSWORD. The key's alias is "upload".
name: Build Android app

on:
  workflow_dispatch:
    inputs:
      sign:
        description: 'Sign the bundle and keep it as an artifact (off: check the toolchain only, reading no secrets)'
        type: boolean
        default: true

env:
  # Google Play: since 31 Aug 2026, new apps and updates must target Android 16 (API 36). Raise
  # this when Play raises the floor.
  MIN_TARGET_SDK: 36

jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 22

      - name: Set up JDK 17 (Bubblewrap 1.25 takes no other)
        uses: actions/setup-java@v5
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up the Android SDK
        uses: android-actions/setup-android@v4
        with:
          # The default list asks for the legacy "tools" package, which Google removed; Gradle
          # fetches the platform and build tools it needs itself.
          packages: platform-tools

      - name: Install the pinned Bubblewrap
        run: npm install --prefix twa --no-audit --no-fund

      - name: Point Bubblewrap at the runner's JDK and SDK
        run: |
          mkdir -p ~/.bubblewrap
          printf '{ "jdkPath": "%s", "androidSdkPath": "%s" }\\n' "$JAVA_HOME" "$ANDROID_SDK_ROOT" > ~/.bubblewrap/config.json

      - name: Set the version code from the clock
        run: |
          # Minutes since November 2023: every build is greater than any uploaded before, as Play requires.
          code=$(( ($(date +%s) - 1700000000) / 60 ))
          node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync("twa-manifest.json", "utf8")); m.appVersionCode = Number(process.argv[1]); fs.writeFileSync("twa-manifest.json", JSON.stringify(m, null, 2));' "$code"
          echo "versionCode $code" | tee -a "$GITHUB_STEP_SUMMARY"

      - name: Generate the Android project (fetches the icons from the live site)
        run: twa/node_modules/.bin/bubblewrap update --skipVersionUpgrade

      - name: Check targetSdkVersion meets Play's floor
        run: |
          sdk=$(grep -oE 'targetSdkVersion[[:space:]]+[0-9]+' app/build.gradle | grep -oE '[0-9]+$' || true)
          echo "targetSdkVersion \${sdk:-missing} (Play requires $MIN_TARGET_SDK+)" | tee -a "$GITHUB_STEP_SUMMARY"
          if [ -z "$sdk" ] || [ "$sdk" -lt "$MIN_TARGET_SDK" ]; then
            echo "::error::targetSdkVersion \${sdk:-missing} is below $MIN_TARGET_SDK; Play will refuse this bundle"
            exit 1
          fi

      - name: Accept the Android SDK licences
        run: yes | sdkmanager --licenses || true

      - name: Build the release bundle
        run: |
          chmod +x ./gradlew
          ./gradlew bundleRelease --no-daemon

      - name: Sign the bundle with the upload key
        if: inputs.sign
        env:
          KEYSTORE_BASE64: \${{ secrets.KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: \${{ secrets.KEYSTORE_PASSWORD }}
          KEY_PASSWORD: \${{ secrets.KEY_PASSWORD }}
        run: |
          echo "$KEYSTORE_BASE64" | base64 -d > android.keystore
          jarsigner -keystore android.keystore \\
            -storepass:env KEYSTORE_PASSWORD \\
            -keypass:env KEY_PASSWORD \\
            -signedjar ${game}-release.aab \\
            app/build/outputs/bundle/release/app-release.aab \\
            upload
          rm -f android.keystore

      - name: Keep the signed bundle
        if: inputs.sign
        uses: actions/upload-artifact@v7
        with:
          name: ${game}-aab
          path: ${game}-release.aab
`;
}

export interface TwaParts {
  readonly name: string;
  readonly shortName: string;
  readonly domain: string;
  readonly package: string;
  readonly version: string;
  readonly orientation: 'any' | 'portrait' | 'landscape';
  readonly background: string;
  readonly theme: string;
}

/** Bubblewrap's project file, after Dirtbag's. Its version code is the workflow's to set. */
export function twaManifest(t: TwaParts): string {
  const site = `https://${t.domain}`;
  return `${JSON.stringify(
    {
      packageId: t.package,
      host: t.domain,
      name: t.name,
      launcherName: t.shortName,
      display: 'standalone',
      orientation: t.orientation,
      themeColor: t.theme,
      themeColorDark: t.theme,
      navigationColor: t.background,
      navigationColorDark: t.background,
      navigationDividerColor: t.background,
      navigationDividerColorDark: t.background,
      backgroundColor: t.background,
      enableNotifications: false,
      startUrl: '/',
      iconUrl: `${site}/icons/icon-512.png`,
      maskableIconUrl: `${site}/icons/icon-512-maskable.png`,
      splashScreenFadeOutDuration: 300,
      signingKey: { path: './android.keystore', alias: 'upload' },
      appVersionName: t.version,
      appVersionCode: 1,
      shortcuts: [],
      generatorApp: 'bubblewrap-cli',
      webManifestUrl: `${site}/manifest.webmanifest`,
      fallbackType: 'customtabs',
      features: {},
      alphaDependencies: { enabled: false },
      enableSiteSettingsShortcut: true,
      isChromeOSOnly: false,
      isMetaQuest: false,
      fullScopeUrl: `${site}/`,
      minSdkVersion: 23,
      orientationLockEnabled: t.orientation !== 'any',
    },
    null,
    2,
  )}\n`;
}

/**
 * Bubblewrap, pinned by version. @bubblewrap/cli asks for core as ^1.x, and core owns the Android
 * template, so the override pins it too. No lockfile: the engine can't make one offline.
 */
export const twaPackageJson = (game: string): string =>
  `${JSON.stringify(
    {
      name: `${game}-twa`,
      private: true,
      description: 'Bubblewrap for the Android build (android.yml), pinned with its core.',
      devDependencies: { '@bubblewrap/cli': '1.25.0' },
      overrides: { '@bubblewrap/core': '1.25.0' },
    },
    null,
    2,
  )}\n`;
