/**
 * Unidades territoriais (Fase 26): o município dividido em polígonos de bairro (Censo/IPP) — ou, sem o arquivo do Censo (mapa
 * procedural), em setores de 1 km. Cada célula de 64 m da grade territorial pertence a uma unidade; as facções disputam
 * unidades inteiras, e a grade fina (F/M) diz o quanto cada parte delas é de fato dominada.
 */
import { montarRaster, type BairroCenso } from '../../data/bairros';
import { BUILD_HALF } from '../../world/constants';
import { TERR_CELL, TERR_RES } from '../city/territorio';

export const SEM_UNIDADE = 255;
const CEL_CENSO = 32, META_CENSO = 8192, N_CENSO = (META_CENSO * 2) / CEL_CENSO;

export interface Unidade { id: number; nome: string; cx: number; cz: number; ap: string; ra: string; celulas: number[] }

export class Unidades {
  /** unidade de cada célula da grade territorial (255 = fora de qualquer polígono: mar, outro município) */
  readonly celula = new Uint8Array(TERR_RES * TERR_RES).fill(SEM_UNIDADE);
  readonly lista: Unidade[] = [];
  /** vizinhas de cada unidade (compartilham aresta de célula) */
  readonly vizinhas: number[][] = [];
  readonly fonte: 'censo' | 'setores';

  constructor(bairros: BairroCenso[] | null) {
    if (bairros && bairros.length) {
      this.fonte = 'censo';
      const { raster } = montarRaster(bairros);
      const usados = new Map<number, number>(); // índice do bairro → id da unidade (só os que têm célula no mapa construível)
      for (let j = 0; j < TERR_RES; j++) for (let i = 0; i < TERR_RES; i++) {
        const x = -BUILD_HALF + (i + 0.5) * TERR_CELL, z = -BUILD_HALF + (j + 0.5) * TERR_CELL;
        const ci = Math.floor((x + META_CENSO) / CEL_CENSO), cj = Math.floor((z + META_CENSO) / CEL_CENSO);
        const b = ci < 0 || cj < 0 || ci >= N_CENSO || cj >= N_CENSO ? 0 : raster[cj * N_CENSO + ci];
        if (!b) continue;
        let id = usados.get(b - 1);
        if (id === undefined) {
          id = this.lista.length;
          usados.set(b - 1, id);
          const bc = bairros[b - 1];
          this.lista.push({ id, nome: bc.nome, cx: 0, cz: 0, ap: bc.ap, ra: bc.ra, celulas: [] });
        }
        this.celula[j * TERR_RES + i] = id;
      }
    } else {
      this.fonte = 'setores';
      const lado = 16; // 16 células de 64 m = 1.024 m
      const n = Math.ceil(TERR_RES / lado);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.lista.push({ id: j * n + i, nome: `Setor ${String.fromCharCode(65 + j)}${i + 1}`, cx: 0, cz: 0, ap: '', ra: '', celulas: [] });
      for (let j = 0; j < TERR_RES; j++) for (let i = 0; i < TERR_RES; i++) this.celula[j * TERR_RES + i] = Math.floor(j / lado) * n + Math.floor(i / lado);
    }
    if (this.lista.length > 254) throw new Error('unidades demais para um Uint8Array');
    // células, centros e vizinhas
    const viz = this.lista.map(() => new Set<number>());
    for (let j = 0; j < TERR_RES; j++) for (let i = 0; i < TERR_RES; i++) {
      const k = j * TERR_RES + i, u = this.celula[k];
      if (u === SEM_UNIDADE) continue;
      const L = this.lista[u];
      L.celulas.push(k);
      L.cx += -BUILD_HALF + (i + 0.5) * TERR_CELL; L.cz += -BUILD_HALF + (j + 0.5) * TERR_CELL;
      for (const v of [i < TERR_RES - 1 ? this.celula[k + 1] : SEM_UNIDADE, j < TERR_RES - 1 ? this.celula[k + TERR_RES] : SEM_UNIDADE]) if (v !== SEM_UNIDADE && v !== u) { viz[u].add(v); viz[v].add(u); }
    }
    for (const L of this.lista) { const n = Math.max(1, L.celulas.length); L.cx /= n; L.cz /= n; }
    for (const s of viz) this.vizinhas.push([...s].sort((a, b) => a - b));
  }

  get n() { return this.lista.length; }
  de(x: number, z: number): number {
    const i = Math.floor((x + BUILD_HALF) / TERR_CELL), j = Math.floor((z + BUILD_HALF) / TERR_CELL);
    return i < 0 || j < 0 || i >= TERR_RES || j >= TERR_RES ? SEM_UNIDADE : this.celula[j * TERR_RES + i];
  }
  porNome(nome: string): Unidade | null { return this.lista.find((u) => u.nome === nome) ?? null; }
  /** unidade mais próxima do ponto (para bases em bairros que ficaram fora do mapa) */
  maisPerto(x: number, z: number): Unidade | null {
    let m: Unidade | null = null, d = Infinity;
    for (const u of this.lista) { const dd = (u.cx - x) ** 2 + (u.cz - z) ** 2; if (dd < d) { d = dd; m = u; } }
    return m;
  }
}
