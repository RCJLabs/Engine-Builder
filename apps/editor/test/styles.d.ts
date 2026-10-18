// The tests' typecheck (tsconfig.tests.json) reaches modules that import their stylesheets, which
// Vite bundles; this says of them what vite/client says, as the editor's own config has it.
declare module '*.css' {}
