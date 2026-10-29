/**
 * Pessoas com esqueleto e animação na GPU (Fase 30). O personagem "Man" (Quaternius, domínio público: 31 ossos, ~1.200 triângulos, clipes
 * Idle, Walk, Run e Sitting) é carregado como GLB com pele, as animações são ASSADAS numa textura de posições de vértice (VAT: uma linha por
 * quadro, uma coluna por vértice; normais numa segunda textura) e o vertex shader só lê a textura — milhares de instâncias sem custo de esqueleto
 * na CPU. Por instância: fase da passada, ritmo (0 = parado; alto = corrida), tom de pele, camisa (instanceColor), calça, guarda-chuva e sentado.
 * O clipe é escolhido no shader: sentado → Sitting; ritmo 0 → Idle; ritmo < 9,5 rad/s → Walk; acima → Run.
 * Fase 31 (visitantes dos pontos turísticos): ritmo NEGATIVO escolhe um clipe especial — -1 palmas (Clapping), -2 pulo (Jump),
 * -3 braços abertos e -4 tirando foto (as duas poses são montadas apontando os ossos dos braços e assadas num quadro só).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { arquivoModelo } from './carregar';

const LARGURA = 4096;
const ALTURA_M = 1.75;
/** classes de cor (as mesmas de Pedestres.tsx): 0 pele · 1 camisa · 2 calça · 3 cabelo · 4 sapato/olho/meia · 7 guarda-chuva (rígido) */
const CLASSE_POR_MATERIAL: Record<string, number> = { Skin: 0, Hair: 3, Shirt: 1, Pants: 2, Eyes: 4, Socks: 4 };

export interface PessoaVAT {
  geo: THREE.BufferGeometry;
  posTex: THREE.DataTexture;
  norTex: THREE.DataTexture;
  /** início e quantos quadros de cada clipe: [idle, walk, run, sit, palmas, pulo, braços abertos, foto] */
  clipes: { base: number; n: number }[];
  triangulos: number;
  vertices: number;
  quadros: number;
}

let promessa: Promise<PessoaVAT> | null = null;
export const carregarPessoaVAT = (): Promise<PessoaVAT> => (promessa ??= montar());

async function montar(): Promise<PessoaVAT> {
  const url = arquivoModelo('pessoa/homem.glb');
  if (!url) throw new Error('assets/models/pessoa/homem.glb não existe');
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const cena = gltf.scene;
  cena.updateMatrixWorld(true);
  const malhas: THREE.SkinnedMesh[] = [];
  cena.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) malhas.push(o as THREE.SkinnedMesh); });
  if (!malhas.length) throw new Error('personagem sem pele');

  // vértices na ordem: malha a malha
  const offsets: number[] = [];
  let total = 0;
  for (const m of malhas) { offsets.push(total); total += m.geometry.getAttribute('position').count; }
  if (total > LARGURA) throw new Error(`personagem com ${total} vértices (limite ${LARGURA})`);

  const clip = (re: RegExp) => gltf.animations.find((a) => re.test(a.name));
  const palmas = clip(/Clapping/i), pulo = clip(/Man_Jump$/i);
  const idle = clip(/Idle/i), walk = clip(/Walk/i), run = clip(/Run(?!ning?Jump)/i) ?? clip(/Running/i), sit = clip(/Sitting|SitIdle/i);
  if (!idle || !walk || !run || !sit || !palmas || !pulo) throw new Error(`clipes que faltam: ${[!idle && 'Idle', !walk && 'Walk', !run && 'Run', !sit && 'Sitting', !palmas && 'Clapping', !pulo && 'Jump'].filter(Boolean).join(', ')}`);

  // quadros: (clipe, instantes)
  const planos: { clip: THREE.AnimationClip; de: number; ate: number; n: number; pose?: (cena: THREE.Object3D) => void }[] = [
    { clip: idle, de: 0, ate: idle.duration, n: 24 },
    { clip: walk, de: 0, ate: walk.duration, n: 24 },
    { clip: run, de: 0, ate: run.duration, n: 16 },
    { clip: sit, de: sit.duration * 0.85, ate: sit.duration, n: 4 },
    { clip: palmas, de: 0, ate: palmas.duration, n: 16 },
    { clip: pulo, de: 0, ate: pulo.duration, n: 16 },
    // as poses saem do primeiro quadro do Idle com os braços reapontados (por último, para o que foi mexido não vazar para outro clipe)
    { clip: idle, de: 0, ate: 0, n: 1, pose: poseBracosAbertos },
    { clip: idle, de: 0, ate: 0, n: 1, pose: poseFoto },
  ];
  const quadros = planos.reduce((s, p) => s + p.n, 0);
  const pos = new Float32Array(LARGURA * quadros * 4), nor = new Float32Array(LARGURA * quadros * 4);

  const mixer = new THREE.AnimationMixer(cena);
  const v = new THREE.Vector3();
  // índice global (para as normais)
  const indice: number[] = [];
  malhas.forEach((m, k) => { const ix = m.geometry.index; const n = m.geometry.getAttribute('position').count; if (ix) for (let i = 0; i < ix.count; i++) indice.push(ix.getX(i) + offsets[k]); else for (let i = 0; i < n; i++) indice.push(i + offsets[k]); });

  const clipes: { base: number; n: number }[] = [];
  let linha = 0;
  const tmpN = new Float32Array(LARGURA * 3);
  for (const pl of planos) {
    clipes.push({ base: linha, n: pl.n });
    const acao = mixer.clipAction(pl.clip);
    acao.play();
    for (let f = 0; f < pl.n; f++, linha++) {
      acao.time = pl.de + ((pl.ate - pl.de) * f) / pl.n;
      mixer.update(0);
      cena.updateMatrixWorld(true);
      pl.pose?.(cena);
      malhas.forEach((m, k) => {
        m.skeleton.update();
        const n = m.geometry.getAttribute('position').count;
        for (let i = 0; i < n; i++) {
          m.getVertexPosition(i, v);
          v.applyMatrix4(m.matrixWorld);
          const o = (linha * LARGURA + offsets[k] + i) * 4;
          pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z; pos[o + 3] = 1;
        }
      });
    }
    acao.stop();
    mixer.uncacheAction(pl.clip);
  }

  // altura e pés: normaliza pelo quadro 0 do idle (escala para 1,75 m, pés em y = 0, centro em x/z = 0)
  let miny = Infinity, maxy = -Infinity, cx = 0, cz = 0;
  for (let i = 0; i < total; i++) { const y = pos[i * 4 + 1]; if (y < miny) miny = y; if (y > maxy) maxy = y; cx += pos[i * 4]; cz += pos[i * 4 + 2]; }
  cx /= total; cz /= total;
  const esc = ALTURA_M / Math.max(0.01, maxy - miny);
  for (let q = 0; q < quadros; q++) for (let i = 0; i < total; i++) {
    const o = (q * LARGURA + i) * 4;
    pos[o] = (pos[o] - cx) * esc; pos[o + 1] = (pos[o + 1] - miny) * esc; pos[o + 2] = (pos[o + 2] - cz) * esc;
  }
  // normais de cada quadro por acúmulo das faces
  for (let q = 0; q < quadros; q++) {
    tmpN.fill(0);
    for (let t = 0; t < indice.length; t += 3) {
      const a = indice[t], b = indice[t + 1], c = indice[t + 2];
      const oa = (q * LARGURA + a) * 4, ob = (q * LARGURA + b) * 4, oc = (q * LARGURA + c) * 4;
      const ux = pos[ob] - pos[oa], uy = pos[ob + 1] - pos[oa + 1], uz = pos[ob + 2] - pos[oa + 2];
      const wx = pos[oc] - pos[oa], wy = pos[oc + 1] - pos[oa + 1], wz = pos[oc + 2] - pos[oa + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      for (const i of [a, b, c]) { tmpN[i * 3] += nx; tmpN[i * 3 + 1] += ny; tmpN[i * 3 + 2] += nz; }
    }
    for (let i = 0; i < total; i++) {
      const l = Math.hypot(tmpN[i * 3], tmpN[i * 3 + 1], tmpN[i * 3 + 2]) || 1, o = (q * LARGURA + i) * 4;
      nor[o] = tmpN[i * 3] / l; nor[o + 1] = tmpN[i * 3 + 1] / l; nor[o + 2] = tmpN[i * 3 + 2] / l; nor[o + 3] = 1;
    }
  }

  const posTex = new THREE.DataTexture(pos, LARGURA, quadros, THREE.RGBAFormat, THREE.FloatType);
  const norTex = new THREE.DataTexture(nor, LARGURA, quadros, THREE.RGBAFormat, THREE.FloatType);
  for (const t of [posTex, norTex]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }

  // geometria estática: posição do 1º quadro do idle, índice global, id do vértice e classe de cor (pela cor do material)
  const posG = new Float32Array(total * 3), norG = new Float32Array(total * 3), vid = new Float32Array(total), cls = new Float32Array(total), parte = new Float32Array(total);
  malhas.forEach((m, k) => {
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    const c = CLASSE_POR_MATERIAL[mat.name] ?? 4;
    const n = m.geometry.getAttribute('position').count;
    for (let i = 0; i < n; i++) {
      const g = offsets[k] + i, o = g * 4;
      posG[g * 3] = pos[o]; posG[g * 3 + 1] = pos[o + 1]; posG[g * 3 + 2] = pos[o + 2];
      norG[g * 3] = nor[o]; norG[g * 3 + 1] = nor[o + 1]; norG[g * 3 + 2] = nor[o + 2];
      vid[g] = g; cls[g] = c; parte[g] = 0;
    }
  });
  // guarda-chuva (rígido, aParte = 5): lona aberta acima da cabeça e cabo até a mão; aparece só quando iAnim.w pede
  const lona = new THREE.ConeGeometry(0.62, 0.28, 6, 1, true).translate(0.2, 2.05, 0.4); lona.deleteAttribute('uv');
  const cabo = new THREE.BoxGeometry(0.025, 0.95, 0.025).translate(0.2, 1.55, 0.46); cabo.deleteAttribute('uv');
  const guarda = mergeGeometries([lona, cabo])!;
  const gp = guarda.getAttribute('position'), gn = guarda.getAttribute('normal'), gi = guarda.index!;
  const N = total + gp.count;
  const P2 = new Float32Array(N * 3), N2 = new Float32Array(N * 3), V2 = new Float32Array(N), C2 = new Float32Array(N), T2 = new Float32Array(N);
  P2.set(posG); N2.set(norG); V2.set(vid); C2.set(cls); T2.set(parte);
  for (let i = 0; i < gp.count; i++) { const g = total + i; P2[g * 3] = gp.getX(i); P2[g * 3 + 1] = gp.getY(i); P2[g * 3 + 2] = gp.getZ(i); N2[g * 3] = gn.getX(i); N2[g * 3 + 1] = gn.getY(i); N2[g * 3 + 2] = gn.getZ(i); C2[g] = 7; T2[g] = 5; }
  for (let i = 0; i < gi.count; i++) indice.push(gi.getX(i) + total);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P2, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
  geo.setAttribute('aVid', new THREE.BufferAttribute(V2, 1));
  geo.setAttribute('aCor', new THREE.BufferAttribute(C2, 1));
  geo.setAttribute('aParte', new THREE.BufferAttribute(T2, 1));
  geo.setIndex(indice);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6);
  return { geo, posTex, norTex, clipes, triangulos: (indice.length - gi.count) / 3, vertices: total, quadros };
}

/** Material das pessoas animadas por textura: iAnim = (fase, ritmo, tom de pele, guarda-chuva 0/1 + 2 se sentado), iCalca, instanceColor = camisa. */
export function materialPessoaVAT(vat: PessoaVAT, u: { uTempo: { value: number } }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  const c = vat.clipes;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTempo = u.uTempo;
    sh.uniforms.uPos = { value: vat.posTex };
    sh.uniforms.uNor = { value: vat.norTex };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aVid;
        attribute float aCor;
        attribute float aParte;
        attribute vec3 iCalca;
        attribute vec4 iAnim;
        uniform float uTempo;
        uniform highp sampler2D uPos;
        uniform highp sampler2D uNor;
        const float FPS = 24.0;
        vec2 clipe() {
          if (iAnim.y < -0.5) {
            int k = int(-iAnim.y + 0.5);
            if (k == 1) return vec2(${c[4].base.toFixed(1)}, ${c[4].n.toFixed(1)});
            if (k == 2) return vec2(${c[5].base.toFixed(1)}, ${c[5].n.toFixed(1)});
            if (k == 3) return vec2(${c[6].base.toFixed(1)}, ${c[6].n.toFixed(1)});
            return vec2(${c[7].base.toFixed(1)}, ${c[7].n.toFixed(1)});
          }
          if (iAnim.w > 1.5) return vec2(${c[3].base.toFixed(1)}, ${c[3].n.toFixed(1)});
          if (iAnim.y < 0.01) return vec2(${c[0].base.toFixed(1)}, ${c[0].n.toFixed(1)});
          if (iAnim.y < 9.5) return vec2(${c[1].base.toFixed(1)}, ${c[1].n.toFixed(1)});
          return vec2(${c[2].base.toFixed(1)}, ${c[2].n.toFixed(1)});
        }
        float velClipe() { if (iAnim.y < -0.5) return iAnim.y > -2.5 ? 1.0 : 0.0; return iAnim.w > 1.5 ? 0.0 : (iAnim.y < 0.01 ? 0.7 : (iAnim.y < 9.5 ? iAnim.y / 5.4 : iAnim.y / 11.0)); }`)
      .replace('#include <color_vertex>', `
        {
          vec3 pele = mix(vec3(0.85, 0.55, 0.38), vec3(0.12, 0.055, 0.03), iAnim.z);
          vec3 c = pele;
          #ifdef USE_INSTANCING_COLOR
            vec3 camisa = instanceColor.rgb;
          #else
            vec3 camisa = vec3(0.8);
          #endif
          if (aCor > 0.5 && aCor < 1.5) c = camisa;
          else if (aCor > 1.5 && aCor < 2.5) c = iCalca;
          else if (aCor > 2.5 && aCor < 3.5) c = mix(vec3(0.01, 0.008, 0.006), vec3(0.09, 0.045, 0.02), fract(iAnim.x * 0.37));
          else if (aCor > 3.5 && aCor < 4.5) c = vec3(0.03);
          else if (aCor > 6.5) c = vec3(0.12, 0.12, 0.14);
          vColor = vec4(c, 1.0);
        }`)
      .replace('#include <beginnormal_vertex>', `
        vec2 cl = clipe();
        float quadro = mod(uTempo * FPS * velClipe() + iAnim.x * 4.0, cl.y);
        float q0 = floor(quadro), q1 = mod(q0 + 1.0, cl.y), fq = quadro - q0;
        ivec2 id0 = ivec2(int(aVid), int(cl.x + q0)), id1 = ivec2(int(aVid), int(cl.x + q1));
        float gc = iAnim.w - 2.0 * step(1.5, iAnim.w);
        vec3 objectNormal = aParte > 4.5 ? normal : normalize(mix(texelFetch(uNor, id0, 0).xyz, texelFetch(uNor, id1, 0).xyz, fq));`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = aParte > 4.5 ? (gc > 0.5 ? position : vec3(0.0)) : mix(texelFetch(uPos, id0, 0).xyz, texelFetch(uPos, id1, 0).xyz, fq);`);
  };
  m.customProgramCacheKey = () => 'pessoa-vat';
  return m;
}

// ── poses montadas apontando os ossos ────────────────────────────────────────────

/** Gira o osso (no espaço do mundo) para que o segmento osso → filho aponte para `alvo`; os descendentes vão junto. */
function apontar(cena: THREE.Object3D, osso: string, filho: string, alvo: THREE.Vector3) {
  const b = cena.getObjectByName(osso), f = cena.getObjectByName(filho);
  if (!b || !f || !b.parent) return;
  cena.updateMatrixWorld(true);
  const p0 = b.getWorldPosition(new THREE.Vector3()), p1 = f.getWorldPosition(new THREE.Vector3());
  const d = p1.sub(p0).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(d, alvo.clone().normalize());
  const mundo = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
  b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(mundo));
  cena.updateMatrixWorld(true);
}
/** +1 se o osso fica do lado +X do corpo, −1 do outro (o personagem é simétrico em torno do quadril) */
function lado(cena: THREE.Object3D, osso: string): number {
  const o = cena.getObjectByName(osso), q = cena.getObjectByName('Hips');
  if (!o || !q) return 1;
  return Math.sign(o.getWorldPosition(new THREE.Vector3()).x - q.getWorldPosition(new THREE.Vector3()).x) || 1;
}
/** o nariz do personagem aponta para +Z (convenção do glTF e do jogo: yaw 0 olha para +Z) */
function poseBracosAbertos(cena: THREE.Object3D) {
  for (const s of ['L', 'R']) {
    const x = lado(cena, `UpperArm${s}`);
    apontar(cena, `UpperArm${s}`, `LowerArm${s}`, new THREE.Vector3(x, 0.12, 0));
    apontar(cena, `LowerArm${s}`, `Palm${s}`, new THREE.Vector3(x, 0.2, 0));
  }
}
/** celular na frente do rosto com a mão direita; a esquerda segura o cotovelo (fica solta ao longo do corpo) */
function poseFoto(cena: THREE.Object3D) {
  const x = lado(cena, 'UpperArmR');
  apontar(cena, 'UpperArmR', 'LowerArmR', new THREE.Vector3(x * 0.25, -0.35, 0.9));
  apontar(cena, 'LowerArmR', 'PalmR', new THREE.Vector3(-x * 0.05, 0.95, 0.35));
}
