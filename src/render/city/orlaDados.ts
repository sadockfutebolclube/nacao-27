/**
 * Geometria da orla (Fase 31), lida do RELEVO (não de números mágicos): para cada praia de `pontos.json` (eixo em lat/lon) acha, a cada
 * ~12 m, a linha da água (o primeiro ponto abaixo de 0,1 m caminhando para o mar), a normal para o mar e a largura da areia seca. Daí
 * saem, de forma determinística, os quiosques (com nome e dono sorteados), as redes de vôlei e os postos de salva-vidas. Funções puras
 * sobre o heightmap: o desenho (Orla.tsx) e as fichas de clique (entidades/contexto.ts) usam as mesmas posições.
 */
import type { CidadeReal } from '../../data/cidadeReal';
import { projetar } from '../../world/cidadeReal';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { TURISMO } from '../../world/turismo';
import { ocupado } from './ocupacaoSolo';

export interface AmostraCosta {
  /** ponto da linha da água */
  x: number; z: number;
  /** normal unitária apontando para o mar */
  nx: number; nz: number;
  /** largura da areia seca (m) entre a água e o calçadão */
  areia: number;
  /** distância ao longo da praia (m) desde a ponta de partida */
  s: number;
}
export interface Quiosque { id: number; x: number; z: number; yaw: number; nome: string; praia: string }
export interface RedeVolei { x: number; z: number; yaw: number; praia: string }
export interface Posto { x: number; z: number; yaw: number; numero: number; praia: string }
export interface DadosOrla { costa: Record<string, AmostraCosta[]>; quiosques: Quiosque[]; redes: RedeVolei[]; postos: Posto[] }

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const DIRS = Array.from({ length: 24 }, (_, k) => [Math.cos((k / 24) * Math.PI * 2), Math.sin((k / 24) * Math.PI * 2)] as const);

function costaDe(hm: Heightmap, real: CidadeReal, eixo: readonly (readonly [number, number])[]): AmostraCosta[] {
  const pts = eixo.map(([la, lo]) => projetar(real, la, lo));
  const out: AmostraCosta[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 12));
    for (let k = 0; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      // o ponto do eixo pode estar na areia (procura a água) ou já no mar (procura a terra e inverte)
      const emAgua = sampleHeight(hm, x, z) < 0.1;
      let melhor = Infinity, dx = 0, dz = 0;
      for (const [ux, uz] of DIRS) {
        for (let d = 0; d < 400 && d < melhor; d += 4) {
          const y = sampleHeight(hm, x + ux * d, z + uz * d);
          if (emAgua ? y > 0.6 : y < 0.1) { melhor = d; dx = emAgua ? -ux : ux; dz = emAgua ? -uz : uz; break; }
        }
      }
      if (!isFinite(melhor) || melhor > 380) { acc += L / n; continue; }
      // linha da água em passos de 1 m, a partir da posição (x, z) deslocada para o ponto de cruzamento
      let sx = x + (emAgua ? -dx : dx) * melhor, sz = z + (emAgua ? -dz : dz) * melhor;
      if (emAgua) { let q = 0; while (q < 20 && sampleHeight(hm, sx + dx * q, sz + dz * q) >= 0.1) q++; sx += dx * q; sz += dz * q; }
      else { let q = 0; while (q < 6 && sampleHeight(hm, sx - dx * q, sz - dz * q) < 0.1) q++; sx -= dx * q; sz -= dz * q; }
      // largura da areia: para dentro, enquanto a cota fica abaixo de 4,8 m
      let w = 0;
      while (w < 130) { const y = sampleHeight(hm, sx - dx * w, sz - dz * w); if (y > 4.8) break; w += 2; }
      out.push({ x: sx, z: sz, nx: dx, nz: dz, areia: w, s: acc });
      acc += L / n;
    }
  }
  // suaviza as normais com os vizinhos (a água de um grid de 10 m tem degraus)
  for (let pass = 0; pass < 3; pass++) for (let i = 1; i + 1 < out.length; i++) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const nx = a.nx + 2 * b.nx + c.nx, nz = a.nz + 2 * b.nz + c.nz, l = Math.hypot(nx, nz) || 1;
    b.nx = nx / l; b.nz = nz / l;
  }
  return out;
}

/** Recua do fundo para o mar (de 4 em 4 m) até achar um lugar sem prédio: devolve [x, z] a `d` m da água ou null. */
function livre(a: AmostraCosta, d0: number, folga = 3): [number, number] | null {
  for (let d = d0; d >= 6; d -= 4) {
    const x = a.x - a.nx * d, z = a.z - a.nz * d;
    if (!ocupado(x, z, folga)) return [x, z];
  }
  return null;
}

const cache = new WeakMap<Heightmap, DadosOrla>();

/** Costa, quiosques, redes e postos de todas as praias do arquivo (calculados uma vez por relevo). */
export function dadosDaOrla(hm: Heightmap, real: CidadeReal): DadosOrla {
  let r = cache.get(hm);
  if (r) return r;
  const costa: Record<string, AmostraCosta[]> = {};
  const quiosques: Quiosque[] = [], redes: RedeVolei[] = [], postos: Posto[] = [];
  let idQ = 0;
  for (const [id, cfg] of Object.entries(TURISMO.orla.praias)) {
    const c = costaDe(hm, real, cfg.eixo);
    costa[id] = c;
    if (c.length < 4) continue;
    const comp = c[c.length - 1].s - c[0].s, km = comp / 1000;
    const nomes = TURISMO.orla.quiosques.nomes;
    // quiosques no fundo da areia (a 85% da largura, entre 14 e 70 m da água), virados para o mar
    const nq = Math.max(1, Math.round(cfg.quiosquesPorKm * km));
    for (let k = 0; k < nq; k++) {
      const a = c[Math.min(c.length - 1, Math.floor(((k + 0.5) / nq) * c.length))];
      const d = Math.min(70, Math.max(14, a.areia * 0.85)), lv = livre(a, d, 4);
      if (!lv) continue;
      quiosques.push({ id: idQ, x: lv[0], z: lv[1], yaw: Math.atan2(a.nx, a.nz), nome: `${nomes[(idQ + (id.length * 3)) % nomes.length]}${idQ >= nomes.length ? ` ${Math.floor(idQ / nomes.length) + 1}` : ''}`, praia: id });
      idQ++;
    }
    // redes de vôlei no meio da areia, paralelas à linha da água
    const nv = Math.max(1, Math.round(cfg.voleiPorKm * km));
    for (let k = 0; k < nv; k++) {
      const a = c[Math.min(c.length - 1, Math.floor(((k + 0.3 + hash(k, 3) * 0.4) / nv) * c.length))];
      if (a.areia < 24) continue;
      const d = Math.min(40, a.areia * 0.5), lv = livre(a, d, 8);
      if (!lv) continue;
      redes.push({ x: lv[0], z: lv[1], yaw: Math.atan2(-a.nz, a.nx), praia: id });
    }
    // postos de salva-vidas (a cada ~330 m), a 60% da areia
    const np = Math.max(1, Math.round(cfg.postosPorKm * km));
    for (let k = 0; k < np; k++) {
      const a = c[Math.min(c.length - 1, Math.floor(((k + 0.5) / np) * c.length))];
      const d = Math.min(45, Math.max(8, a.areia * 0.6)), lv = livre(a, d, 3);
      if (!lv) continue;
      postos.push({ x: lv[0], z: lv[1], yaw: Math.atan2(a.nx, a.nz), numero: postos.length + 1, praia: id });
    }
  }
  r = { costa, quiosques, redes, postos };
  cache.set(hm, r);
  return r;
}
