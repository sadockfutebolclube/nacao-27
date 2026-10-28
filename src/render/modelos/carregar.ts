/**
 * Modelos 3D reais (Fase 27): carrega os GLB de assets/models/ (Kenney CC0, Poly Pizza CC-BY/CC0; ver assets/CREDITS.md), compactados
 * com meshopt, e os prepara para InstancedMesh: transformações dos nós aplicadas, uma peça por material, escala em metros pelo
 * comprimento do catálogo (src/data/veiculos/especiais.json), nariz virado para +Z, origem no centro do casco e a base em y = 0.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const URLS = import.meta.glob('../../../assets/models/**/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export interface PecaModelo { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }
export interface ModeloPronto {
  id: string;
  pecas: PecaModelo[];
  /** caixa já normalizada: x largura, y altura, z comprimento (m) */
  tam: THREE.Vector3;
  /** triângulos de todas as peças */
  tris: number;
}

/** Como o modelo entra no jogo (do catálogo JSON). */
export interface EntradaModelo {
  arquivo: string;
  /** comprimento do veículo em metros (a escala vem daí) */
  comprimentoM: number;
  /** giro, em graus em torno de Y, que põe o nariz do modelo em +Z; "proa" detecta sozinho em cascos (a ponta mais fina é a proa) */
  frenteGraus: number | 'proa';
}

export const arquivoModelo = (caminho: string): string | undefined => URLS[`../../../assets/models/${caminho}`];

const carregador = new GLTFLoader();
carregador.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<ModeloPronto>>();

export function carregarModelo(id: string, e: EntradaModelo): Promise<ModeloPronto> {
  let p = cache.get(id);
  if (!p) { p = preparar(id, e); cache.set(id, p); }
  return p;
}

async function preparar(id: string, e: EntradaModelo): Promise<ModeloPronto> {
  const url = arquivoModelo(e.arquivo);
  if (!url) throw new Error(`modelo ${id}: arquivo ${e.arquivo} não existe em assets/models`);
  const gltf = await carregador.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const porMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    // só o que o InstancedMesh usa (atributos diferentes entre as peças impedem a fusão); a quantização do meshopt
    // deixa posição/normal em inteiros normalizados, então tudo vira float32 antes de aplicar a matriz
    for (const nome of Object.keys(g.attributes)) {
      if (nome !== 'position' && nome !== 'normal' && nome !== 'uv') { g.deleteAttribute(nome); continue; }
      const a = g.getAttribute(nome);
      if (a.array instanceof Float32Array) continue;
      const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = k === 0 ? a.getX(i) : k === 1 ? a.getY(i) : a.getZ(i);
      g.setAttribute(nome, new THREE.BufferAttribute(f, a.itemSize));
    }
    g.applyMatrix4(m.matrixWorld);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    (porMaterial.get(mat) ?? porMaterial.set(mat, []).get(mat)!).push(g);
  });

  const giro = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(e.frenteGraus === 'proa' ? graus180SeProaEmMenosZ(porMaterial) : e.frenteGraus));
  const pecas: PecaModelo[] = [];
  for (const [mat, gs] of porMaterial) {
    const geo = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
    if (!geo) continue;
    geo.applyMatrix4(giro);
    const std = mat as THREE.MeshStandardMaterial;
    const novo = new THREE.MeshStandardMaterial({ color: std.color ?? new THREE.Color('#ffffff'), map: std.map ?? null, roughness: 0.7, metalness: 0.1, side: std.side });
    if (novo.map) novo.map.colorSpace = THREE.SRGBColorSpace;
    pecas.push({ geo, mat: novo });
  }
  // caixa conjunta → escala e posição
  const caixa = new THREE.Box3();
  for (const p of pecas) { p.geo.computeBoundingBox(); caixa.union(p.geo.boundingBox!); }
  const tam0 = caixa.getSize(new THREE.Vector3());
  const esc = e.comprimentoM / Math.max(1e-6, tam0.z);
  const centro = caixa.getCenter(new THREE.Vector3());
  let tris = 0;
  for (const p of pecas) {
    p.geo.translate(-centro.x, -caixa.min.y, -centro.z);
    p.geo.scale(esc, esc, esc);
    p.geo.computeBoundingBox(); p.geo.computeBoundingSphere();
    tris += (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count) / 3;
  }
  return { id, pecas, tam: tam0.multiplyScalar(esc), tris: Math.round(tris) };
}

/** Silhueta simples para o LOD de longe: fuselagem e asas (aeronaves) ou uma caixa (navios, carros), já na escala do modelo. */
export function geoSilhueta(m: ModeloPronto, tipo: 'ar' | 'helicoptero' | 'caixa'): THREE.BufferGeometry {
  const { x: w, y: h, z: l } = m.tam;
  if (tipo === 'ar') {
    const fus = new THREE.BoxGeometry(w * 0.18, h * 0.7, l).translate(0, h * 0.35, 0);
    const asa = new THREE.BoxGeometry(w, h * 0.12, l * 0.2).translate(0, h * 0.3, 0);
    const cauda = new THREE.BoxGeometry(w * 0.3, h * 0.08, l * 0.12).translate(0, h * 0.55, -l * 0.42);
    return mergeGeometries([fus, asa, cauda])!;
  }
  if (tipo === 'helicoptero') {
    const corpo = new THREE.BoxGeometry(w * 0.7, h * 0.6, l * 0.5).translate(0, h * 0.3, l * 0.12);
    const cauda = new THREE.BoxGeometry(w * 0.12, h * 0.12, l * 0.5).translate(0, h * 0.5, -l * 0.3);
    return mergeGeometries([corpo, cauda])!;
  }
  return new THREE.BoxGeometry(w, h, l).translate(0, h / 2, 0);
}

/** Cascos: a extremidade em z com a menor largura (nos 15% finais) é a proa; devolve 180 se ela está em -Z. */
function graus180SeProaEmMenosZ(grupos: Map<THREE.Material, THREE.BufferGeometry[]>): number {
  let zmin = Infinity, zmax = -Infinity;
  for (const gs of grupos.values()) for (const g of gs) { const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z < zmin) zmin = z; if (z > zmax) zmax = z; } }
  const faixa = (zmax - zmin) * 0.15;
  const lim = (ini: number, fim: number) => { let a = Infinity, b = -Infinity; for (const gs of grupos.values()) for (const g of gs) { const p = g.getAttribute('position'); for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z >= ini && z <= fim) { const x = p.getX(i); if (x < a) a = x; if (x > b) b = x; } } } return b - a; };
  const larguraMenos = lim(zmin, zmin + faixa), larguraMais = lim(zmax - faixa, zmax);
  return larguraMenos < larguraMais ? 180 : 0;
}
