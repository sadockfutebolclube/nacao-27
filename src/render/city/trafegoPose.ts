/**
 * Pose dos veículos do tráfego (Fase 29): lê os dois últimos snapshots do Worker (src/sim/trafegoEstado.ts), interpola a posição ao longo
 * do trecho (`s`) e do deslocamento lateral e põe o veículo sobre o mesmo asfalto das vias (perfil 3D). Quem desenha chama `percorrerTrafego`.
 */
import { alfaTrafego, STRIDE, trafegoEstado } from '../../sim/trafegoEstado';
import { amostrarPerfil } from './perfilVias';
import { perfisAtuais } from './Vias';
import { F } from '../../sim/trafego/trafego';

export interface Pose {
  /** id do veículo no tráfego (estável) */
  id: number;
  x: number; y: number; z: number;
  yaw: number;
  v: number; a: number;
  tipo: number; cor: number; flags: number;
  /** 0 = comum; >0 = índice+1 do rótulo de emergência (trafegoEstado.rotulos) */
  rotulo: number;
  edge: number; dir: 1 | -1;
}

const pose: Pose = { id: 0, x: 0, y: 0, z: 0, yaw: 0, v: 0, a: 0, tipo: 0, cor: 0, flags: 0, rotulo: 0, edge: 0, dir: 1 };
const am = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };

/** Chama `cb` para cada veículo do último snapshot com a pose interpolada (o objeto é reaproveitado: copie o que precisar). */
export function percorrerTrafego(cb: (p: Pose) => void) {
  const e = trafegoEstado, cur = e.curr;
  if (!cur || !perfisAtuais.size) return;
  const prev = e.prev, a = alfaTrafego();
  for (let k = 0; k < cur.n; k++) {
    const o = k * STRIDE, d = cur.dados;
    const chave = d[o + 1];
    const edge = Math.floor(chave / 2), dir: 1 | -1 = chave % 2 === 1 ? -1 : 1;
    const pf = perfisAtuais.get(edge);
    if (!pf) continue;
    let s = d[o + 2], lat = d[o + 3], v = d[o + 4];
    const j = prev ? prev.mapa.get(d[o]) : undefined;
    if (prev && j !== undefined && prev.dados[j * STRIDE + 1] === chave) {
      const q = j * STRIDE;
      s = prev.dados[q + 2] + (s - prev.dados[q + 2]) * a;
      lat = prev.dados[q + 3] + (lat - prev.dados[q + 3]) * a;
      v = prev.dados[q + 4] + (v - prev.dados[q + 4]) * a;
    }
    // s é medido no sentido do link; o perfil, de a para b
    const sp = Math.max(0, Math.min(pf.comprimento, dir > 0 ? s : pf.comprimento - s));
    amostrarPerfil(pf, sp, am);
    // direita no sentido do veículo
    const nx = -am.tz * dir, nz = am.tx * dir;
    pose.id = d[o]; pose.edge = edge; pose.dir = dir;
    pose.x = am.x + nx * lat; pose.z = am.z + nz * lat; pose.y = am.y + 0.02;
    pose.yaw = Math.atan2(am.tx * dir, am.tz * dir);
    pose.v = v; pose.a = d[o + 5]; pose.tipo = d[o + 6]; pose.cor = d[o + 7]; pose.flags = d[o + 8]; pose.rotulo = d[o + 9];
    cb(pose);
  }
}

export { F };
