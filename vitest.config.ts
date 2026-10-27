import { defineConfig } from 'vitest/config';

export default defineConfig({
  // As the editor's build has them: a 3D template's models and navmeshes, inlined (M6.9).
  assetsInclude: ['**/*.glb', '**/*.nav'],
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.{ts,tsx}', 'tools/**/test/**/*.test.ts'],
    environment: 'node',
  },
});
