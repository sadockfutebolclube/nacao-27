/**
 * NAÇÃO 27 — eleitorado real por município (Fase 7).
 *
 *   npm run fetch-eleitorado
 *
 * Fonte: TSE, Portal de Dados Abertos — "Perfil do eleitorado" da eleição de 2022
 * (https://dadosabertos.tse.jus.br/dataset/eleitorado-2022), CSV por UF com eleitores por município,
 * zona, gênero, faixa etária e escolaridade. Agrega por município e casa o nome com a malha do IBGE.
 *
 * Saída: public/data/eleitorado/{UF}.json · Cache do zip (77 MB): data/tse-cache/
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { EleitoradoUF, type MunicipioEleitoral } from '../src/data/eleitorado.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'data', 'tse-cache');
const OUT = join(ROOT, 'public', 'data', 'eleitorado');
const ZIP = join(CACHE, 'perfil_eleitorado_2022.zip');
const URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitorado/perfil_eleitorado_2022.zip';
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

/** Normaliza nomes de município: sem acento, maiúsculo, sem hífen/apóstrofo. */
/** Municípios cujo nome no TSE difere do oficial do IBGE. */
const APELIDOS: Record<string, string> = { 'BOA SAUDE': 'JANUARIO CICCO', 'SAO LUIZ': 'SAO LUIZ DO ANAUA' };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[-'’`]/g, ' ').replace(/\s+/g, ' ').trim();

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Partes de uma linha CSV com ; e aspas (o TSE não usa ; dentro de campos). */
const campos = (linha: string) => linha.split(';').map((c) => c.replace(/^"|"$/g, ''));

async function baixarZip() {
  try { await access(ZIP); return; } catch { /* baixa */ }
  await mkdir(CACHE, { recursive: true });
  console.log('Baixando perfil do eleitorado 2022 (77 MB)…');
  const r = await fetch(URL);
  if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body as never), createWriteStream(ZIP));
}

interface Acc { nome: string; total: number; jovem: number; idoso: number; superior: number; baixa: number; mulheres: number }

async function agregar(uf: string): Promise<Map<string, Acc>> {
  const proc = spawn('unzip', ['-p', ZIP, `perfil_eleitorado_2022_${uf}.csv`]);
  proc.stdout.setEncoding('latin1');
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  const porMun = new Map<string, Acc>();
  let cab: string[] | null = null;
  let iMun = 0, iNome = 0, iGen = 0, iFaixa = 0, iEsc = 0, iQt = 0;
  for await (const linha of rl) {
    const c = campos(linha);
    if (!cab) {
      cab = c;
      iMun = c.indexOf('CD_MUNICIPIO'); iNome = c.indexOf('NM_MUNICIPIO'); iGen = c.indexOf('DS_GENERO');
      iFaixa = c.indexOf('CD_FAIXA_ETARIA'); iEsc = c.indexOf('DS_GRAU_ESCOLARIDADE'); iQt = c.indexOf('QT_ELEITORES');
      continue;
    }
    const q = Number(c[iQt]);
    if (!q) continue;
    const a = porMun.get(c[iMun]) ?? { nome: c[iNome], total: 0, jovem: 0, idoso: 0, superior: 0, baixa: 0, mulheres: 0 };
    a.total += q;
    // faixas codificadas como "1617" (16 a 17), "2529" (25 a 29), "6064"… ; 9999 = inválida
    const ini = Math.floor(Number(c[iFaixa]) / 100);
    if (ini >= 16 && ini < 30) a.jovem += q;
    if (ini >= 60 && ini < 99) a.idoso += q;
    const esc = c[iEsc];
    if (/SUPERIOR/.test(esc)) a.superior += q;
    if (/ANALFABETO|LÊ E ESCREVE|LE E ESCREVE|FUNDAMENTAL INCOMPLETO/.test(esc)) a.baixa += q;
    if (/FEMININO/.test(c[iGen])) a.mulheres += q;
    porMun.set(c[iMun], a);
  }
  return porMun;
}

async function main() {
  await baixarZip();
  await mkdir(OUT, { recursive: true });
  let semPar = 0;
  for (const uf of UFS) {
    const malha = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'geo', 'municipios', `${uf}.geojson`), 'utf8')) as { features: { properties: { codarea: string; nome: string } }[] };
    const ibge = malha.features.map((f) => ({ cod: f.properties.codarea, nome: f.properties.nome, n: norm(f.properties.nome) }));
    const porMun = await agregar(uf);
    const usados = new Set<string>();
    const lista: MunicipioEleitoral[] = [];
    // 1ª passada: nomes idênticos; 2ª: grafias diferentes (assim um parecido não "rouba" o par exato)
    const pares = new Map<string, (typeof ibge)[number]>();
    for (const [cod, a] of porMun) {
      const n = APELIDOS[norm(a.nome)] ?? norm(a.nome);
      const x = ibge.find((y) => y.n === n && !usados.has(y.cod));
      if (x) { pares.set(cod, x); usados.add(x.cod); }
    }
    for (const [cod, a] of porMun) {
      const n = norm(a.nome);
      let par = pares.get(cod);
      if (!par) {
        // grafias diferentes entre TSE e IBGE (Moji/Mogi, Embu/Embu das Artes…): o mais parecido
        let melhor: (typeof ibge)[number] | null = null, dm = 99;
        for (const x of ibge) if (!usados.has(x.cod)) { const dd = levenshtein(n, x.n); if (dd < dm) { dm = dd; melhor = x; } }
        if (melhor && dm <= Math.max(3, Math.floor(n.length * 0.25))) par = melhor;
      }
      if (!par) { semPar++; console.warn(`  ${uf}: sem par no IBGE para "${a.nome}" (${a.total} eleitores)`); continue; }
      usados.add(par.cod);
      const t = a.total;
      const r3 = (v: number) => Math.round((v / t) * 1000) / 1000;
      lista.push({ ibge: par.cod, nome: par.nome, eleitores: t, jovem: r3(a.jovem), idoso: r3(a.idoso), superior: r3(a.superior), baixaEsc: r3(a.baixa), mulheres: r3(a.mulheres) });
    }
    lista.sort((a, b) => b.eleitores - a.eleitores);
    const total = lista.reduce((s, m) => s + m.eleitores, 0);
    const dados = EleitoradoUF.parse({ sigla: uf, ano: 2022, fonte: 'TSE — Perfil do eleitorado 2022 (dadosabertos.tse.jus.br)', total, municipios: lista });
    await writeFile(join(OUT, `${uf}.json`), JSON.stringify(dados));
    console.log(`${uf}: ${lista.length}/${ibge.length} municípios, ${total.toLocaleString('pt-BR')} eleitores · maior: ${lista[0].nome} (${lista[0].eleitores.toLocaleString('pt-BR')})`);
  }
  console.log(semPar ? `ok, ${semPar} municípios sem par` : 'ok → public/data/eleitorado/');
}

main().catch((e) => { console.error(e); process.exit(1); });
