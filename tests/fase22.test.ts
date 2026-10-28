import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { desligarCSM, ligarCSM } from '../src/render/city/CeuLuz';

const novoCSM = (cena: THREE.Scene, cascatas = 2) => new CSM({ camera: new THREE.PerspectiveCamera(45, 1, 3, 30000), parent: cena, cascades: cascatas, maxFar: 1800, shadowMapSize: 256, lightDirection: new THREE.Vector3(-0.4, -1, -0.3).normalize() });
const comShader = (m: THREE.Material) => { const sh = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <worldpos_vertex>', fragmentShader: '#include <lights_fragment_begin>' }; m.onBeforeCompile(sh as never, undefined as never); return sh; };

describe('Fase 22 — o CSM não pode apagar o shader próprio dos materiais', () => {
  it('a causa: o dispose() do three apaga o onBeforeCompile próprio do material', () => {
    const cena = new THREE.Scene(), csm = novoCSM(cena);
    const m = new THREE.MeshStandardMaterial();
    m.onBeforeCompile = () => { /* splat do terreno */ };
    csm.setupMaterial(m);
    csm.dispose();
    expect(Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')).toBe(false); // o terreno ficava sem shader: branco-acinzentado
  });

  it('ligarCSM encadeia o shader do material com o do CSM e desligarCSM devolve o original', () => {
    const cena = new THREE.Scene(), csm = novoCSM(cena, 2);
    const chamadas: string[] = [];
    const original: THREE.Material['onBeforeCompile'] = () => { chamadas.push('original'); };
    const m = new THREE.MeshStandardMaterial();
    m.onBeforeCompile = original;
    m.customProgramCacheKey = () => 'meu-programa';
    cena.add(new THREE.Mesh(new THREE.BoxGeometry(), m));
    ligarCSM(csm, 1, m as never);
    expect(m.defines?.USE_CSM).toBe(1);
    expect(m.customProgramCacheKey()).toBe('meu-programa|csm2');
    const sh = comShader(m);
    expect(chamadas).toEqual(['original']); // o do material roda…
    expect(sh.uniforms.CSM_cascades).toBeDefined(); // …e o do CSM também
    desligarCSM(csm, cena);
    expect(m.onBeforeCompile).toBe(original);
    expect(Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')).toBe(true);
    expect(m.customProgramCacheKey()).toBe('meu-programa');
    expect(m.defines?.USE_CSM).toBeUndefined();
  });

  it('trocar de nível (2 cascatas → desligado → 2 cascatas) várias vezes não perde nem duplica o shader do material', () => {
    const cena = new THREE.Scene();
    let compilacoes = 0;
    const m = new THREE.MeshStandardMaterial();
    m.onBeforeCompile = () => { compilacoes++; };
    cena.add(new THREE.Mesh(new THREE.BoxGeometry(), m));
    for (let volta = 0; volta < 4; volta++) {
      const csm = novoCSM(cena, 2);
      ligarCSM(csm, volta + 1, m as never);
      compilacoes = 0;
      comShader(m);
      expect(compilacoes).toBe(1); // o shader do material roda uma vez por compilação, nunca duas
      desligarCSM(csm, cena);
    }
    compilacoes = 0;
    comShader(m);
    expect(compilacoes).toBe(1);
  });

  it('material sem shader próprio volta a ter o gancho padrão do three', () => {
    const cena = new THREE.Scene(), csm = novoCSM(cena);
    const m = new THREE.MeshStandardMaterial();
    cena.add(new THREE.Mesh(new THREE.BoxGeometry(), m));
    ligarCSM(csm, 1, m as never);
    desligarCSM(csm, cena);
    expect(m.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);
  });
});
