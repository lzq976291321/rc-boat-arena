import { defineConfig } from 'vite';

export default defineConfig({
  // 相对 base：既可直接用 vite dev 打开，也能被 DSH 挂在任意前缀下
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets', target: 'es2020', sourcemap: false },
  server: { host: '127.0.0.1', port: 5177, strictPort: true },
  preview: { host: '127.0.0.1', port: 5177, strictPort: true },
});
