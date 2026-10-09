import { defineConfig } from 'vitest/config';
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  server: { watch: { ignored: ['**/public/downloads/**'] } },
  test: { environment: 'node' },
});
