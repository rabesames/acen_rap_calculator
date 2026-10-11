import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained dist/index.html: scripts and styles are inlined, nothing is
// loaded from another file or host.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    // Nothing is preloaded in a single-file page, so leave out the preload helper.
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
