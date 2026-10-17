export const BUILD = __EB_BUILD__;

/** "v0.0.1 · 1a2b3c4", the stamp shown in the header and the Project panel. */
export const buildStamp = (build: { version: string; sha: string } = BUILD): string =>
  `v${build.version} · ${build.sha.slice(0, 7)}`;
