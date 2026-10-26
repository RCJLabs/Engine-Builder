/**
 * The benches that need Vite's imports (a JSON record, a file's URL), run by Vitest outside the
 * suite: pnpm exec vitest run --config apps/editor/test/bench.config.ts --disable-console-intercept
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['apps/editor/test/*.bench.ts'], environment: 'node', testTimeout: 120_000 },
});
