/**
 * Retrato estilizado e procedural dos personagens (Fase 5): mesmo `semente` ⇒ mesmo rosto.
 * Tons de pele, cabelos, óculos, barba e roupa variam; ninguém é baseado em pessoa real.
 */
import { memo } from 'react';
import { hash32 } from '../../sim/core/rng';

const PELES = ['#f3d2b3', '#e8bd96', '#d8a477', '#c08a5c', '#a06b43', '#87553a', '#6b4128', '#4e2f1f'];
const CABELOS = ['#1c1410', '#2e1f16', '#4a2f1d', '#6b4a2b', '#a77b4a', '#c9a15f', '#2a2a2a'];
const ROUPAS = ['#1f2a44', '#2b2f36', '#3a3f4a', '#5a1f2a', '#24443a', '#6b5a3a', '#3b2d4f', '#e8e2d6'];
const GRAVATAS = ['#b3262d', '#1e4fa3', '#2f7a46', '#d4a017', '#6b2fa3'];

interface Props { semente: number; genero: 'f' | 'm'; idade: number; cor?: string; tamanho?: number; titulo?: string }

export const Retrato = memo(function Retrato({ semente, genero, idade, cor = '#3ee0b0', tamanho = 56, titulo }: Props) {
  const h = hash32(semente), h2 = hash32(h), h3 = hash32(h2);
  const pele = PELES[h % PELES.length];
  const grisalho = idade > 58 || (idade > 48 && (h2 & 3) === 0);
  const cabelo = grisalho ? ((h3 & 1) ? '#c9c9c4' : '#9a9a94') : CABELOS[(h >>> 4) % CABELOS.length];
  const roupa = ROUPAS[(h >>> 8) % ROUPAS.length];
  const gravata = GRAVATAS[(h2 >>> 3) % GRAVATAS.length];
  const oculos = ((h2 >>> 7) % 10) < (idade > 50 ? 5 : 2);
  const barba = genero === 'm' && ((h3 >>> 2) % 10) < 3;
  const calvo = genero === 'm' && idade > 45 && ((h3 >>> 5) % 10) < 4;
  const estiloF = (h3 >>> 9) % 3; // 0 longo, 1 coque, 2 curto/cacheado
  const rostoL = 15 + ((h >>> 12) % 4); // largura do rosto
  const sorriso = ((h2 >>> 11) % 3) - 1;
  const id = `rt${semente >>> 0}`;
  return (
    <svg viewBox="0 0 64 64" width={tamanho} height={tamanho} role="img" aria-label={titulo ?? 'retrato'} className="shrink-0 rounded-full">
      <defs><clipPath id={id}><circle cx="32" cy="32" r="32" /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect width="64" height="64" fill={cor} opacity="0.35" />
        <rect width="64" height="64" fill="#0b1513" opacity="0.35" />
        {/* cabelo de trás */}
        {genero === 'f' && estiloF === 0 && <path d={`M${32 - rostoL - 3} 30 Q32 2 ${32 + rostoL + 3} 30 L${32 + rostoL + 4} 52 L${32 - rostoL - 4} 52 Z`} fill={cabelo} />}
        {genero === 'f' && estiloF === 2 && <circle cx="32" cy="24" r={rostoL + 5} fill={cabelo} />}
        {/* tronco */}
        <path d="M6 64 Q8 46 32 44 Q56 46 58 64 Z" fill={roupa} />
        {genero === 'm' ? (
          <>
            <path d="M26 45 L32 54 L38 45 Z" fill="#f4f1ea" />
            <path d="M31 47 L33 47 L34 58 L32 61 L30 58 Z" fill={gravata} />
          </>
        ) : (
          <path d="M25 45 Q32 53 39 45 Z" fill={pele} />
        )}
        {/* pescoço e rosto */}
        <rect x="28" y="36" width="8" height="10" fill={pele} />
        <ellipse cx="32" cy="27" rx={rostoL / 1.45} ry="12.5" fill={pele} />
        <ellipse cx={32 - rostoL / 1.45} cy="28" rx="1.8" ry="3" fill={pele} />
        <ellipse cx={32 + rostoL / 1.45} cy="28" rx="1.8" ry="3" fill={pele} />
        {/* cabelo da frente */}
        {genero === 'm' && !calvo && <path d={`M${32 - rostoL / 1.45 - 0.5} 24 Q32 ${8 + (h % 3)} ${32 + rostoL / 1.45 + 0.5} 24 Q32 ${17 + (h2 % 3)} ${32 - rostoL / 1.45 - 0.5} 24 Z`} fill={cabelo} />}
        {genero === 'm' && calvo && <path d={`M${32 - rostoL / 1.45 - 0.5} 25 Q${32 - rostoL / 1.45} 19 ${32 - rostoL / 2} 18 L${32 - rostoL / 2} 22 Z M${32 + rostoL / 1.45 + 0.5} 25 Q${32 + rostoL / 1.45} 19 ${32 + rostoL / 2} 18 L${32 + rostoL / 2} 22 Z`} fill={cabelo} />}
        {genero === 'f' && <path d={`M${32 - rostoL / 1.45 - 1} 27 Q30 ${10 + (h % 3)} ${32 + rostoL / 1.45 + 1} 27 Q36 ${15 + (h2 % 2)} ${32 - rostoL / 1.45 - 1} 27 Z`} fill={cabelo} />}
        {genero === 'f' && estiloF === 1 && <circle cx="32" cy="12" r="5" fill={cabelo} />}
        {barba && <path d={`M${32 - rostoL / 1.6} 29 Q32 ${45 + (h % 2)} ${32 + rostoL / 1.6} 29 Q32 37 ${32 - rostoL / 1.6} 29 Z`} fill={cabelo} opacity="0.85" />}
        {/* olhos, sobrancelhas, boca */}
        <ellipse cx="27.5" cy="27" rx="1.3" ry="1.5" fill="#1a1412" />
        <ellipse cx="36.5" cy="27" rx="1.3" ry="1.5" fill="#1a1412" />
        <path d="M25 23.6 L30 23" stroke={grisalho ? '#8a8a84' : cabelo} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M34 23 L39 23.6" stroke={grisalho ? '#8a8a84' : cabelo} strokeWidth="1.3" strokeLinecap="round" />
        <path d={`M29 34 Q32 ${34 + sorriso * 1.6 + 0.6} 35 34`} stroke="#7a3b2e" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {oculos && (
          <g stroke="#1a1a1a" strokeWidth="0.9" fill="#ffffff" fillOpacity="0.12">
            <rect x="24" y="24.5" width="7" height="5" rx="1.6" />
            <rect x="33" y="24.5" width="7" height="5" rx="1.6" />
            <path d="M31 26.5 L33 26.5" />
          </g>
        )}
      </g>
      <circle cx="32" cy="32" r="31" fill="none" stroke={cor} strokeWidth="2" />
    </svg>
  );
});
