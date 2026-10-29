/**
 * Medição de desempenho do jogo no navegador de verdade (Playwright + Chromium com GPU, janela VISÍVEL, sem limitação de segundo plano).
 *
 *   npm run medir-fps                       # mede o build de produção (dist/), qualidade alta, 12 s por cena
 *   npm run medir-fps -- --qualidade=media --seg=20 --sem-vsync --build
 *   npm run medir-fps -- --canal=msedge     # chrome (padrão) · msedge · chromium (o do Playwright)
 *
 * Percorre 5 cenas fixas — orla de Copacabana, Centro, favela na encosta, cruzamento com trânsito e o tour dos pontos turísticos —
 * e grava em docs/medicoes/AAAA-MM-DD.json (e prints em docs/medicoes/AAAA-MM-DD/) o fps médio, o p1/p50/p99/máximo do TEMPO de cada
 * quadro (ms), as draw calls e os triângulos por quadro (somando todas as passadas, inclusive sombras e pós-processamento).
 *
 * Como mede: um requestAnimationFrame próprio, registrado depois do loop do React Three Fiber, lê o delta entre quadros e o
 * `gl.info` (autoReset desligado, zerado a cada quadro). A janela do Chromium precisa estar visível e não minimizada; com
 * `--sem-vsync` o teto de 60 fps cai e o número mostra a folga real da GPU/CPU. Os ganchos `window.__n27*` existem em produção
 * só com `?medir` na URL (src/dev/medir.ts).
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';

const arg = (n: string, d: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const flag = (n: string) => process.argv.includes(`--${n}`);
const SEG = Number(arg('seg', '12'));
const AQUECE = Number(arg('aquece', '5'));
const QUALIDADE = arg('qualidade', 'alta');
const PORTA = Number(arg('porta', '4199'));
const URL_BASE = arg('url', '');
/** navegador: 'chrome' e 'msedge' usam o instalado no sistema (o padrão); 'chromium' usa o baixado pelo Playwright (`npx playwright install chromium`) */
const CANAL = arg('canal', 'chrome');

/** x leste, z sul a partir do centro do mapa (-22,945; -43,195) — a mesma projeção do jogo */
const KX = 111_320 * Math.cos((22.945 * Math.PI) / 180), KZ = 110_574;
const xz = (lat: number, lon: number): [number, number] => [(lon + 43.195) * KX, -(lat + 22.945) * KZ];

interface Cena { id: string; nome: string; camera?: [number, number, number, number, number, number]; tour?: boolean }
const [cx, cz] = xz(-22.9100, -43.1760);
const [tx, tz] = xz(-22.9030, -43.1788);
const CENAS: Cena[] = [
  { id: 'orla-copacabana', nome: 'Orla de Copacabana', camera: [572, 2, 4178, 690, 55, 4128] },
  { id: 'centro', nome: 'Centro (Cinelândia)', camera: [cx, 0, cz, cx + 120, 100, cz + 120] },
  { id: 'favela-encosta', nome: 'Favela na encosta (Vidigal)', camera: [-4006, 56, 5254, -3926, 152, 5382] },
  { id: 'cruzamento-transito', nome: 'Cruzamento com trânsito (Rio Branco × Presidente Vargas)', camera: [tx, 0, tz, tx + 60, 55, tz + 60] },
  { id: 'tour-turismo', nome: 'Tour dos pontos turísticos (8 paradas de 7 s)', tour: true },
];

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const r2 = (v: number) => Math.round(v * 100) / 100;

async function esperarServidor(url: string, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return; } catch { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 400)); }
  throw new Error(`servidor não respondeu em ${url}`);
}

/** Amostra quadro a quadro dentro da página por `ms` ms; `rotulo()` diz a que grupo cada quadro pertence (o tour tem 8 paradas). */
async function amostrar(page: Page, ms: number, comRotulo: boolean) {
  return page.evaluate(({ ms, comRotulo }) => new Promise<{ grupos: Record<string, { dt: number[]; calls: number; tris: number; n: number }> }>((resolve) => {
    const w = window as unknown as { __n27: { gl: { info: { autoReset: boolean; reset: () => void; render: { calls: number; triangles: number } } } }; __n27tur: { tourParada: string; tourAtivo: boolean } };
    const info = w.__n27.gl.info;
    info.autoReset = false; info.reset();
    const grupos: Record<string, { dt: number[]; calls: number; tris: number; n: number }> = {};
    let ultimo = performance.now(); const t0 = ultimo; let primeiro = true;
    const f = (agora: number) => {
      const dt = agora - ultimo; ultimo = agora;
      if (!primeiro) {
        const k = comRotulo ? (w.__n27tur.tourParada || 'fora do tour') : 'cena';
        const g = (grupos[k] ??= { dt: [], calls: 0, tris: 0, n: 0 });
        g.dt.push(dt); g.calls += info.render.calls; g.tris += info.render.triangles; g.n++;
      }
      primeiro = false;
      info.reset();
      if (agora - t0 < ms) requestAnimationFrame(f); else resolve({ grupos });
    };
    requestAnimationFrame(f);
  }), { ms, comRotulo });
}

const resumo = (dt: number[], calls: number, tris: number, n: number) => {
  const soma = dt.reduce((a, b) => a + b, 0);
  return {
    quadros: n, fps_medio: r2((n / soma) * 1000),
    frame_ms: { media: r2(soma / n), p1: r2(pct(dt, 1)), p50: r2(pct(dt, 50)), p99: r2(pct(dt, 99)), max: r2(Math.max(...dt)) },
    fps_p1_pior: r2(1000 / pct(dt, 99)), // o "1% mais lento": 1000 / p99 do tempo de quadro
    draw_calls: Math.round(calls / n), triangulos: Math.round(tris / n),
  };
};

async function main() {
  const raiz = process.cwd();
  let servidor: ChildProcess | null = null;
  let base = URL_BASE;
  if (!base) {
    if (flag('build') || !existsSync(join(raiz, 'dist/index.html'))) { console.log('[medir-fps] build de produção…'); execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' }); }
    servidor = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORTA), '--strictPort'], { stdio: 'ignore' });
    base = `http://localhost:${PORTA}`;
  }
  try {
    await esperarServidor(base + '/');
    const args = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'];
    if (flag('sem-vsync')) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
    const browser = await chromium.launch({ headless: false, args, ...(CANAL === 'chromium' ? {} : { channel: CANAL }) });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((q) => { try { localStorage.setItem('nacao27:prefs', JSON.stringify({ qualidade: q, tutorial: false })); } catch { /* sem storage */ } }, QUALIDADE);
    // o tsx (esbuild) injeta `__name` nas funções que o Playwright serializa para a página: define o ajudante lá
    await ctx.addInitScript('window.__name = function (f) { return f; };');
    const page = await ctx.newPage();
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(String(e)));
    await page.goto(`${base}/?jogar&modo=sandbox&medir`, { waitUntil: 'load' });
    console.log('[medir-fps] carregando o Rio…');
    await page.waitForFunction(() => !!(window as unknown as { __n27cam?: unknown }).__n27cam && !!(window as unknown as { __n27?: unknown }).__n27, undefined, { timeout: 240000, polling: 500 });
    await page.waitForTimeout(12000); // prédios, vias e pedestres terminam de montar
    const maquina = await page.evaluate(() => {
      const c = document.createElement('canvas'); const gl = c.getContext('webgl2')!;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'desconhecida', tela: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, ua: navigator.userAgent };
    });
    // sol de meio-dia e contexto do turismo fixo (sábado) para todas as cenas
    await page.evaluate(() => { const t = (window as unknown as { __n27tur: { hora: (h: number) => void; forcar: unknown } }).__n27tur; t.hora(11); t.forcar = { hora: 12, diaSemana: 6, mes: 1, chuva: 0, temp: 30 }; });
    const dir = join(raiz, 'docs/medicoes'); mkdirSync(dir, { recursive: true });
    const data = new Date(); const dia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    mkdirSync(join(dir, dia), { recursive: true });
    const cenas: Record<string, unknown>[] = [];
    for (const cena of CENAS) {
      console.log(`[medir-fps] ${cena.nome}…`);
      if (cena.camera) {
        await page.evaluate((a) => { const c = (window as unknown as { __n27cam: { target: { set: (...v: number[]) => void }; object: { position: { set: (...v: number[]) => void } }; update: () => void } }).__n27cam; c.target.set(a[0], a[1], a[2]); c.object.position.set(a[3], a[4], a[5]); c.update(); }, cena.camera);
        await page.waitForTimeout(AQUECE * 1000);
        const { grupos } = await amostrar(page, SEG * 1000, false);
        const g = grupos.cena;
        cenas.push({ id: cena.id, nome: cena.nome, ...resumo(g.dt, g.calls, g.tris, g.n) });
      } else if (cena.tour) {
        await page.evaluate(() => (window as unknown as { __n27tur: { tourIr: (i: number) => void } }).__n27tur.tourIr(0));
        await page.waitForTimeout(2500);
        const { grupos } = await amostrar(page, 8 * 7000 - 2500, true);
        const todos = Object.values(grupos);
        const dt = todos.flatMap((g) => g.dt), calls = todos.reduce((s, g) => s + g.calls, 0), tris = todos.reduce((s, g) => s + g.tris, 0), n = dt.length;
        cenas.push({ id: cena.id, nome: cena.nome, ...resumo(dt, calls, tris, n), paradas: Object.fromEntries(Object.entries(grupos).map(([k, g]) => [k, resumo(g.dt, g.calls, g.tris, g.n)])) });
        await page.evaluate(() => (window as unknown as { __n27tur: { tourParar: () => void } }).__n27tur.tourParar());
      }
      await page.screenshot({ path: join(dir, dia, `${cena.id}.jpg`), type: 'jpeg', quality: 80 });
    }
    let commit = ''; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim(); } catch { /* sem git */ }
    const versao = JSON.parse((await import('node:fs')).readFileSync(join(raiz, 'package.json'), 'utf8')).version;
    const saida = {
      data: data.toISOString(), versao, commit, build: URL_BASE ? URL_BASE : 'dist/ (vite preview)', qualidade: QUALIDADE,
      parametros: { segundosPorCena: SEG, aquecimentoS: AQUECE, semVsync: flag('sem-vsync'), janela: 'visível, 1600x900' },
      maquina: { so: `${platform()} ${release()}`, cpu: cpus()[0]?.model, nucleos: cpus().length, ramGB: Math.round(totalmem() / 2 ** 30), ...maquina, chromium: browser.version() },
      cenas, erros_na_pagina: erros.slice(0, 5),
    };
    const arquivo = join(dir, `${dia}.json`);
    writeFileSync(arquivo, JSON.stringify(saida, null, 2));
    console.log(`[medir-fps] gravado ${arquivo}`);
    for (const c of cenas) console.log(`  ${String(c.nome).padEnd(60)} ${String(c.fps_medio).padStart(6)} fps · p99 ${(c.frame_ms as { p99: number }).p99} ms · ${c.draw_calls} calls · ${c.triangulos} tris`);
    await browser.close();
  } finally { servidor?.kill(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
