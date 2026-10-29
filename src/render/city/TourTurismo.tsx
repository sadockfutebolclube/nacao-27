/**
 * Tour automático de câmera pelos pontos turísticos (Fase 31): Shift+T (a tecla T sozinha é a camada de facções; ou `window.__n27tur.tour()` no dev) leva a câmera por 8 pontos,
 * 7 s em cada, girando devagar em volta do ponto. Em cada parada o contexto do turismo é travado num horário que mostra o ponto
 * em uso (praia ao meio-dia de sábado, jogo no Maracanã no domingo às 15h…); Esc, W/A/S/D ou o mouse encerram e destravam.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mundo, useGame } from '../../sim/bridge';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { pontoPorId, type Contexto } from '../../world/turismo';
import { alvoCamera } from './Camera';
import { dadosDaOrla } from './orlaDados';
import { posicaoDoPonto, turismoDebug } from './turismoEstado';

interface Parada { id: string; rotulo: string; dist: number; alt: number; ang: number; ctx: Partial<Contexto>; praia?: string; alvoY?: number; dx?: number; dz?: number }
export const PARADAS: Parada[] = [
  { id: 'cristo', rotulo: 'Cristo Redentor', dist: 55, alt: 22, ang: 0.4, ctx: { hora: 12, diaSemana: 6, mes: 1, chuva: 0 }, alvoY: 14 },
  { id: 'pao-acucar', rotulo: 'Pão de Açúcar e bondinho', dist: 150, alt: 70, ang: 1.9, ctx: { hora: 11, diaSemana: 6, mes: 1, chuva: 0 } },
  { id: 'maracana', rotulo: 'Maracanã em dia de jogo', dist: 85, alt: 38, ang: 0.7, ctx: { hora: 15.2, diaSemana: 0, mes: 6, chuva: 0 }, dx: -230, dz: -180 },
  { id: 'copacabana', rotulo: 'Praia de Copacabana', dist: 85, alt: 38, ang: 0, ctx: { hora: 12, diaSemana: 6, mes: 1, chuva: 0, temp: 33 }, praia: 'copacabana' },
  { id: 'arcos', rotulo: 'Arcos da Lapa e bonde', dist: 95, alt: 38, ang: 2.4, ctx: { hora: 17, diaSemana: 5, mes: 6, chuva: 0 } },
  { id: 'roda-gigante', rotulo: 'Roda-gigante Rio Star', dist: 160, alt: 55, ang: 0.3, ctx: { hora: 16, diaSemana: 6, mes: 6, chuva: 0 }, alvoY: 40 },
  { id: 'theatro', rotulo: 'Theatro Municipal e Biblioteca Nacional', dist: 120, alt: 48, ang: 3.4, ctx: { hora: 15, diaSemana: 3, mes: 6, chuva: 0 } },
  { id: 'quinta', rotulo: 'Quinta da Boa Vista', dist: 110, alt: 70, ang: 3.9, dx: 60, dz: -80, ctx: { hora: 13, diaSemana: 0, mes: 6, chuva: 0 } },
];
export const SEGUNDOS_POR_PARADA = 7;

export function TourTurismo({ hm }: { hm: Heightmap }) {
  const { camera } = useThree();
  const est = useRef({ ativo: false, i: 0, t: 0 });
  /** relógio do jogo antes do tour (o céu acompanha a hora de cada parada; no fim volta ao automático) */
  const relogio = useRef<{ horaAuto: boolean; hora: number } | null>(null);
  const horaDaParada = useRef(-1);

  useEffect(() => {
    const ligar = () => { est.current = { ativo: true, i: 0, t: 0 }; turismoDebug.tourAtivo = true; turismoDebug.tourParada = PARADAS[0].rotulo; };
    const parar = () => { est.current.ativo = false; turismoDebug.forcar = null; turismoDebug.tourAtivo = false; turismoDebug.tourParada = ''; restaurar(); };
    const restaurar = () => { if (relogio.current) { useGame.getState().set(relogio.current); relogio.current = null; horaDaParada.current = -1; } };
    turismoDebug.tour = ligar; turismoDebug.tourParar = parar;
    /** pula para uma parada (prints) */
    turismoDebug.tourIr = (i: number) => { est.current = { ativo: true, i, t: 0 }; };
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 't' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !est.current.ativo) ligar();
      else if (est.current.ativo && ['escape', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) parar();
    };
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('keydown', tecla); turismoDebug.tour = () => {}; turismoDebug.tourParar = () => {}; };
  }, []);

  useFrame((_, dt) => {
    const E = est.current;
    if (!E.ativo || !mundo.real) return;
    E.t += Math.min(dt, 0.1);
    if (E.t > SEGUNDOS_POR_PARADA) { E.t = 0; E.i++; if (E.i >= PARADAS.length) { E.ativo = false; turismoDebug.forcar = null; turismoDebug.tourAtivo = false; turismoDebug.tourParada = ''; if (relogio.current) { useGame.getState().set(relogio.current); relogio.current = null; horaDaParada.current = -1; } return; } }
    const p = PARADAS[E.i], pt = pontoPorId(p.id)!;
    turismoDebug.tourParada = p.rotulo;
    turismoDebug.forcar = p.ctx;
    if (p.ctx.hora !== undefined && horaDaParada.current !== p.ctx.hora) {
      const g = useGame.getState();
      if (!relogio.current) relogio.current = { horaAuto: g.horaAuto, hora: g.hora };
      g.set({ horaAuto: false, hora: p.ctx.hora });
      horaDaParada.current = p.ctx.hora;
    }
    // alvo: o ponto (ou, nas praias, a areia no meio da costa)
    let x: number, z: number, nx = 0, nz = 0;
    if (p.praia) {
      const c = dadosDaOrla(hm, mundo.real).costa[p.praia];
      const m = c[Math.floor(c.length * 0.78)];
      x = m.x - m.nx * 18; z = m.z - m.nz * 18; nx = m.nx; nz = m.nz;
    } else { const pos = posicaoDoPonto(pt)!; x = pos[0] + (p.dx ?? 0); z = pos[1] + (p.dz ?? 0); }
    const ang = p.ang + E.t * 0.12;
    const y = Math.max(0, sampleHeight(hm, x, z)) + (p.alvoY ?? 3);
    const alvo = alvoCamera();
    alvo.set(x, y, z);
    // praia: câmera do lado do mar; demais pontos: gira
    const cx = p.praia ? x + nx * p.dist + nz * 40 * Math.sin(E.t * 0.2) : x + Math.cos(ang) * p.dist, cz = p.praia ? z + nz * p.dist - nx * 40 * Math.sin(E.t * 0.2) : z + Math.sin(ang) * p.dist;
    const ay = Math.max(0, sampleHeight(hm, cx, cz)) + p.alt;
    const k = 1 - Math.exp(-dt * 2.5);
    camera.position.lerp(new THREE.Vector3(cx, ay, cz), E.t < 0.1 ? 1 : k);
    camera.lookAt(alvo);
  });
  return null;
}
