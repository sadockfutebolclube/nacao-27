/** Comparação lado a lado dos candidatos de modelos (só dev): /galeria-candidatos.html?ids=a,b,c — GLB crus de data/cache/modelos-origem/turismo, cada um normalizado a 10 m de altura. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor('#9db7c8');
document.body.appendChild(renderer.domElement);
const cena = new THREE.Scene();
cena.add(new THREE.HemisphereLight('#ffffff', '#667788', 1.8));
const sol = new THREE.DirectionalLight('#ffffff', 2); sol.position.set(30, 60, 40); cena.add(sol);
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 2000);
const ctl = new OrbitControls(cam, renderer.domElement);
const ids = (new URLSearchParams(location.search).get('ids') ?? '').split(',').filter(Boolean);
const fichas = (await (await fetch('/data/cache/modelos-origem/turismo/candidatos.json')).json()) as Record<string, { titulo: string; autor: string; tris: number; licenca: string }>;
const alvoAlt = 10;
let x = 0;
const nomes: string[] = [];
const loader = new GLTFLoader();
for (const id of ids) {
  const gltf = await loader.loadAsync(`/data/cache/modelos-origem/turismo/${id}.glb`);
  const g = gltf.scene;
  const box = new THREE.Box3().setFromObject(g);
  const tam = box.getSize(new THREE.Vector3());
  const k = alvoAlt / Math.max(tam.y, 1e-3);
  g.scale.setScalar(k);
  const box2 = new THREE.Box3().setFromObject(g);
  g.position.set(x - box2.min.x - (box2.max.x - box2.min.x) / 2, -box2.min.y, -(box2.min.z + box2.max.z) / 2);
  const larg = (box2.max.x - box2.min.x) + 4;
  g.position.x += larg / 2; x += larg;
  cena.add(g);
  const f = fichas[id];
  nomes.push(`${nomes.length + 1}) ${id} — ${f?.titulo} · ${f?.autor} · ${f?.tris} tris · ${f?.licenca} · caixa ${tam.x.toFixed(1)}×${tam.y.toFixed(1)}×${tam.z.toFixed(1)}`);
}
cena.add(new THREE.GridHelper(400, 80, '#667', '#99a'));
document.getElementById('l')!.textContent = nomes.join('\n');
cam.position.set(x / 2, 9, Math.max(22, x * 0.9)); ctl.target.set(x / 2, 4.5, 0); ctl.update();
renderer.setAnimationLoop(() => renderer.render(cena, cam));
