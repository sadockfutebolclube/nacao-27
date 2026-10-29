/**
 * Regrade da rede viária (Fase 20): onde o morro pede mais rampa do que uma rua aguenta, a RUA muda, não o contrário.
 *
 *  1. Cota dos nós: partem do terreno e relaxam trecho a trecho até |Δcota| ≤ `GRADE_ALVO` × comprimento (25%); o
 *     teto absoluto é `GRADE_TETO` (30%). Todos os trechos que se encontram num nó concordam com a cota dele.
 *  2. Perfil de cada trecho: o terreno suavizado, deslocado para casar com os nós e projetado na restrição de rampa.
 *  3. Classe de cada amostra pela diferença rua − terreno original: ponte/viaduto (rua ≥ 3 m acima por ≥ 15 m), túnel
 *     (≥ 8 m abaixo por ≥ 40 m) e muro de arrimo (mais de 4 m de diferença). Trecho que fica ≥ 60% numa classe de
 *     ponte ou túnel vira ponte ou túnel inteiro; o terreno não é escavado ali.
 *
 * Puro e determinístico: a terraplenagem (`escavar.ts`) e o desenho das vias (`perfilVias.ts`, `Vias.tsx`) usam o resultado.
 */
import { edgeEnds, sampleByLength, type RoadGraph } from './roads';
import { limitarRampa, suavizarPerfil } from './relevo';
import { roadBaseY, type Heightmap } from './terrain';

/** Talude de aterro (Fase 33: vira relevo, não faixa de malha): 1 V : 1,5 H, o máximo que o terreno em torno de uma rua aceita */
export const TALUDE_H_POR_V = 1.5;
export const GRADE_ALVO = 0.25;
export const GRADE_TETO = 0.3;
/** Rua de morro (Fase 28): onde o relevo pede mais que o teto entre os dois nós de uma RUA (não avenida), o trecho ganha rampa de até 40%, como as
 * ladeiras reais do Vidigal e de Santa Teresa — em vez de um viaduto de 48 m e um túnel de 125 m para segurar 25%. */
export const GRADE_MORRO = 0.4;
export const PONTE_MIN_VAO = 3;
export const PONTE_MIN_COMP = 15;
export const TUNEL_MIN_PROF = 8;
export const TUNEL_MIN_COMP = 40;
export const MURO_MIN_DIF = 4;
const FRACAO_TRECHO = 0.6;
/** Falésia (Fase 28): o relevo de satélite (30 m) erra a posição horizontal na borda de um paredão; se a até `FALESIA_RAIO` m do eixo o terreno é
 * `FALESIA_DEGRAU` m mais baixo, a rua está na beira ou no pé da falésia, não no meio da rocha: a cota de referência passa a ser a de baixo. */
export const FALESIA_RAIO = 32;
export const FALESIA_DEGRAU = 45;
const FALESIA_ACIMA_DO_PE = 4;

/** classe de cada amostra: 0 normal · 1 ponte · 2 túnel · 3 muro de arrimo */
export const Classe = { Normal: 0, Ponte: 1, Tunel: 2, Muro: 3 } as const;
export type Classe = (typeof Classe)[keyof typeof Classe];

export interface PerfilRegrade {
  /** cota do eixo em cada amostra (as mesmas de `sampleByLength(…, 3)`) */
  y: Float32Array;
  /** y − terreno original (com o +0,3 de `roadBaseY`): positivo = rua acima do morro */
  dev: Float32Array;
  classe: Uint8Array;
  /** nível efetivo: −1 túnel · 0 chão · +1 ponte/viaduto */
  nivel: -1 | 0 | 1;
  /** maior rampa (m/m) entre amostras vizinhas */
  gradeMax: number;
  comprimento: number;
  /** maior |dev| */
  devMax: number;
  /** amostras em que a cota de referência foi a do pé da falésia */
  falesia: number;
  /** rampa-alvo usada no trecho (0,25 normal; até 0,40 numa rua de morro) */
  alvo: number;
  /** maior dev (m) entre as amostras de muro de arrimo */
  muroMax: number;
}

export interface ResumoRegrade {
  trechos: number; nos: number; nosMovidos: number; iteracoes: number;
  pontes: number; tuneis: number; amostrasMuro: number; trechosComMuro: number; trechosComPonte: number; trechosComTunel: number;
  gradeMax: number; acima25: number; acima30: number;
  maxAterro: number; maxCorte: number;
  /** Fase 28: trechos com perfil ajustado à falésia e maior muro de arrimo (m) */
  trechosComFalesia: number; maxMuro: number; trechosDeMorro: number;
}

export interface Regrade {
  /** cópia do relevo original (antes da terraplenagem) para medir cortes e aterros */
  h0: Float32Array;
  nos: Map<number, number>;
  trechos: Map<number, PerfilRegrade>;
  resumo: ResumoRegrade;
  /** Fase 33: aterro feito no relevo (talude 1:1,5 em torno das ruas acima do chão): células levantadas e a maior altura (m) */
  aterro?: { celulas: number; maxAltura: number };
}

const registro = new WeakMap<Float32Array, Regrade>();
/** O regrade que escavou este relevo (chave: `hm.h`), se houve. */
export const regradeDe = (h: Float32Array): Regrade | undefined => registro.get(h);
export const registrarRegrade = (h: Float32Array, r: Regrade) => { registro.set(h, r); };

/** Altura do relevo original (m) num ponto, por interpolação bilinear — o que valia antes das ruas mudarem o chão. */
export function alturaOriginal(r: Regrade, hm: Heightmap, x: number, z: number): number {
  return roadBaseY({ ...hm, h: r.h0 } as Heightmap, x, z) - 0.3;
}

export function regradarVias(h0: Float32Array, g: RoadGraph): Regrade {
  const original = Float32Array.from(h0);
  const hm0 = { h: original } as unknown as Heightmap;
  const nos = new Map<number, number>();
  for (const n of g.nodes.values()) nos.set(n.id, roadBaseY(hm0, n.x, n.z));
  const topo = new Map<number, { xs: Float32Array; zs: Float32Array; s: Float32Array; bruto: Float32Array; L: number; falesia: number }>();
  const DIRS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)] as const);
  const comuns: { id: number; a: number; b: number; L: number; alvo: number }[] = [];
  const alvos = new Map<number, number>();
  for (const e of g.edges.values()) {
    const [p0, c, p1] = edgeEnds(g, e);
    const { pts, length } = sampleByLength(p0, c, p1, 3);
    const n = pts.length;
    const xs = new Float32Array(n), zs = new Float32Array(n), s = new Float32Array(n), bruto = new Float32Array(n);
    let falesia = 0;
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i].x; zs[i] = pts[i].z; s[i] = pts[i].s;
      let ref = roadBaseY(hm0, pts[i].x, pts[i].z);
      if (!e.nivel) {
        let pe = ref;
        for (const [dx, dz] of DIRS) pe = Math.min(pe, roadBaseY(hm0, pts[i].x + dx * FALESIA_RAIO, pts[i].z + dz * FALESIA_RAIO));
        if (ref - pe > FALESIA_DEGRAU) { ref = pe + FALESIA_ACIMA_DO_PE; falesia++; }
      }
      bruto[i] = ref;
    }
    topo.set(e.id, { xs, zs, s, bruto, L: length, falesia });
    if (!e.nivel) {
      const L = Math.max(1, length);
      const bruta = Math.abs(roadBaseY(hm0, g.nodes.get(e.b)!.x, g.nodes.get(e.b)!.z) - roadBaseY(hm0, g.nodes.get(e.a)!.x, g.nodes.get(e.a)!.z)) / L;
      const alvo = e.type === 'rua' && bruta > GRADE_TETO ? Math.min(GRADE_MORRO, bruta) : GRADE_ALVO;
      alvos.set(e.id, alvo);
      comuns.push({ id: e.id, a: e.a, b: e.b, L, alvo });
    }
  }

  // os nós partem da cota de referência do trecho (com o ajuste de falésia), não só do relevo bruto
  for (const e of g.edges.values()) { const t = topo.get(e.id)!; if (!t.falesia) continue; const n = t.bruto.length; if (t.falesia >= 1) { nos.set(e.a, Math.min(nos.get(e.a)!, t.bruto[0] + 0)); nos.set(e.b, Math.min(nos.get(e.b)!, t.bruto[n - 1] + 0)); } }

  // 1. relaxação da cota dos nós
  const inicial = new Map(nos);
  let it = 0;
  for (; it < 1500; it++) {
    let maior = 0;
    for (const t of comuns) {
      const ya = nos.get(t.a)!, yb = nos.get(t.b)!;
      const d = ya - yb, lim = t.alvo * t.L;
      if (Math.abs(d) <= lim) continue;
      const ex = (Math.abs(d) - lim) / 2;
      maior = Math.max(maior, ex);
      if (d > 0) { nos.set(t.a, ya - ex); nos.set(t.b, yb + ex); } else { nos.set(t.a, ya + ex); nos.set(t.b, yb - ex); }
    }
    if (maior < 0.02) break;
  }
  let nosMovidos = 0;
  for (const [id, y] of nos) if (Math.abs(y - inicial.get(id)!) > 0.5) nosMovidos++;

  // 2 e 3. perfil e classes de cada trecho
  const trechos = new Map<number, PerfilRegrade>();
  const resumo: ResumoRegrade = { trechos: 0, nos: nos.size, nosMovidos, iteracoes: it, pontes: 0, tuneis: 0, amostrasMuro: 0, trechosComMuro: 0, trechosComPonte: 0, trechosComTunel: 0, gradeMax: 0, acima25: 0, acima30: 0, maxAterro: 0, maxCorte: 0, trechosComFalesia: 0, maxMuro: 0, trechosDeMorro: 0 };
  for (const e of g.edges.values()) {
    if (e.nivel) continue;
    const t = topo.get(e.id)!;
    const n = t.s.length;
    const base = suavizarPerfil(t.bruto, 3, 6, 10, 1e6);
    const ya = nos.get(e.a)!, yb = nos.get(e.b)!;
    const da = ya - t.bruto[0], db = yb - t.bruto[n - 1];
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = base[i] + da + (db - da) * (t.s[i] / Math.max(1e-6, t.L));
    y[0] = ya; y[n - 1] = yb;
    const alvo = alvos.get(e.id) ?? GRADE_ALVO;
    limitarRampa(y, t.s, alvo);
    const dev = new Float32Array(n), classe = new Uint8Array(n);
    let devMax = 0, gradeMax = 0;
    for (let i = 0; i < n; i++) {
      dev[i] = y[i] - t.bruto[i];
      devMax = Math.max(devMax, Math.abs(dev[i]));
      if (i) gradeMax = Math.max(gradeMax, Math.abs(y[i] - y[i - 1]) / Math.max(0.5, t.s[i] - t.s[i - 1]));
    }
    // ponte e túnel: corridas de amostras contínuas com o comprimento mínimo
    const corrida = (cond: (d: number) => boolean, minComp: number, marca: Classe) => {
      let i = 0, total = 0;
      while (i < n) {
        if (!cond(dev[i])) { i++; continue; }
        let j = i;
        while (j + 1 < n && cond(dev[j + 1])) j++;
        const comp = t.s[j] - t.s[i] + (n > 1 ? (t.s[1] - t.s[0]) : 0);
        if (comp >= minComp) { for (let k = i; k <= j; k++) classe[k] = marca; total += comp; }
        i = j + 1;
      }
      return total;
    };
    const ponte = corrida((d) => d >= PONTE_MIN_VAO, PONTE_MIN_COMP, Classe.Ponte);
    const tunel = corrida((d) => d <= -TUNEL_MIN_PROF, TUNEL_MIN_COMP, Classe.Tunel);
    let nivel: -1 | 0 | 1 = 0;
    if (ponte >= FRACAO_TRECHO * t.L && ponte >= tunel) nivel = 1;
    else if (tunel >= FRACAO_TRECHO * t.L) nivel = -1;
    // as corridas de ponte e de túnel valem por amostra (a rua pode ter só um trecho de viaduto no meio); o resto com mais de
    // 4 m de diferença vira muro de arrimo. Cobrindo ≥ 60% do trecho, o trecho inteiro passa a ser ponte ou túnel.
    let muros = 0, muroMax = 0;
    if (nivel !== 0) classe.fill(nivel === 1 ? Classe.Ponte : Classe.Tunel);
    else for (let i = 0; i < n; i++) if (classe[i] === Classe.Normal && Math.abs(dev[i]) > MURO_MIN_DIF) { classe[i] = Classe.Muro; muros++; muroMax = Math.max(muroMax, Math.abs(dev[i])); }
    if (ponte > 0) resumo.trechosComPonte++;
    if (tunel > 0) resumo.trechosComTunel++;
    trechos.set(e.id, { y, dev, classe, nivel, gradeMax, comprimento: t.L, devMax, falesia: t.falesia, muroMax, alvo });
    if (alvo > GRADE_ALVO) resumo.trechosDeMorro++;
    if (t.falesia) resumo.trechosComFalesia++;
    resumo.maxMuro = Math.max(resumo.maxMuro, muroMax);
    resumo.trechos++;
    if (nivel === 1) resumo.pontes++; else if (nivel === -1) resumo.tuneis++;
    if (muros) { resumo.trechosComMuro++; resumo.amostrasMuro += muros; }
    resumo.gradeMax = Math.max(resumo.gradeMax, gradeMax);
    if (gradeMax > alvo + 0.005) resumo.acima25++;
    if (gradeMax > Math.max(GRADE_TETO, alvo + 0.005)) resumo.acima30++;
    for (let i = 0; i < n; i++) { resumo.maxAterro = Math.max(resumo.maxAterro, dev[i]); resumo.maxCorte = Math.max(resumo.maxCorte, -dev[i]); }
  }
  return { h0: original, nos, trechos, resumo };
}
