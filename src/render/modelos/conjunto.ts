/**
 * Conjunto de instâncias de um modelo 3D (Fase 27): um InstancedMesh por peça (material) do modelo, mais uma SILHUETA simples
 * (LOD) para quando a câmera está longe. `poe` escolhe o LOD pela distância; `inicio`/`fim` zeram e fecham o quadro.
 */
import * as THREE from 'three';
import { geoSilhueta, type ModeloPronto } from './carregar';

export interface OpcoesConjunto {
  capacidade: number;
  /** acima desta distância (m) da câmera desenha a silhueta */
  detalheM: number;
  lod: 'ar' | 'helicoptero' | 'caixa';
  /** multiplica a cor do material (lataria de cada instituição, cinza da Marinha…) */
  tint?: string;
  sombra?: boolean;
}

const EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), M = new THREE.Matrix4();

export class Conjunto {
  readonly grupo = new THREE.Group();
  readonly modelo: ModeloPronto;
  private readonly pecas: THREE.InstancedMesh[] = [];
  private readonly silhueta: THREE.InstancedMesh;
  private readonly geoSil: THREE.BufferGeometry;
  private readonly matSil: THREE.MeshStandardMaterial;
  private readonly mats: THREE.MeshStandardMaterial[] = [];
  private nDet = 0;
  private nSil = 0;
  readonly capacidade: number;
  private readonly detalheM: number;

  /** instâncias desenhadas no último quadro (detalhe, silhueta) — para medir o LOD */
  ultimo = { detalhe: 0, silhueta: 0 };

  constructor(modelo: ModeloPronto, o: OpcoesConjunto) {
    this.modelo = modelo;
    this.capacidade = o.capacidade;
    this.grupo.name = 'conjunto-modelo';
    this.detalheM = o.detalheM;
    const tint = o.tint ? new THREE.Color(o.tint) : null;
    for (const p of modelo.pecas) {
      const mat = p.mat.clone();
      if (tint) mat.color.multiply(tint);
      this.mats.push(mat);
      const im = new THREE.InstancedMesh(p.geo, mat, o.capacidade);
      im.frustumCulled = false; im.castShadow = o.sombra ?? false; im.count = 0;
      this.pecas.push(im); this.grupo.add(im);
    }
    this.geoSil = geoSilhueta(modelo, o.lod);
    this.matSil = new THREE.MeshStandardMaterial({ color: tint ? new THREE.Color('#9aa3ad').multiply(tint) : '#9aa3ad', roughness: 0.8 });
    this.silhueta = new THREE.InstancedMesh(this.geoSil, this.matSil, o.capacidade);
    this.silhueta.frustumCulled = false; this.silhueta.count = 0;
    this.grupo.add(this.silhueta);
  }

  inicio() { this.nDet = 0; this.nSil = 0; }

  /** Coloca uma instância; `dist` é a distância até a câmera (escolhe o LOD). Rumo `yaw` em torno de Y (nariz = +Z), caturra e rolagem em rad. */
  poe(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, dist: number, escala = 1): boolean {
    const longe = dist > this.detalheM;
    if ((longe ? this.nSil : this.nDet) >= this.capacidade) return false;
    EULER.set(-pitch, yaw, roll, 'YXZ');
    Q.setFromEuler(EULER);
    M.compose(V.set(x, y, z), Q, S.set(escala, escala, escala));
    if (longe) this.silhueta.setMatrixAt(this.nSil++, M);
    else { const k = this.nDet++; for (const p of this.pecas) p.setMatrixAt(k, M); }
    return !longe;
  }

  fim() {
    for (const p of this.pecas) { p.count = this.nDet; p.instanceMatrix.needsUpdate = true; }
    this.silhueta.count = this.nSil; this.silhueta.instanceMatrix.needsUpdate = true;
    this.ultimo.detalhe = this.nDet; this.ultimo.silhueta = this.nSil;
  }

  dispose() {
    for (const p of this.pecas) p.dispose();
    this.silhueta.dispose(); this.geoSil.dispose(); this.matSil.dispose();
    for (const m of this.mats) m.dispose();
  }
}
