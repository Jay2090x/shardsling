import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative asset paths (required by web game portals)
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
