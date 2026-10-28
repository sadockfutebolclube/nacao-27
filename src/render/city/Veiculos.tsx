/**
 * Amostra visual do tráfego (LOD de simulação): sedãs, hatches, táxis, utilitários (VUC), ônibus
 * urbanos e motos com piloto (e baú de entrega) andando pela malha, com faróis e lanternas à noite.
 * Modelos low-poly procedurais (perfil lateral extrudado + vidros, rodas, para-choques, lanternas)
 * mesclados numa geometria por tipo; a cor da lataria vem da instância e o resto (vidro, pneu,
 * plástico) é cor fixa por vértice (atributo `aPinta` decide quem recebe a cor da instância).
 * A quantidade acompanha população e empregos simulados.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { enviarTrafego, mundo, useGame } from '../../sim/bridge';
import { F } from '../../sim/trafego/trafego';
import { ambiente } from './ambiente';
import { onibusEstado } from './onibusEstado';
import { mergeGeos } from './Vias';
import { alvoCamera } from './Camera';
import { registro } from '../../entidades/registro';
import { percorrerTrafego } from './trafegoPose';
import frota from '../../data/veiculos/frota.json';
import { carregarVeiculoReal, type VeiculoReal } from '../modelos/veiculoReal';
import { trafegoEstado } from '../../sim/trafegoEstado';

const MAX = 700;
/** dev: window.__n27trafego.dev.alvo = 1500 força mais veículos (engarrafamento para teste) */
const devTrafego = { alvo: 0 };

/**
 * 0 sedã · 1 ônibus · 2 moto · 3 hatch · 4 táxi · 5 utilitário/caminhão leve
 * Fase 16: 6 SUV · 7 picape · 8 van · 9 BRT articulado · 10 viatura da PM · 11 caminhão da Comlurb
 */
type Tipo = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
const TIPOS = 12;
/** veículos grandes: andam na faixa da direita e não dividem a pista como um carro */
export const GRANDES = new Set<number>([1, 5, 8, 9, 11]);

const paleta = (cs: string[]) => cs.map((c) => new THREE.Color(c));
/** Paleta dos carros de passeio no Brasil: branco, prata, preto e cinza dominam (cada cor repetida = mais comum); poucas cores vivas */
const BR = ['#f2f2ee', '#f2f2ee', '#f2f2ee', '#e8e8e8', '#e8e8e8', '#c9ccd1', '#c9ccd1', '#c9ccd1', '#8f969c', '#8f969c', '#5a5f63', '#1b1b1e', '#1b1b1e', '#1b1b1e', '#2b2d30', '#b0262b', '#1d3f73', '#7a2030'];
const CORES: Record<Tipo, THREE.Color[]> = {
  0: paleta(BR),
  1: paleta(['#f2f2ee', '#e0b030', '#2f6db5', '#c8302a', '#3a8a4a', '#f08a24', '#f2f2ee', '#8a8f96']),
  2: paleta(['#c8202a', '#1b1b1e', '#f2f2ee', '#1d3f73', '#e0b030', '#c8202a']),
  3: paleta(BR),
  4: paleta(['#f2c418', '#f4f4f0', '#f2c418']),
  5: paleta(['#f2f2ee', '#c8302a', '#1d3f73', '#5a5f63', '#e8e8e8', '#2f6db5']),
  6: paleta(BR),
  7: paleta(BR),
  8: paleta(['#f2f2ee', '#e8e8e8', '#c9ccd1', '#2f6db5', '#f2f2ee']),
  9: paleta(['#c42b2b']),
  10: paleta(['#1b3a73']),
  11: paleta(['#f08a24']),
};

/** Posição das luzes por tipo: frente (z), traseira (z), altura, largura relativa da barra. */
const LUZES: Record<Tipo, { f: number; t: number; y: number; l: number }> = {
  0: { f: 2.24, t: -2.24, y: 0.66, l: 1 },
  1: { f: 6.08, t: -6.08, y: 0.75, l: 1.6 },
  2: { f: 0.8, t: -1.0, y: 0.95, l: 0.3 },
  3: { f: 1.98, t: -1.98, y: 0.7, l: 0.98 },
  4: { f: 2.24, t: -2.24, y: 0.66, l: 1 },
  5: { f: 3.36, t: -3.2, y: 0.85, l: 1.4 },
  6: { f: 2.3, t: -2.32, y: 0.78, l: 1.05 },
  7: { f: 2.46, t: -2.55, y: 0.78, l: 1.05 },
  8: { f: 2.52, t: -2.52, y: 0.8, l: 1.1 },
  9: { f: 9.08, t: -9.08, y: 0.8, l: 1.6 },
  10: { f: 2.24, t: -2.24, y: 0.66, l: 1 },
  11: { f: 3.36, t: -3.3, y: 0.85, l: 1.4 },
};

/**
 * Frota do Rio (Fase 16): numa avenida há mais ônibus e táxis e, com 4 faixas ou mais, o BRT; nas ruas, mais
 * motos, vans e picapes. `r` é um sorteio de 0 a 1.
 */
export function sortearTipo(r: number, avenida: boolean, faixas: number, semOnibus = false): Tipo {
  const completa: [Tipo, number][] = avenida
    ? [[1, 0.14], [9, faixas >= 4 ? 0.05 : 0], [4, 0.1], [2, 0.14], [5, 0.04], [8, 0.03], [7, 0.05], [10, 0.012], [11, 0.01], [6, 0.12], [3, 0.14]]
    : [[1, 0.04], [4, 0.06], [2, 0.2], [5, 0.05], [8, 0.05], [7, 0.07], [10, 0.012], [11, 0.015], [6, 0.12], [3, 0.2]];
  // Fase 17: com as linhas reais carregadas, os ônibus e o BRT vêm do GTFS (Onibus.tsx), não do sorteio
  const tabela = semOnibus ? completa.filter(([t]) => t !== 1 && t !== 9) : completa;
  let acum = 0;
  for (const [t, p] of tabela) { acum += p; if (r < acum) return t; }
  return 0;
}

/** largura × altura × comprimento (m) de cada tipo, para a caixa do clique */
const DIM: Record<number, [number, number, number]> = { 0: [1.8, 1.5, 4.5], 1: [2.5, 3.1, 12.2], 2: [0.8, 1.5, 1.9], 3: [1.7, 1.5, 4], 4: [1.8, 1.5, 4.5], 5: [2, 2.6, 6.6], 6: [1.9, 1.7, 4.6], 7: [1.9, 1.8, 5], 8: [2, 2.3, 5], 9: [2.55, 3.1, 18.2], 10: [1.9, 1.8, 5], 11: [2.5, 3.2, 7.5] };

// ── geometria ────────────────────────────────────────────────────────────────

// cores fixas em espaço linear (o renderizador converte para sRGB na saída)
type RGB = [number, number, number];
const BRANCO: RGB = [1, 1, 1];
const VIDRO: RGB = [0.02, 0.03, 0.045];
const PLASTICO: RGB = [0.03, 0.03, 0.035];
const PNEU: RGB = [0.015, 0.015, 0.016];
const CALOTA: RGB = [0.5, 0.52, 0.55];
const FAROL: RGB = [0.95, 0.93, 0.82];
const LANTERNA: RGB = [0.55, 0.03, 0.02];
const JEANS: RGB = [0.04, 0.07, 0.16];
const JAQUETA: RGB = [0.03, 0.03, 0.035];

interface Parte {
  g: THREE.BufferGeometry;
  cor: RGB;
  /** recebe a cor da instância (lataria) */
  pinta?: boolean;
  /** 1 = vidro iluminado por dentro à noite; 2 = letreiro aceso */
  brilho?: number;
  /** cor por vértice (sobrepõe `cor`) */
  corV?: (x: number, y: number, z: number) => RGB;
}

const caixa = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Silhueta lateral (x = comprimento, y = altura) extrudada na largura, centrada em x=0. */
function perfil(pts: [number, number][], largura: number): THREE.BufferGeometry {
  const forma = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  // Fase 12: quina arredondada (chanfro de 6 cm) para o reflexo correr pela lataria
  const ch = Math.min(0.06, largura * 0.05);
  const g = new THREE.ExtrudeGeometry(forma, { depth: largura - 2 * ch, bevelEnabled: true, bevelThickness: ch, bevelSize: ch * 0.6, bevelOffset: -ch * 0.6, bevelSegments: 2, steps: 1 });
  g.rotateY(-Math.PI / 2); // x da forma → z do mundo (frente = +z), extrusão → −x
  g.translate(largura / 2 - ch, 0, 0);
  g.computeVertexNormals();
  return g;
}

/** Roda com eixo em X: pneu escuro e calota clara no centro das tampas (14 lados). */
function roda(r: number, w: number, x: number, y: number, z: number): Parte {
  const g = new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2).translate(x, y, z);
  return { g, cor: PNEU, corV: (_x, vy, vz) => (Math.hypot(vy - y, vz - z) < r * 0.3 ? CALOTA : PNEU) };
}

/** Acabamento PBR por vértice: 0 pintura com verniz · 1 vidro · 2 borracha/plástico · 3 cromado · 4 lente de farol · 5 fosco. */
function acabamento(p: Parte, c: RGB): number {
  if (p.pinta) return 0;
  if (c === VIDRO) return 1;
  if (c === PNEU || c === PLASTICO || c === JEANS || c === JAQUETA) return 2;
  if (c === CALOTA) return 3;
  if (c === FAROL || c === LANTERNA) return 4;
  return 5;
}

/** Mescla as partes e grava `color` (cor fixa), `aPinta` (cor da instância), `aBrilho` e `aAcab`. */
function montar(partes: Parte[]): THREE.BufferGeometry {
  const geo = mergeGeos(partes.map((p) => p.g));
  const n = geo.getAttribute('position').count;
  const cor = new Float32Array(n * 3), pinta = new Float32Array(n), brilho = new Float32Array(n), acab = new Float32Array(n);
  let k = 0;
  for (const p of partes) {
    const pos = p.g.getAttribute('position');
    for (let i = 0; i < pos.count; i++, k++) {
      const c = p.corV ? p.corV(pos.getX(i), pos.getY(i), pos.getZ(i)) : p.cor;
      cor[k * 3] = c[0]; cor[k * 3 + 1] = c[1]; cor[k * 3 + 2] = c[2];
      pinta[k] = p.pinta ? 1 : 0;
      brilho[k] = p.brilho ?? 0;
      acab[k] = acabamento(p, c);
    }
    p.g.dispose();
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  geo.setAttribute('aPinta', new THREE.BufferAttribute(pinta, 1));
  geo.setAttribute('aBrilho', new THREE.BufferAttribute(brilho, 1));
  geo.setAttribute('aAcab', new THREE.BufferAttribute(acab, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** Sedã (~250 tri); com `taxi`, ganha o luminoso “TÁXI” no teto. */
export function geoSedan(taxi: boolean) {
  const partes: Parte[] = [
    { g: perfil([[-2.2, 0.32], [2.2, 0.32], [2.26, 0.6], [2.1, 0.8], [0.85, 0.96], [-1.55, 0.99], [-2.15, 0.93], [-2.27, 0.62]], 1.78), cor: BRANCO, pinta: true },
    { g: perfil([[0.9, 0.95], [-1.5, 0.97], [-1.2, 1.4], [0.22, 1.42]], 1.6), cor: VIDRO },
    { g: perfil([[-1.26, 1.38], [0.28, 1.38], [0.2, 1.48], [-1.18, 1.48]], 1.64), cor: BRANCO, pinta: true },
    { g: caixa(1.84, 0.2, 0.14, 0, 0.42, 2.24), cor: PLASTICO },
    { g: caixa(1.84, 0.2, 0.14, 0, 0.42, -2.25), cor: PLASTICO },
    { g: caixa(0.38, 0.12, 0.08, 0.58, 0.68, 2.19), cor: FAROL },
    { g: caixa(0.38, 0.12, 0.08, -0.58, 0.68, 2.19), cor: FAROL },
    { g: caixa(0.36, 0.13, 0.08, 0.6, 0.75, -2.21), cor: LANTERNA },
    { g: caixa(0.36, 0.13, 0.08, -0.6, 0.75, -2.21), cor: LANTERNA },
    roda(0.33, 0.24, 0.8, 0.33, 1.38), roda(0.33, 0.24, -0.8, 0.33, 1.38),
    roda(0.33, 0.24, 0.8, 0.33, -1.35), roda(0.33, 0.24, -0.8, 0.33, -1.35),
  ];
  if (taxi) {
    partes.push({ g: caixa(0.62, 0.18, 0.26, 0, 1.57, -0.5), cor: [1, 0.97, 0.85], brilho: 2 });
    // faixa azul nas portas (o táxi comum do Rio é amarelo com faixa azul)
    for (const lado of [-1, 1]) partes.push({ g: caixa(0.02, 0.17, 2.7, lado * 0.9, 0.72, 0), cor: [0.04, 0.17, 0.62] });
  }
  return montar(partes);
}

/** Viatura da PM (Fase 16): sedã azul com a faixa branca nas portas e a barra de luz vermelha e azul no teto. */
export function geoViatura() {
  const partes: Parte[] = [
    { g: perfil([[-2.2, 0.32], [2.2, 0.32], [2.26, 0.6], [2.1, 0.8], [0.85, 0.96], [-1.55, 0.99], [-2.15, 0.93], [-2.27, 0.62]], 1.78), cor: BRANCO, pinta: true },
    { g: perfil([[0.9, 0.95], [-1.5, 0.97], [-1.2, 1.4], [0.22, 1.42]], 1.6), cor: VIDRO },
    { g: perfil([[-1.26, 1.38], [0.28, 1.38], [0.2, 1.48], [-1.18, 1.48]], 1.64), cor: BRANCO, pinta: true },
    { g: caixa(1.84, 0.2, 0.14, 0, 0.42, 2.24), cor: PLASTICO },
    { g: caixa(1.84, 0.2, 0.14, 0, 0.42, -2.25), cor: PLASTICO },
    { g: caixa(0.38, 0.12, 0.08, 0.58, 0.68, 2.19), cor: FAROL },
    { g: caixa(0.38, 0.12, 0.08, -0.58, 0.68, 2.19), cor: FAROL },
    { g: caixa(0.36, 0.13, 0.08, 0.6, 0.75, -2.21), cor: LANTERNA },
    { g: caixa(0.36, 0.13, 0.08, -0.6, 0.75, -2.21), cor: LANTERNA },
    roda(0.33, 0.24, 0.8, 0.33, 1.38), roda(0.33, 0.24, -0.8, 0.33, 1.38),
    roda(0.33, 0.24, 0.8, 0.33, -1.35), roda(0.33, 0.24, -0.8, 0.33, -1.35),
    { g: caixa(0.5, 0.13, 0.3, 0.25, 1.6, -0.45), cor: [0.05, 0.2, 1], brilho: 2 },
    { g: caixa(0.5, 0.13, 0.3, -0.25, 1.6, -0.45), cor: [1, 0.05, 0.05], brilho: 2 },
  ];
  for (const lado of [-1, 1]) partes.push({ g: caixa(0.02, 0.32, 2.4, lado * 0.9, 0.7, 0), cor: [0.93, 0.93, 0.92] });
  return montar(partes);
}

/** SUV (Fase 16): mais alto e mais comprido que o sedã. */
export function geoSuv() {
  return montar([
    { g: perfil([[-2.25, 0.38], [2.25, 0.38], [2.3, 0.72], [2.15, 0.96], [0.9, 1.1], [-2.2, 1.12], [-2.3, 0.75]], 1.9), cor: BRANCO, pinta: true },
    { g: perfil([[0.95, 1.05], [-2.15, 1.08], [-2.0, 1.62], [0.35, 1.64]], 1.74), cor: VIDRO },
    { g: perfil([[-2.05, 1.58], [0.4, 1.58], [0.32, 1.72], [-2.0, 1.72]], 1.78), cor: BRANCO, pinta: true },
    { g: caixa(1.94, 0.24, 0.14, 0, 0.48, 2.3), cor: PLASTICO },
    { g: caixa(1.94, 0.24, 0.14, 0, 0.48, -2.33), cor: PLASTICO },
    { g: caixa(0.4, 0.13, 0.08, 0.62, 0.78, 2.25), cor: FAROL },
    { g: caixa(0.4, 0.13, 0.08, -0.62, 0.78, 2.25), cor: FAROL },
    { g: caixa(0.2, 0.34, 0.08, 0.75, 0.9, -2.3), cor: LANTERNA },
    { g: caixa(0.2, 0.34, 0.08, -0.75, 0.9, -2.3), cor: LANTERNA },
    roda(0.38, 0.27, 0.86, 0.38, 1.42), roda(0.38, 0.27, -0.86, 0.38, 1.42),
    roda(0.38, 0.27, 0.86, 0.38, -1.4), roda(0.38, 0.27, -0.86, 0.38, -1.4),
  ]);
}

/** Picape (Fase 16): cabine na frente e caçamba aberta atrás. */
function geoPicape() {
  return montar([
    { g: perfil([[-0.3, 0.4], [2.4, 0.4], [2.45, 0.74], [2.25, 0.96], [0.8, 1.04], [0.35, 1.5], [-0.3, 1.52]], 1.9), cor: BRANCO, pinta: true },
    { g: perfil([[0.75, 1.02], [-0.25, 1.04], [-0.25, 1.48], [0.38, 1.48]], 1.76), cor: VIDRO },
    { g: caixa(1.9, 0.55, 2.4, 0, 0.78, -1.5), cor: BRANCO, pinta: true },
    { g: caixa(1.68, 0.06, 2.2, 0, 1.06, -1.5), cor: PLASTICO },
    { g: caixa(1.94, 0.22, 0.14, 0, 0.46, 2.45), cor: PLASTICO },
    { g: caixa(1.94, 0.22, 0.14, 0, 0.46, -2.7), cor: PLASTICO },
    { g: caixa(0.4, 0.13, 0.08, 0.62, 0.76, 2.4), cor: FAROL },
    { g: caixa(0.4, 0.13, 0.08, -0.62, 0.76, 2.4), cor: FAROL },
    { g: caixa(0.2, 0.3, 0.08, 0.82, 0.9, -2.66), cor: LANTERNA },
    { g: caixa(0.2, 0.3, 0.08, -0.82, 0.9, -2.66), cor: LANTERNA },
    roda(0.37, 0.26, 0.86, 0.37, 1.55), roda(0.37, 0.26, -0.86, 0.37, 1.55),
    roda(0.37, 0.26, 0.86, 0.37, -1.6), roda(0.37, 0.26, -0.86, 0.37, -1.6),
  ]);
}

/** Van de passageiros/carga (Fase 16). */
export function geoVan() {
  return montar([
    { g: caixa(2.0, 1.55, 5.0, 0, 1.2, 0), cor: BRANCO, pinta: true },
    { g: perfil([[2.5, 0.42], [2.5, 0.8], [2.35, 1.25], [2.2, 1.3], [2.2, 0.42]], 1.98), cor: BRANCO, pinta: true },
    { g: caixa(1.78, 0.62, 0.06, 0, 1.55, 2.52), cor: VIDRO },
    { g: caixa(2.02, 0.5, 3.2, 0, 1.75, -0.4), cor: VIDRO, brilho: 1 },
    { g: caixa(2.04, 0.22, 0.14, 0, 0.48, 2.55), cor: PLASTICO },
    { g: caixa(2.04, 0.22, 0.14, 0, 0.48, -2.55), cor: PLASTICO },
    { g: caixa(0.36, 0.14, 0.08, 0.7, 0.84, 2.53), cor: FAROL },
    { g: caixa(0.36, 0.14, 0.08, -0.7, 0.84, 2.53), cor: FAROL },
    { g: caixa(0.2, 0.4, 0.08, 0.9, 1.0, -2.52), cor: LANTERNA },
    { g: caixa(0.2, 0.4, 0.08, -0.9, 1.0, -2.52), cor: LANTERNA },
    roda(0.37, 0.25, 0.9, 0.37, 1.6), roda(0.37, 0.25, -0.9, 0.37, 1.6),
    roda(0.37, 0.25, 0.9, 0.37, -1.5), roda(0.37, 0.25, -0.9, 0.37, -1.5),
  ]);
}

/** BRT articulado (Fase 16): dois corpos de 8,3 m ligados por um fole, janelas contínuas e luz de letreiro. */
export function geoBrt() {
  const partes: Parte[] = [];
  for (const [z, c] of [[4.6, 1], [-4.6, 0]] as const) {
    partes.push({ g: caixa(2.5, 2.7, 8.3, 0, 1.75, z), cor: BRANCO, pinta: true });
    partes.push({ g: caixa(2.54, 1.0, 8.1, 0, 2.15, z), cor: VIDRO, brilho: 1 });
    partes.push({ g: caixa(2.52, 0.4, 8.2, 0, 0.7, z), cor: [0.3, 0.3, 0.3], pinta: true });
    partes.push({ g: caixa(1.5, 0.3, 3.4, 0, 3.25, z), cor: [0.82, 0.83, 0.84] });
    partes.push(roda(0.52, 0.4, 1.05, 0.52, z + (c ? 2.4 : 2.2)), roda(0.52, 0.4, -1.05, 0.52, z + (c ? 2.4 : 2.2)));
    partes.push(roda(0.52, 0.4, 1.05, 0.52, z - (c ? 2.4 : 2.2)), roda(0.52, 0.4, -1.05, 0.52, z - (c ? 2.4 : 2.2)));
  }
  partes.push({ g: caixa(2.3, 2.4, 1.1, 0, 1.6, 0), cor: [0.08, 0.08, 0.09] });
  partes.push({ g: caixa(1.8, 0.28, 0.06, 0, 2.65, 9.0), cor: [1, 0.62, 0.1], brilho: 2 });
  partes.push({ g: caixa(2.54, 0.3, 0.14, 0, 0.5, 9.05), cor: PLASTICO }, { g: caixa(2.54, 0.3, 0.14, 0, 0.5, -9.05), cor: PLASTICO });
  partes.push({ g: caixa(0.3, 0.2, 0.06, 0.95, 0.78, -9.07), cor: LANTERNA }, { g: caixa(0.3, 0.2, 0.06, -0.95, 0.78, -9.07), cor: LANTERNA });
  return montar(partes);
}

/** Caminhão de lixo da Comlurb (Fase 16): cabine e compactador laranja, caçamba traseira escura. */
export function geoLixo() {
  return montar([
    { g: perfil([[1.9, 0.5], [3.3, 0.5], [3.3, 2.25], [3.12, 2.42], [1.9, 2.42]], 2.1), cor: BRANCO, pinta: true },
    { g: caixa(2.12, 0.68, 0.92, 0, 1.82, 2.86), cor: VIDRO },
    { g: caixa(2.3, 2.3, 5.2, 0, 1.75, -0.7), cor: BRANCO, pinta: true },
    { g: new THREE.CylinderGeometry(1.0, 1.0, 5.0, 10).rotateX(Math.PI / 2).translate(0, 3.0, -0.7), cor: BRANCO, pinta: true },
    { g: caixa(2.1, 0.7, 0.8, 0, 0.95, -3.4), cor: PLASTICO },
    { g: caixa(1.5, 0.3, 6.3, 0, 0.62, 0.1), cor: PLASTICO },
    { g: caixa(2.14, 0.25, 0.15, 0, 0.6, 3.33), cor: PLASTICO },
    { g: caixa(0.32, 0.16, 0.06, 0.78, 0.85, 3.31), cor: FAROL },
    { g: caixa(0.32, 0.16, 0.06, -0.78, 0.85, 3.31), cor: FAROL },
    { g: caixa(0.3, 0.14, 0.06, 0.95, 0.8, -3.32), cor: LANTERNA },
    { g: caixa(0.3, 0.14, 0.06, -0.95, 0.8, -3.32), cor: LANTERNA },
    { g: caixa(0.5, 0.12, 0.22, 0, 2.55, 3.0), cor: [1, 0.6, 0.05], brilho: 2 },
    roda(0.45, 0.3, 0.92, 0.45, 2.55), roda(0.45, 0.3, -0.92, 0.45, 2.55),
    roda(0.45, 0.5, 0.85, 0.45, -1.9), roda(0.45, 0.5, -0.85, 0.45, -1.9),
  ]);
}

/** Hatch compacto (~250 tri): traseira quase vertical. */
function geoHatch() {
  return montar([
    { g: perfil([[-1.95, 0.32], [1.95, 0.32], [2.0, 0.6], [1.85, 0.8], [0.7, 0.96], [-1.9, 0.99], [-2.0, 0.62]], 1.74), cor: BRANCO, pinta: true },
    { g: perfil([[0.75, 0.95], [-1.86, 0.97], [-1.78, 1.42], [0.05, 1.44]], 1.56), cor: VIDRO },
    { g: perfil([[-1.84, 1.38], [0.1, 1.38], [0.02, 1.49], [-1.8, 1.49]], 1.6), cor: BRANCO, pinta: true },
    { g: caixa(1.8, 0.2, 0.14, 0, 0.42, 2.0), cor: PLASTICO },
    { g: caixa(1.8, 0.2, 0.14, 0, 0.42, -2.0), cor: PLASTICO },
    { g: caixa(0.36, 0.12, 0.08, 0.57, 0.68, 1.93), cor: FAROL },
    { g: caixa(0.36, 0.12, 0.08, -0.57, 0.68, 1.93), cor: FAROL },
    { g: caixa(0.18, 0.3, 0.08, 0.72, 0.85, -1.95), cor: LANTERNA },
    { g: caixa(0.18, 0.3, 0.08, -0.72, 0.85, -1.95), cor: LANTERNA },
    roda(0.31, 0.22, 0.78, 0.31, 1.25), roda(0.31, 0.22, -0.78, 0.31, 1.25),
    roda(0.31, 0.22, 0.78, 0.31, -1.25), roda(0.31, 0.22, -0.78, 0.31, -1.25),
  ]);
}

/** Utilitário/VUC (~220 tri): cabine pintada, baú de carga claro, rodado duplo atrás. */
export function geoCaminhao() {
  return montar([
    { g: perfil([[1.9, 0.5], [3.3, 0.5], [3.3, 2.25], [3.12, 2.42], [1.9, 2.42]], 2.1), cor: BRANCO, pinta: true },
    { g: caixa(2.12, 0.68, 0.92, 0, 1.82, 2.86), cor: VIDRO },
    { g: caixa(2.3, 2.5, 5.0, 0, 1.9, -0.65), cor: [0.9, 0.9, 0.88] },
    { g: caixa(1.5, 0.3, 6.3, 0, 0.62, 0.1), cor: PLASTICO },
    { g: caixa(2.14, 0.25, 0.15, 0, 0.6, 3.33), cor: PLASTICO },
    { g: caixa(0.32, 0.16, 0.06, 0.78, 0.85, 3.31), cor: FAROL },
    { g: caixa(0.32, 0.16, 0.06, -0.78, 0.85, 3.31), cor: FAROL },
    { g: caixa(0.3, 0.14, 0.06, 0.95, 0.8, -3.17), cor: LANTERNA },
    { g: caixa(0.3, 0.14, 0.06, -0.95, 0.8, -3.17), cor: LANTERNA },
    roda(0.45, 0.3, 0.92, 0.45, 2.55), roda(0.45, 0.3, -0.92, 0.45, 2.55),
    roda(0.45, 0.5, 0.85, 0.45, -1.9), roda(0.45, 0.5, -0.85, 0.45, -1.9),
  ]);
}

/** Ônibus urbano (~300 tri): faixa de janelas com colunas (acesa à noite), saia mais escura, letreiro, ar-condicionado. */
export function geoOnibus() {
  return montar([
    { g: perfil([[-6, 0.38], [6, 0.38], [6.05, 1.0], [6.02, 2.9], [5.8, 3.2], [-5.85, 3.2], [-6.02, 2.95]], 2.5), cor: BRANCO, pinta: true },
    { g: caixa(2.54, 1.05, 12.12, 0, 2.08, 0), cor: VIDRO, brilho: 1 },
    { g: caixa(2.53, 0.32, 12.08, 0, 0.78, 0), cor: [0.3, 0.3, 0.3], pinta: true },
    { g: caixa(1.7, 0.28, 0.06, 0, 2.85, 6.04), cor: [1, 0.62, 0.1], brilho: 2 },
    { g: caixa(1.6, 0.25, 2.5, 0, 3.32, -1), cor: [0.82, 0.83, 0.84] },
    // colunas entre as janelas (uma caixa atravessa os dois lados)
    ...[-3.9, -1.6, 0.7, 3.0].map((z): Parte => ({ g: caixa(2.58, 1.0, 0.14, 0, 2.08, z), cor: BRANCO, pinta: true })),
    { g: caixa(2.54, 0.3, 0.14, 0, 0.5, 6.05), cor: PLASTICO },
    { g: caixa(2.54, 0.3, 0.14, 0, 0.5, -6.04), cor: PLASTICO },
    { g: caixa(0.3, 0.2, 0.06, 0.95, 0.78, -6.05), cor: LANTERNA },
    { g: caixa(0.3, 0.2, 0.06, -0.95, 0.78, -6.05), cor: LANTERNA },
    roda(0.52, 0.32, 1.05, 0.52, 3.7), roda(0.52, 0.32, -1.05, 0.52, 3.7),
    roda(0.52, 0.5, 0.98, 0.52, -3.2), roda(0.52, 0.5, -0.98, 0.52, -3.2),
  ]);
}

/** Moto com piloto de capacete e baú de entrega (~215 tri). */
function geoMoto() {
  return montar([
    roda(0.3, 0.1, 0, 0.3, 0.68), roda(0.3, 0.1, 0, 0.3, -0.66),
    { g: caixa(0.28, 0.28, 0.85, 0, 0.68, 0.05), cor: BRANCO, pinta: true },
    { g: caixa(0.34, 0.36, 0.22, 0, 0.92, 0.62), cor: BRANCO, pinta: true },
    { g: new THREE.BoxGeometry(0.08, 0.6, 0.08).rotateX(-0.35).translate(0, 0.62, 0.66), cor: CALOTA },
    { g: caixa(0.3, 0.1, 0.6, 0, 0.86, -0.3), cor: PLASTICO },
    { g: caixa(0.44, 0.42, 0.42, 0, 1.12, -0.78), cor: BRANCO, pinta: true },
    { g: caixa(0.62, 0.05, 0.05, 0, 1.08, 0.48), cor: PLASTICO },
    // piloto
    { g: caixa(0.36, 0.18, 0.5, 0, 0.98, -0.1), cor: JEANS },
    { g: caixa(0.34, 0.48, 0.14, 0, 0.66, 0.2), cor: JEANS },
    { g: new THREE.BoxGeometry(0.42, 0.6, 0.26).rotateX(0.3).translate(0, 1.36, -0.12), cor: JAQUETA },
    { g: new THREE.BoxGeometry(0.1, 0.1, 0.62).rotateX(0.75).translate(0.24, 1.32, 0.2), cor: JAQUETA },
    { g: new THREE.BoxGeometry(0.1, 0.1, 0.62).rotateX(0.75).translate(-0.24, 1.32, 0.2), cor: JAQUETA },
    { g: new THREE.IcosahedronGeometry(0.17, 0).translate(0, 1.83, -0.05), cor: [0.02, 0.02, 0.025] },
  ]);
}

/** Material único dos veículos: cor da instância só onde `aPinta`=1; vidros/letreiros brilham. */
export function materialVeiculo(uNoite: { value: number }) {
  // Fase 12: físico com verniz (clearcoat) na lataria — reflete o céu HDRI como carro de verdade
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNoite = uNoite;
    sh.vertexShader = sh.vertexShader
      .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float aPinta;\nattribute float aBrilho;\nattribute float aAcab;\nvarying float vBrilho;\nvarying float vAcab;')
      .replace('#include <color_vertex>', `
        vColor = vec4(color, 1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aPinta);
        #endif
        vBrilho = aBrilho;
        vAcab = aAcab;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNoite;\nvarying float vBrilho;\nvarying float vAcab;')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        int acabV = int(vAcab + 0.5);
        if (acabV == 0) { roughnessFactor = 0.32; metalnessFactor = 0.35; }
        else if (acabV == 1) { roughnessFactor = 0.04; metalnessFactor = 0.0; }
        else if (acabV == 2) { roughnessFactor = 0.85; metalnessFactor = 0.0; }
        else if (acabV == 3) { roughnessFactor = 0.18; metalnessFactor = 1.0; }
        else if (acabV == 4) { roughnessFactor = 0.1; metalnessFactor = 0.0; }
        else { roughnessFactor = 0.6; metalnessFactor = 0.0; }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat *= acabV == 0 ? 1.0 : (acabV == 1 ? 0.6 : 0.0);
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (vBrilho > 3.5) totalEmissiveRadiance += vec3(1.0, 0.08, 0.05) * (0.25 + uNoite * 1.8);
        else if (vBrilho > 2.5) totalEmissiveRadiance += vec3(1.0, 0.92, 0.7) * uNoite * 2.2;
        else if (vBrilho > 1.5) totalEmissiveRadiance += diffuseColor.rgb * (0.35 + uNoite * 1.6);
        else if (vBrilho > 0.5) totalEmissiveRadiance += vec3(1.0, 0.86, 0.6) * 0.55 * uNoite;`);
  };
  m.customProgramCacheKey = () => 'veiculo-pbr-verniz';
  return m;
}

// ── componente ───────────────────────────────────────────────────────────────

/**
 * Fase 29: os carros NÃO são mais simulados aqui. O Worker roda o tráfego microscópico (IDM + MOBIL, faixas, prioridade, semáforo,
 * rotatória, ultrapassagem, ambulância furando a fila) e manda 20 snapshots por segundo; este componente só interpola, põe cada
 * veículo no asfalto e desenha (corpo, faróis, lanternas e freio, pisca-pisca). As viaturas de ocorrência saem daqui e são desenhadas
 * por Ocorrencias.tsx (modelos 3D reais), a partir dos mesmos snapshots.
 */
export function Veiculos() {
  const refs = {
    corpos: useRef<(THREE.InstancedMesh | null)[]>([]),
    luzF: useRef<THREE.InstancedMesh>(null), luzT: useRef<THREE.InstancedMesh>(null), luzP: useRef<THREE.InstancedMesh>(null),
  };
  const geos = useMemo(() => ({
    corpos: [geoSedan(false), geoOnibus(), geoMoto(), geoHatch(), geoSedan(true), geoCaminhao(), geoSuv(), geoPicape(), geoVan(), geoBrt(), geoViatura(), geoLixo()],
    luz: new THREE.BoxGeometry(1.5, 0.18, 0.12),
    pisca: new THREE.BoxGeometry(0.22, 0.16, 0.14),
  }), []);
  const uNoite = useMemo(() => ({ value: 0 }), []);
  const mats = useMemo(() => ({
    corpo: materialVeiculo(uNoite),
    luzF: new THREE.MeshBasicMaterial({ color: '#fff3d0', toneMapped: false }),
    luzT: new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }),
    luzP: new THREE.MeshBasicMaterial({ color: '#ffb020', toneMapped: false }),
  }), [uNoite]);
  useEffect(() => () => { geos.corpos.forEach((g) => g.dispose()); geos.luz.dispose(); geos.pisca.dispose(); Object.values(mats).forEach((m) => m.dispose()); }, [geos, mats]);

  // Fase 30: modelos reais (GLB) no lugar da geometria procedural, assim que cada um carrega; o procedural fica de reserva
  const [reais, setReais] = useState<(VeiculoReal | null)[]>(() => Array(TIPOS).fill(null));
  useEffect(() => {
    let vivo = true;
    for (let t = 0; t < TIPOS; t++) {
      const e = (frota.tipos as Record<string, { arquivo: string; comprimentoM: number; frenteGraus: number }>)[String(t)];
      if (!e) continue;
      carregarVeiculoReal(`frota-${t}`, e).then((r) => { if (vivo) setReais((a) => { const b = a.slice(); b[t] = r; return b; }); }).catch((err) => console.error('[frota]', t, err));
    }
    return () => { vivo = false; };
  }, []);
  const reaisRef = useRef(reais);
  reaisRef.current = reais;

  /** id do veículo no tráfego → id do registro de entidades (a ficha do clique) e os dados vivos dele */
  const regIds = useRef(new Map<number, number>());
  const vivos = useRef(new Map<number, { semente: number; tipo: number; vel: number; rumo: number }>());
  useEffect(() => registro.fonte('carro', (id) => {
    const d = vivos.current.get(id);
    return d ? { semente: d.semente, tipoVeiculo: d.tipo, velocidade: d.vel, rumo: d.rumo, linha: null, lotacao: Math.round(8 + ((d.semente % 100) / 100) * 40) } : null;
  }), []);

  // dev: window.__n27trafego.poses() lista os veículos (x, z, v, flags, tipo) para achar filas e trocas de faixa
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __n27trafego: unknown }).__n27trafego = {
      estado: trafegoEstado,
      dev: devTrafego,
      poses: () => { const out: number[][] = []; percorrerTrafego((p) => { out.push([p.id, p.x, p.z, p.v, p.flags, p.tipo, p.rotulo]); }); return out; },
    };
  }, []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), off: new THREE.Vector3(), eixo: new THREE.Vector3(0, 1, 0), n: new Int32Array(TIPOS) }), []);
  const ultimoEnvio = useRef(0);

  useFrame(() => {
    registro.iniciarQuadro('carro');
    const g = useGame.getState();
    const st = g.stats;
    const agoraMs = performance.now();
    // foco e quantidade: o Worker mantém ~alvo veículos num raio de 1,6 km em volta da câmera
    if (agoraMs - ultimoEnvio.current > 500) {
      ultimoEnvio.current = agoraMs;
      const a = alvoCamera();
      const edges = mundo.roads.edges.size;
      const viagens = st?.cidade.mobilidade.viagensDia ?? 0;
      const porModelo = viagens > 0 ? 8 + (viagens * (st!.cidade.mobilidade.modal.carro + st!.cidade.mobilidade.modal.informal)) / 45 : 0;
      const alvo = edges ? Math.min(MAX, Math.round(porModelo || 6 + (st ? st.populacao / 90 + st.empregos / 160 : 0)), edges * 8) : 0;
      enviarTrafego(a.x, a.z, 1600, devTrafego.alvo || alvo, !onibusEstado.ativo);
    }
    const { m, q, v, s, off, n } = tmp;
    const corpos = Array.from({ length: TIPOS }, (_, t) => refs.corpos.current[t] ?? null);
    const lf = refs.luzF.current, lt = refs.luzT.current, lp = refs.luzP.current;
    if (corpos.some((c) => !c) || !lf || !lt || !lp) return;
    n.fill(0);
    let nF = 0, nT = 0, nP = 0;
    const noite = ambiente.noite;
    const pisca = (agoraMs % 700) < 350;
    vivos.current.clear();

    percorrerTrafego((p) => {
      if (p.rotulo > 0) return; // viatura de ocorrência: Ocorrencias.tsx
      const tipo = Math.min(TIPOS - 1, Math.max(0, p.tipo));
      if (n[tipo] >= MAX) return;
      v.set(p.x, p.y, p.z);
      q.setFromAxisAngle(tmp.eixo, p.yaw);
      // leve variação de escala por veículo (±3%), estável pelo id
      const k = 0.97 + (((p.id * 2654435761) >>> 0) % 7) / 100 * 1;
      s.set(k, k, k);
      m.compose(v, q, s);
      let rid = regIds.current.get(p.id);
      if (rid === undefined) { rid = registro.novoId(); regIds.current.set(p.id, rid); if (regIds.current.size > 6000) regIds.current.clear(); }
      const dm = DIM[tipo];
      registro.publicar('carro', rid, tipo === 1 || tipo === 9 ? 'onibus' : 'carro', p.x, p.y, p.z, p.yaw, dm[0], dm[1], dm[2]);
      vivos.current.set(rid, { semente: 1 + ((p.id * 2654435761) >>> 0) % 1_000_000_000, tipo, vel: p.v, rumo: p.yaw });
      const pal = CORES[tipo as Tipo];
      const im = corpos[tipo]!;
      im.setMatrixAt(n[tipo], m); im.setColorAt(n[tipo], pal[p.cor % pal.length]);
      n[tipo]++;
      const real = reaisRef.current[tipo];
      const lz = real ? real.luz : LUZES[tipo as Tipo];
      s.set(1, 1, 1);
      // lanternas: acesas à noite e, de dia, quando o carro freia
      if ((noite > 0.05 || (p.flags & F.FREIO)) && nT < MAX) {
        off.set(0, lz.y + 0.05, lz.t).applyQuaternion(q).add(v);
        m.compose(off, q, s.set(lz.l, 1, 1));
        lt.setMatrixAt(nT++, m); s.set(1, 1, 1);
      }
      if (noite > 0.05 && nF < MAX) {
        off.set(0, lz.y, lz.f).applyQuaternion(q).add(v);
        m.compose(off, q, s.set(lz.l, 1, 1));
        lf.setMatrixAt(nF++, m); s.set(1, 1, 1);
      }
      // pisca-pisca na troca de faixa (lado da troca: PISCA_E = para a esquerda da marcha)
      if ((p.flags & (F.PISCA_E | F.PISCA_D)) && pisca && nP + 2 <= MAX * 2) {
        const lado = (p.flags & F.PISCA_D) ? -1 : 1;
        const meia = dm[0] * 0.5 - 0.1;
        for (const z of [lz.f - 0.15, lz.t + 0.15]) {
          off.set(-lado * meia, lz.y + 0.12, z).applyQuaternion(q).add(v);
          m.compose(off, q, s.set(1, 1, 1));
          lp.setMatrixAt(nP++, m);
        }
      }
    });
    for (let t = 0; t < TIPOS; t++) corpos[t]!.count = n[t];
    lf.count = nF; lt.count = nT; lp.count = nP;
    for (const im of [...corpos, lf, lt, lp]) {
      if (!im) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    uNoite.value = noite;
    mats.luzF.color.setScalar(1).multiplyScalar(1 + noite * 3);
    mats.luzT.color.setRGB(1 + noite * 2, 0.12, 0.08);
  });

  return (
    <group>
      {geos.corpos.map((geo, t) => (
        <instancedMesh key={`${t}-${reais[t] ? 'r' : 'p'}`} ref={(m) => { refs.corpos.current[t] = m; }} args={[reais[t]?.geo ?? geo, mats.corpo, MAX]} castShadow frustumCulled={false} />
      ))}
      <instancedMesh ref={refs.luzF} args={[geos.luz, mats.luzF, MAX]} frustumCulled={false} />
      <instancedMesh ref={refs.luzT} args={[geos.luz, mats.luzT, MAX]} frustumCulled={false} />
      <instancedMesh ref={refs.luzP} args={[geos.pisca, mats.luzP, MAX * 2]} frustumCulled={false} />
    </group>
  );
}
