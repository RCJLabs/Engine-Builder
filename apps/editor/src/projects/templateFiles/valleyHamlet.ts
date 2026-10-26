// The valley hamlet template's files (M6.9, D81): one chunk, loaded when New project chooses it. Its starter
// kit models and its navmeshes come inlined as data URLs, the rest as text.
export const files = import.meta.glob(['../../../../../templates/valley-hamlet/**/*', '!**/*.glb', '!**/*.nav'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const binaries = import.meta.glob(
  ['../../../../../templates/valley-hamlet/**/*.glb', '../../../../../templates/valley-hamlet/**/*.nav'],
  {
    query: '?inline',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

export const prefix = '../../../../../templates/valley-hamlet/';
