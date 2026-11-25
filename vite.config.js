import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A fresh id per build. It's compiled into the page as __BUILD_ID__ and also
// written to dist/build-id.txt, which the server reports from /api/visual so a
// running display can notice a new build and reload itself.
const buildId = Date.now().toString(36);

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'build-id',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build-id.txt', source: buildId });
      },
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});
