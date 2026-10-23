/**
 * The README Publish writes into a game's repository (docs/specs/export.md#publish-to-github): the
 * three steps to a live site, and the Android app's when there is one. `eb publish` writes it only
 * when the repository has none, so a game's own README is never replaced.
 */

export interface ReadmeParts {
  readonly name: string;
  readonly version: string;
  readonly domain?: string;
  readonly android?: { readonly package: string; readonly signed: boolean };
}

export function readme({ name, version, domain, android }: ReadmeParts): string {
  const where = domain
    ? `https://${domain}/. In Settings → Pages, set the custom domain to \`${domain}\`, and point the domain's DNS at GitHub Pages (a CNAME record to \`<owner>.github.io\`).`
    : 'https://<owner>.github.io/<repository>/.';
  const lines = [
    `# ${name}`,
    '',
    `${name} ${version}, made with Engine-Builder. \`site/\` is the game as a web page that installs and plays offline. Engine-Builder's Publish wrote this repository; publish again to update it.`,
    '',
    '## Put it online',
    '',
    '1. Make an empty repository on GitHub, and put these files in it: unzip them into a clone of it and run `git add -A`, `git commit -m "First publish"` and `git push`.',
    '2. In the repository, open Settings → Pages, and under Build and deployment set Source to "GitHub Actions".',
    `3. Run "Deploy" from the Actions tab, or push again. It publishes \`site/\` and then checks the live site serves this build. The game is then at ${where}`,
    '',
    'Each later publish replaces `site/` and the workflows. Pushing it deploys the new build, and players get it when they next open the game: the game offers "Reload to update" on its title, never mid-play.',
  ];
  if (android) {
    lines.push(
      '',
      '## The Android app',
      '',
      `\`.github/workflows/android.yml\` builds the Play app, \`${android.package}\`, around the live site. Deploy the site first: the build fetches the icons from it.`,
      '',
      '1. Make an upload key, once, and keep it safe: `keytool -genkeypair -v -keystore android.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`.',
      '2. In Settings → Secrets and variables → Actions, add `KEYSTORE_BASE64` (the output of `base64 -w0 android.keystore`), `KEYSTORE_PASSWORD` and `KEY_PASSWORD`.',
      '3. Run "Build Android app" from the Actions tab, and upload the `.aab` it keeps to Play Console by hand.',
      '',
      android.signed
        ? '`site/.well-known/assetlinks.json` names the keys in export.json, so the app opens without a browser bar.'
        : 'export.json names no signing key fingerprints yet, so the site has no `.well-known/assetlinks.json` and the app opens with a browser bar. Add the app signing key’s SHA-256 fingerprint from Play Console (Test and release → App signing) to export.json and publish again.',
    );
  }
  return `${lines.join('\n')}\n`;
}
