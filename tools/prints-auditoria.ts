/**
 * Prints da auditoria das vias (Fase 33): abre o jogo (build de produção, Chrome com GPU, janela visível), leva a câmera aos 20 piores
 * locais do detector (`docs/auditoria-vias/antes.json`) e a quatro lugares fixos (Vidigal, Santa Teresa, o cruzamento "do print" = o pior local
 * do detector e um viaduto) e salva um JPG por local em docs/auditoria-vias/<rotulo>/.
 *
 *   node node_modules/tsx/dist/cli.mjs tools/prints-auditoria.ts --rotulo=antes     (precisa de `npm run build` feito)
 *
 * Mesma câmera nos dois rótulos: o alvo é o ponto (x, z) e a câmera fica 70 m a sudeste e 60 m acima.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const ROTULO = arg('rotulo', 'antes');
const PORTA = Number(arg('porta', '4198'));
const ROOT = process.cwd();
const FONTE = arg('piores', 'antes'); // de qual relatório vêm os 20 piores (sempre o ANTES, para comparar o mesmo lugar)

interface Local { id: string; nome: string; x: number; z: number; dist?: number; alt?: number }
const relatorio = JSON.parse(readFileSync(join(ROOT, `docs/auditoria-vias/${FONTE}.json`), 'utf8')) as { piores_30: { posto: number; x: number; z: number; bairro: string; pontuacao: number }[] };
const KX = 111_320 * Math.cos((22.945 * Math.PI) / 180), KZ = 110_574;
const xz = (lat: number, lon: number): [number, number] => [(lon + 43.195) * KX, -(lat + 22.945) * KZ];
const [stx, stz] = xz(-22.9225, -43.1870);
const locais: Local[] = [
  { id: 'fixo-vidigal', nome: 'Vidigal', x: -4006, z: 5254, dist: 110, alt: 90 },
  { id: 'fixo-santa-teresa', nome: 'Santa Teresa', x: stx, z: stz, dist: 120, alt: 90 },
  { id: 'fixo-cruzamento-do-print', nome: 'Cruzamento em encosta (pior local do detector)', x: relatorio.piores_30[0].x, z: relatorio.piores_30[0].z, dist: 60, alt: 50 },
  { id: 'fixo-viaduto', nome: 'Viaduto (Rua Major Toja Martinez Filho)', x: -4448, z: 5342, dist: 110, alt: 95 },
  ...relatorio.piores_30.slice(0, 20).map((p): Local => ({ id: `pior-${String(p.posto).padStart(2, '0')}`, nome: `#${p.posto} ${p.bairro}`, x: p.x, z: p.z })),
];

async function esperar(url: string) { for (let i = 0; i < 150; i++) { try { if ((await fetch(url)).ok) return; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 400)); } throw new Error('servidor não subiu'); }

async function main() {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('faça `npm run build` antes');
  const srv: ChildProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORTA), '--strictPort'], { stdio: 'ignore' });
  try {
    await esperar(`http://localhost:${PORTA}/`);
    const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await ctx.addInitScript('window.__name = function (f) { return f; };');
    await ctx.addInitScript(() => { try { localStorage.setItem('nacao27:prefs', JSON.stringify({ qualidade: 'alta', tutorial: false })); } catch { /* sem storage */ } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORTA}/?jogar&modo=sandbox&medir`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as unknown as { __n27cam?: unknown }).__n27cam, undefined, { timeout: 240000, polling: 500 });
    await page.waitForTimeout(10000);
    await page.evaluate(() => { const t = (window as unknown as { __n27tur: { hora: (h: number) => void } }).__n27tur; t.hora(11); });
    // modo foto (tecla H) esconde o HUD: o print mostra só o mapa
    await page.keyboard.press('h');
    const dir = join(ROOT, 'docs/auditoria-vias', ROTULO); mkdirSync(dir, { recursive: true });
    for (const l of locais) {
      const d = l.dist ?? 70, a = l.alt ?? 60;
      await page.evaluate(([x, z, d, a]) => { const c = (window as unknown as { __n27cam: { target: { set: (...v: number[]) => void }; object: { position: { set: (...v: number[]) => void } }; update: () => void } }).__n27cam; c.target.set(x, 0, z); c.object.position.set(x + d, a, z + d); c.update(); }, [l.x, l.z, d, a]);
      await page.waitForTimeout(4500);
      // a câmera sobe ao chão do alvo sozinha; reposiciona uma vez com a cota certa
      await page.evaluate(([d, a]) => { const c = (window as unknown as { __n27cam: { target: { x: number; y: number; z: number }; object: { position: { set: (...v: number[]) => void } }; update: () => void } }).__n27cam; c.object.position.set(c.target.x + d, c.target.y + a, c.target.z + d); c.update(); }, [d, a]);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: join(dir, `${l.id}.jpg`), type: 'jpeg', quality: 82 });
      console.log(`[prints] ${ROTULO} ${l.id} ${l.nome}`);
    }
    await browser.close();
  } finally { srv.kill(); }
  void execFileSync;
}
main().catch((e) => { console.error(e); process.exit(1); });
