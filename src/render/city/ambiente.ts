/**
 * Ambiente visual compartilhado (mutável, atualizado 1×/frame): sol físico pela latitude da
 * capital e pelo dia do ano, cores de céu/névoa por hora, fator de noite.
 */
import * as THREE from 'three';

export const ambiente = {
  sol: new THREE.Vector3(0, 1, 0),
  /** seno da altitude solar */
  altSol: 1,
  corSol: new THREE.Color(1, 1, 1),
  intensidadeSol: 3,
  corCeu: new THREE.Color('#9fc4ea'),
  corNevoa: new THREE.Color('#b9cfe0'),
  hemiCeu: new THREE.Color('#bcd4f0'),
  hemiChao: new THREE.Color('#6b5a3c'),
  intensidadeHemi: 0.9,
  /** 0 = dia, 1 = noite plena */
  noite: 0,
  tempo: 0,
  poluicaoAgua: 0.2,
  luzSodio: true,
  /** hora do dia (0–24), guiada pelo relógio visual */
  hora: 15.5,
  /** névoa extra do tempo (chuva, fumaça, calor) */
  densidadeExtra: 0,
};

const rad = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Direção do sol (x=leste, y=cima, z=sul) para latitude (graus), dia do ano e hora solar. */
export function direcaoSolar(latGraus: number, diaDoAno: number, hora: number, out = new THREE.Vector3()): THREE.Vector3 {
  const phi = latGraus * rad;
  const dec = 23.44 * rad * Math.sin(((2 * Math.PI) / 365) * (284 + diaDoAno));
  const H = (hora - 12) * 15 * rad;
  const sinAlt = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(phi)) / Math.max(1e-6, Math.cos(alt) * Math.cos(phi));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (H > 0) az = 2 * Math.PI - az;
  return out.set(Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt));
}

const C = (h: string) => new THREE.Color(h);
const DIA = { ceu: C('#8fbbe8'), nevoa: C('#bfd3e3'), hemi: C('#c6dbf2') };
const DOURADO = { ceu: C('#f2a46b'), nevoa: C('#f0b28a'), hemi: C('#f0b896') };
const NOITE = { ceu: C('#0d1a33'), nevoa: C('#0a1220'), hemi: C('#1b2a4a') };
const SOL_BAIXO = C('#ff8a45');
const SOL_ALTO = C('#fff3e2');
const LUA = C('#8fa6e0');

export function atualizarAmbiente(lat: number, diaDoAno: number, hora: number) {
  ambiente.hora = hora;
  direcaoSolar(lat, diaDoAno, hora, ambiente.sol);
  const e = ambiente.sol.y;
  ambiente.altSol = e;
  ambiente.noite = smooth(0.06, -0.14, e);
  const dourado = smooth(0.42, 0.06, e) * (1 - ambiente.noite);
  const dia = 1 - ambiente.noite;

  ambiente.corCeu.copy(NOITE.ceu).lerp(DIA.ceu, dia).lerp(DOURADO.ceu, dourado * 0.8);
  ambiente.corNevoa.copy(NOITE.nevoa).lerp(DIA.nevoa, dia).lerp(DOURADO.nevoa, dourado * 0.75);
  ambiente.hemiCeu.copy(NOITE.hemi).lerp(DIA.hemi, dia).lerp(DOURADO.hemi, dourado * 0.6);
  ambiente.intensidadeHemi = 0.22 + 0.75 * dia;

  if (e > -0.02) {
    ambiente.corSol.copy(SOL_BAIXO).lerp(SOL_ALTO, smooth(0.02, 0.5, e));
    ambiente.intensidadeSol = 3.4 * smooth(-0.02, 0.16, e);
  } else {
    ambiente.corSol.copy(LUA);
    ambiente.intensidadeSol = 0.32 * smooth(-0.02, -0.2, e);
  }
}

/** Direção da luz principal: sol de dia, lua (oposta) à noite. */
export function direcaoLuz(out: THREE.Vector3): THREE.Vector3 {
  if (ambiente.sol.y > -0.02) return out.copy(ambiente.sol).setY(Math.max(ambiente.sol.y, 0.04)).normalize();
  return out.set(-ambiente.sol.x * 0.6, 0.75, -ambiente.sol.z * 0.6 + 0.3).normalize();
}

export function diaDoAno(dia: number, mes: number): number {
  const acum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return acum[mes - 1] + dia;
}
