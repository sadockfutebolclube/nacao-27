import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// Versão e fase mostradas no menu: vêm do primeiro título do CHANGELOG ("## 1.20.0 — Fase 31: …"), a mesma fonte do package.json
// (antes o texto "v1.3 · Fase 13" estava escrito à mão no MenuScreen e parecia deploy defasado).
const titulo = readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8').match(/^## (\d+\.\d+\.\d+) — (?:Fase (\d+)|([^\n(]+))/m);
const VERSAO = titulo?.[1] ?? '0.0.0';
const FASE = titulo?.[2] ? `Fase ${titulo[2]}` : (titulo?.[3] ?? '').trim();

// Cabeçalhos COOP/COEP habilitam SharedArrayBuffer (crossOriginIsolated) para o Worker de simulação.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: './',
  define: { __APP_VERSAO__: JSON.stringify(VERSAO), __APP_FASE__: JSON.stringify(FASE) },
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  server: { headers: isolation, port: 5173 },
  preview: { headers: isolation },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000 }, // o relevo procedural da simulação tem 2,25× mais células desde a Fase 20
});
