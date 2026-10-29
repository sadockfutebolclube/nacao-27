/**
 * Adereços 3D instanciados (Fase 31): guarda-sol, cadeira de praia, prancha, quiosque, bicicleta e cachorro (assets/models/turismo e animal;
 * ver assets/CREDITS.md). Um InstancedMesh por material do modelo, escala em metros, base em y = 0. Tinta por instância só nas peças
 * que o catálogo marca (a lona do guarda-sol recebe a cor; o cabo não).
 */
import * as THREE from 'three';
import { carregarModelo, type EntradaModelo, type ModeloPronto } from './carregar';

export interface OpcoesProp {
  capacidade: number;
  /** gira a geometria em X (rad) antes de medir: a prancha vem em pé */
  giroX?: number;
  /** quais peças (pela cor do material) recebem a cor da instância */
  tingir?: (cor: THREE.Color) => boolean;
  sombra?: boolean;
}

const Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), M = new THREE.Matrix4(), E = new THREE.Euler(0, 0, 0, 'YXZ');

export class Prop {
  readonly grupo = new THREE.Group();
  readonly modelo: ModeloPronto;
  private readonly pecas: { im: THREE.InstancedMesh; tinge: boolean }[] = [];
  private n = 0;
  readonly capacidade: number;

  constructor(modelo: ModeloPronto, o: OpcoesProp) {
    this.modelo = modelo;
    this.capacidade = o.capacidade;
    for (const p of modelo.pecas) {
      const geo = p.geo;
      if (o.giroX) { geo.rotateX(o.giroX); geo.computeBoundingBox(); const b = geo.boundingBox!, c = b.getCenter(new THREE.Vector3()); geo.translate(-c.x, -b.min.y, -c.z); geo.computeBoundingSphere(); }
      const mat = p.mat.clone();
      const tinge = o.tingir ? o.tingir(mat.color) : false;
      const im = new THREE.InstancedMesh(geo, mat, o.capacidade);
      if (tinge) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.capacidade * 3).fill(1), 3); im.instanceColor.setUsage(THREE.DynamicDrawUsage); }
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.castShadow = o.sombra ?? true; im.receiveShadow = true; im.count = 0;
      this.pecas.push({ im, tinge }); this.grupo.add(im);
    }
  }

  inicio() { this.n = 0; }

  /** Coloca uma instância (nariz = +Z); `cor` tinge as peças marcadas. Devolve false se a capacidade acabou. */
  poe(x: number, y: number, z: number, yaw: number, escala = 1, cor?: THREE.Color, pitch = 0, roll = 0): boolean {
    if (this.n >= this.capacidade) return false;
    E.set(-pitch, yaw, roll, 'YXZ');
    Q.setFromEuler(E);
    M.compose(V.set(x, y, z), Q, S.set(escala, escala, escala));
    const k = this.n++;
    for (const p of this.pecas) { p.im.setMatrixAt(k, M); if (p.tinge && cor) p.im.setColorAt(k, cor); }
    return true;
  }

  fim() {
    for (const p of this.pecas) {
      p.im.count = this.n;
      p.im.instanceMatrix.needsUpdate = true;
      if (p.im.instanceColor) p.im.instanceColor.needsUpdate = true;
    }
  }

  get quantos() { return this.n; }

  dispose() { for (const p of this.pecas) { p.im.geometry.dispose(); (p.im.material as THREE.Material).dispose(); p.im.dispose(); } }
}

/** Catálogo dos adereços: arquivo, tamanho em metros (a escala vem do comprimento Z medido DEPOIS de girar o nariz; ver a conta em cada linha). */
export const CATALOGO_PROPS: Record<string, EntradaModelo & { opcoes?: Omit<OpcoesProp, 'capacidade'> }> = {
  // caixa bruta 0,57 × 0,67 × 0,51: 2,3 m de altura → comprimentoM = 2,3 × 0,51 / 0,67
  guardaSol: { arquivo: 'turismo/guarda-sol.glb', comprimentoM: 1.75, frenteGraus: 0, opcoes: { tingir: (c) => c.r > 0.5 } },
  // cadeira deitada, 215 de comprimento por 157 de encosto (cm): 1,05 m de comprimento
  cadeira: { arquivo: 'turismo/cadeira-praia.glb', comprimentoM: 1.05, frenteGraus: 0, opcoes: { tingir: () => true } },
  // prancha em pé (43 de comprimento no eixo Y, 8,6 em Z): 2,0 m → comprimentoM = 2,0 × 8,62 / 43,04 e deita-se em X
  prancha: { arquivo: 'turismo/prancha.glb', comprimentoM: 0.4, frenteGraus: 0, opcoes: { giroX: Math.PI / 2, tingir: (c) => c.r > 0.5 && c.g < 0.5 } },
  // banca de feira (CC0): 1,19 de comprimento → 3,2 m
  quiosque: { arquivo: 'turismo/quiosque-banca.glb', comprimentoM: 3.2, frenteGraus: 0 },
  // bicicleta: 19,6 de comprimento em Z → 1,75 m
  bicicleta: { arquivo: 'turismo/bicicleta.glb', comprimentoM: 1.75, frenteGraus: 0 },
  // cachorro (bind pose), 3,95 de comprimento → 0,95 m
  cachorro: { arquivo: 'animal/cachorro.glb', comprimentoM: 0.95, frenteGraus: 0 },
};

const promessas = new Map<string, Promise<Prop>>();
/** Carrega o adereço `nome` do catálogo e monta o conjunto com a capacidade pedida (uma vez por nome). */
export function carregarProp(nome: keyof typeof CATALOGO_PROPS & string, capacidade: number): Promise<Prop> {
  let p = promessas.get(nome);
  if (!p) {
    const e = CATALOGO_PROPS[nome];
    p = carregarModelo(`prop-${nome}`, e).then((m) => new Prop(m, { capacidade, ...e.opcoes }));
    promessas.set(nome, p);
  }
  return p;
}
