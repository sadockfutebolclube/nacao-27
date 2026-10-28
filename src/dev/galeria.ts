/** Galeria de modelos (só dev): http://localhost:5173/galeria-modelos.html — mostra cada GLB de assets/models com o nariz (+Z) marcado em vermelho. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { carregarModelo } from '../render/modelos/carregar';

import lista from './galeria.json';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const cena = new THREE.Scene();
cena.add(new THREE.HemisphereLight('#ffffff', '#667788', 1.6));
const sol = new THREE.DirectionalLight('#ffffff', 2); sol.position.set(30, 60, 20); cena.add(sol);
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 5000);
const ctl = new OrbitControls(cam, renderer.domElement);
const nomes: string[] = [];
let x = 0;
const cat = new URLSearchParams(location.search).get('cat') ?? '';
for (const [id, arquivo, compr] of (lista as [string, string, number][]).filter((l) => l[1].startsWith(cat))) {
  const fq = new URLSearchParams(location.search).get(id); const frente = fq !== null ? Number(fq) : arquivo.startsWith('navio') ? 'proa' as const : 0;
  const m = await carregarModelo(id, { arquivo, comprimentoM: compr, frenteGraus: frente });
  const g = new THREE.Group();
  for (const p of m.pecas) g.add(new THREE.Mesh(p.geo, p.mat));
  const nariz = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({ color: 'red' }));
  nariz.position.set(0, m.tam.y + 0.4, m.tam.z / 2); g.add(nariz);
  const larg = Math.max(m.tam.x, m.tam.z) + 4;
  g.position.x = x + larg / 2; x += larg;
  cena.add(g);
  nomes.push(`${id} ${compr}m · ${m.tris} tris · caixa ${m.tam.x.toFixed(1)}×${m.tam.y.toFixed(1)}×${m.tam.z.toFixed(1)}`);
}
cena.add(new THREE.GridHelper(2000, 400, '#888', '#aaa'));
document.getElementById('l')!.textContent = nomes.join('\n');
const d = Math.min(x, 40 + x * 0.1); if (new URLSearchParams(location.search).get('v') === 'lado') cam.position.set(x / 2 + d * 0.9, d * 0.5, d * 1.1); else cam.position.set(x / 2, x * 0.75, 4); ctl.target.set(x / 2, 0, 0); ctl.update();
renderer.setAnimationLoop(() => renderer.render(cena, cam));
(window as unknown as { __cam: THREE.Camera; __ctl: OrbitControls; __x: number }).__cam = cam;
(window as unknown as { __ctl: OrbitControls }).__ctl = ctl;
