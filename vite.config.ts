/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stamps a fresh build id and the list of built files into the service worker, so each deploy gets its own cache. */
function stampServiceWorker(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    closeBundle() {
      const file = join(root, outDir, 'sw.js');
      if (!existsSync(file)) return;
      const id = Date.now().toString(36);
      // Every built JS/CSS file except the Gemini voice SDK (voice lessons need the internet anyway).
      const assetsDir = join(root, outDir, 'assets');
      const assets = existsSync(assetsDir)
        ? readdirSync(assetsDir).filter((f) => /\.(js|css)$/.test(f) && !f.startsWith('genai-')).map((f) => `/assets/${f}`)
        : [];
      const code = readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', id).replace('[]; /*PRECACHE*/', `${JSON.stringify(assets)};`);
      writeFileSync(file, code);
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // Vendor chunks: the Gemini SDK is only needed on the live lesson page, so it stays out of the main bundle.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@google/genai')) return 'genai';
          if (id.includes('@supabase')) return 'supabase';
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/**/*.test.ts'],
    css: false,
  },
});
