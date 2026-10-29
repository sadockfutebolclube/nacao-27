/** Poses e clipes do personagem com esqueleto (só dev): /galeria-poses.html — uma pessoa por clipe: parado, andar, correr, sentar, palmas, pulo, braços abertos, foto. */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { carregarPessoaVAT, materialPessoaVAT } from '../render/modelos/pessoaVAT';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor('#9db7c8');
document.body.appendChild(renderer.domElement);
const cena = new THREE.Scene();
cena.add(new THREE.HemisphereLight('#ffffff', '#667788', 1.8));
const sol = new THREE.DirectionalLight('#ffffff', 2.2); sol.position.set(10, 30, 40); cena.add(sol);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 500);
const ctl = new OrbitControls(cam, renderer.domElement);
const vat = await carregarPessoaVAT();
const rotulos = ['parado', 'andar', 'correr', 'sentar', 'palmas', 'pulo', 'braços abertos', 'foto'];
// (ritmo, sentado) por clipe: 0 · 3 · 11 · sentado · -1 · -2 · -3 · -4
const ritmos = [0, 3, 11, 0, -1, -2, -3, -4];
const u = { uTempo: { value: 0 } };
const geo = vat.geo.clone();
const N = rotulos.length;
geo.setAttribute('iCalca', new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(0.15), 3));
const anim = new Float32Array(N * 4);
for (let i = 0; i < N; i++) { anim[i * 4] = i * 0.13; anim[i * 4 + 1] = ritmos[i]; anim[i * 4 + 2] = 0.3; anim[i * 4 + 3] = i === 3 ? 2 : 0; }
geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(anim, 4));
const mesh = new THREE.InstancedMesh(geo, materialPessoaVAT(vat, u), N);
mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3).fill(0.9), 3);
mesh.frustumCulled = false;
const m = new THREE.Matrix4();
const yaw = Number(new URLSearchParams(location.search).get('yaw') ?? 0);
for (let i = 0; i < N; i++) mesh.setMatrixAt(i, m.compose(new THREE.Vector3((i - (N - 1) / 2) * 1.6, 0, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (yaw * Math.PI) / 180), new THREE.Vector3(1, 1, 1)));
cena.add(mesh);
cena.add(new THREE.GridHelper(40, 40, '#667', '#99a'));
document.getElementById('l')!.textContent = rotulos.map((r, i) => `${i + 1}) ${r}`).join('   ·   ') + `   (yaw ${yaw}°)`;
cam.position.set(0, 1.6, 12); ctl.target.set(0, 1, 0); ctl.update();
renderer.setAnimationLoop((t) => { u.uTempo.value = t / 1000; renderer.render(cena, cam); });
