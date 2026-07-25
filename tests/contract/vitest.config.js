import { defineConfig } from 'vitest/config';

// Vite reserves `BASE_URL` as a special `import.meta.env` constant (mirroring
// `config.base`, default "/") and Vitest's worker setup unconditionally
// re-derives `process.env.BASE_URL` from it, clobbering any value the shell
// exported. Re-injecting the real value here via `test.env` (which Vitest
// applies to `process.env`/`import.meta.env` after that clobbering) is the
// supported way to get our own `BASE_URL` through to the test files.
const test = {
  include: ['src/specs/**/*.spec.js'],
  testTimeout: 10000,
  hookTimeout: 10000,
  reporters: 'default',
};

if (process.env.BASE_URL) {
  test.env = { BASE_URL: process.env.BASE_URL };
}

export default defineConfig({ test });
