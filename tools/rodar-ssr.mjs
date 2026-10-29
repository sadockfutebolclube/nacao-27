// Roda um script TypeScript do projeto com o transformador do Vite (import.meta.env, JSON, aliases iguais aos do jogo):
//   node tools/rodar-ssr.mjs tools/detectar-defeitos-vias.ts --rotulo=antes
import { createServer } from 'vite';

const alvo = process.argv[2];
if (!alvo) { console.error('uso: node tools/rodar-ssr.mjs <arquivo.ts> [args]'); process.exit(1); }
const servidor = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] }, ssr: { noExternal: [] } });
try {
  await servidor.ssrLoadModule('/' + alvo);
} finally {
  await servidor.close();
}
