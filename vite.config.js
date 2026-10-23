import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { covePublicAssets } from './tools/assets/cove-public-assets.mjs';

export default defineConfig(({ command }) => ({
  plugins: [tailwindcss(), covePublicAssets()],
  // Keep the complete stock library local; publish only the active composition.
  publicDir: command === 'serve' ? 'public' : false,
  // Relative URLs preserve optional static-host subpaths.
  base: './',
  build: {
    outDir: 'dist', assetsDir: 'assets/build', target: 'es2020', sourcemap: false,
    manifest: true,
    rollupOptions: {
      input: { cove: 'index.html' },
      output: {
        // Do not pull lazy dependencies into an eager vendor chunk.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          const path = id.replaceAll('\\', '/');
          if (path.includes('/three/build/three.core.js')) return 'three-core';
          if (path.includes('/three/build/three.module.js')) return 'three-webgl';
          if (path.includes('/three/examples/jsm/loaders/GLTFLoader.js') || path.includes('/three/examples/jsm/utils/BufferGeometryUtils.js')) return 'gltf-loader';
          if (/\/three\/examples\/jsm\/(postprocessing|shaders)\//.test(path)) return 'postprocessing';
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 5177, strictPort: true },
  preview: { host: '127.0.0.1', port: 5177, strictPort: true },
}));
