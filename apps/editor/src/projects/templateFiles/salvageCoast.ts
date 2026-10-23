// The salvage coast template's files as text (M4.11, D61): one chunk, loaded when New project chooses it.
export const files = import.meta.glob('../../../../../templates/salvage-coast/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const prefix = '../../../../../templates/salvage-coast/';
