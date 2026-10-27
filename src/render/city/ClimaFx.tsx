/**
 * Efeitos visuais de tempo, desastres e festas (Fase 6): chuva animada na GPU, raios, enchente que
 * cobre as partes baixas do relevo, incêndio com coluna de fumaça, fogos de artifício à noite,
 * confete no Carnaval e bandeirinhas no São João. Tudo guiado por `clima` (climaVisual.ts).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useGame } from '../../sim/bridge';
import { BUILD_HALF } from '../../world/constants';
import { sampleHeight, type Heightmap } from '../../world/terrain';
import { ambiente } from './ambiente';
import { alvoCamera } from './Camera';
import { clima } from './climaVisual';
import { amostrarPerfil } from './perfilVias';
import { perfisAtuais } from './Vias';

// ── Chuva ────────────────────────────────────────────────────────────────────────
const N_GOTAS = 9000;
function Chuva() {
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(N_GOTAS * 2 * 3), fim = new Float32Array(N_GOTAS * 2);
    for (let i = 0; i < N_GOTAS; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      pos.set([x, y, z, x, y, z], i * 6);
      fim[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('fim', new THREE.BufferAttribute(fim, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uCentro: { value: new THREE.Vector3() }, uTempo: { value: 0 }, uOpac: { value: 0 }, uVento: { value: new THREE.Vector2() }, uLuz: { value: 1 } },
      vertexShader: `
        uniform vec3 uCentro; uniform float uTempo; uniform vec2 uVento;
        attribute float fim; varying float vFim; varying float vPerto;
        void main() {
          float H = 380.0, T = 900.0;
          float y = fract(position.y - uTempo * 62.0 / H);
          vec3 p = uCentro + vec3((position.x - 0.5) * T, y * H - 30.0, (position.z - 0.5) * T);
          p.xz += uVento * y * H;
          p += vec3(-uVento.x, 1.0, -uVento.y) * fim * 4.0;
          vFim = fim;
          vPerto = smoothstep(18.0, 70.0, distance(p, cameraPosition));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uOpac, uLuz; varying float vFim; varying float vPerto;
        void main() { gl_FragColor = vec4(vec3(0.72, 0.78, 0.86) * uLuz, uOpac * (0.25 + 0.75 * vFim) * vPerto); }`,
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const ref = useRef<THREE.LineSegments>(null);
  useFrame((_, dt) => {
    const c = clima.chuva;
    if (!ref.current) return;
    ref.current.visible = c > 0.02;
    if (c <= 0.02) return;
    const a = alvoCamera();
    mat.uniforms.uCentro.value.set(a.x, a.y, a.z);
    mat.uniforms.uTempo.value += dt;
    mat.uniforms.uOpac.value = 0.25 + 0.4 * c;
    mat.uniforms.uLuz.value = 0.35 + 0.65 * (1 - ambiente.noite) + clima.flash;
    mat.uniforms.uVento.value.copy(clima.vento);
    geo.setDrawRange(0, Math.floor(N_GOTAS * 2 * c));
  });
  return <lineSegments ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={20} />;
}

// ── Raio ─────────────────────────────────────────────────────────────────────────
function Raio({ hm }: { hm: Heightmap }) {
  const ref = useRef<THREE.Line>(null);
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const mat = useMemo(() => new THREE.LineBasicMaterial({ color: '#eef3ff', toneMapped: false, transparent: true }), []);
  const ultimo = useRef<object | null>(null);
  const linha = useMemo(() => new THREE.Line(geo, mat), [geo, mat]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(() => {
    const r = clima.raio;
    if (!ref.current) return;
    ref.current.visible = !!r;
    if (!r || ultimo.current === r) return;
    ultimo.current = r;
    const a = alvoCamera();
    const x0 = a.x + r.x * 0.5, z0 = a.z + r.z * 0.5;
    const solo = Math.max(0, sampleHeight(hm, x0, z0));
    const pts: number[] = [];
    let x = x0 + (Math.random() - 0.5) * 120, z = z0 + (Math.random() - 0.5) * 120;
    for (let i = 0; i <= 14; i++) {
      const y = 900 - (i / 14) * (900 - solo);
      pts.push(x, y, z);
      x += (Math.random() - 0.5) * 40 + (x0 - x) * 0.25;
      z += (Math.random() - 0.5) * 40 + (z0 - z) * 0.25;
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.computeBoundingSphere();
    mat.color.setScalar(8);
  });
  return <primitive object={linha} ref={ref} />;
}

// ── Enchente ─────────────────────────────────────────────────────────────────────
function Enchente({ hm }: { hm: Heightmap }) {
  const [nivel, setNivel] = useState(0);
  useFrame(() => {
    const q = Math.round(clima.enchente * 4) / 4;
    if (q !== nivel) setNivel(q);
  });
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#6a5536', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86, depthWrite: false }), []);
  const geo = useMemo(() => {
    if (nivel < 0.25) return null;
    const C = 12, R = Math.floor((BUILD_HALF * 2) / C);
    const pos: number[] = [];
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const x = -BUILD_HALF + i * C, z = -BUILD_HALF + j * C;
      const hs = [sampleHeight(hm, x, z), sampleHeight(hm, x + C, z), sampleHeight(hm, x, z + C), sampleHeight(hm, x + C, z + C)];
      const lo = Math.min(...hs);
      // só terra firme baixa (o mar já é água): a cheia sobe a partir das várzeas e beiras de rio
      if (lo > nivel || Math.max(...hs) < 0.15) continue;
      const y = nivel + 0.05;
      pos.push(x, y, z, x, y, z + C, x + C, y, z, x + C, y, z, x, y, z + C, x + C, y, z + C);
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }, [nivel, hm]);
  useEffect(() => () => geo?.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  if (!geo) return null;
  return <mesh geometry={geo} material={mat} renderOrder={4} receiveShadow />;
}

// ── Partículas (fogos, confete, fogo, fumaça) ────────────────────────────────────
function texturaRedonda(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const N_FOGOS = 28 * 90;
function Fogos() {
  const tex = useMemo(texturaRedonda, []);
  const { geo, pos, col, vel, vida, cor } = useMemo(() => {
    const pos = new Float32Array(N_FOGOS * 3), col = new Float32Array(N_FOGOS * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return { geo: g, pos, col, vel: new Float32Array(N_FOGOS * 3), vida: new Float32Array(N_FOGOS), cor: new THREE.Color() };
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({ size: 8, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [tex]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); tex.dispose(); }, [geo, mat, tex]);
  const prox = useRef(0);
  const burst = useRef(0);
  useFrame((_, dtReal) => {
    const dt = Math.min(0.05, dtReal);
    const ativo = clima.festa !== null && ambiente.noite > 0.45;
    const taxa = clima.festa === 'fogos' ? 2.2 : clima.festa === 'carnaval' ? 0.8 : 0.35;
    prox.current -= dt;
    if (ativo && prox.current <= 0) {
      prox.current = (0.3 + Math.random()) / taxa;
      const a = alvoCamera();
      const ox = a.x + (Math.random() - 0.5) * 900, oz = a.z + (Math.random() - 0.5) * 900, oy = a.y + 140 + Math.random() * 120;
      cor.setHSL(Math.random(), 0.9, 0.6);
      const b = burst.current++ % 28;
      for (let k = 0; k < 90; k++) {
        const i = b * 90 + k;
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = 28 + Math.random() * 14;
        pos.set([ox, oy, oz], i * 3);
        vel.set([r * Math.cos(th) * s, u * s, r * Math.sin(th) * s], i * 3);
        vida[i] = 1.8 + Math.random() * 0.6;
      }
    }
    for (let i = 0; i < N_FOGOS; i++) {
      if (vida[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      vida[i] -= dt;
      vel[i * 3 + 1] -= 12 * dt;
      vel[i * 3] *= 0.985; vel[i * 3 + 1] *= 0.985; vel[i * 3 + 2] *= 0.985;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const b = Math.floor(i / 90);
      cor.setHSL(((b * 0.137) % 1), 0.9, 0.6);
      const f = Math.min(1, vida[i]) * 3;
      col[i * 3] = cor.r * f; col[i * 3 + 1] = cor.g * f; col[i * 3 + 2] = cor.b * f;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={21} />;
}

const N_CONFETE = 2200;
const CORES_CONFETE = ['#ff3b6b', '#ffd23f', '#3ee0b0', '#3f8fe0', '#c77dff', '#ff8a3d'];
function Confete() {
  const { geo, pos, sem } = useMemo(() => {
    const pos = new Float32Array(N_CONFETE * 3), col = new Float32Array(N_CONFETE * 3), sem = new Float32Array(N_CONFETE * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N_CONFETE; i++) {
      sem.set([Math.random(), Math.random(), Math.random()], i * 3);
      c.set(CORES_CONFETE[i % CORES_CONFETE.length]);
      col.set([c.r * 1.4, c.g * 1.4, c.b * 1.4], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return { geo: g, pos, sem };
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({ size: 1.3, vertexColors: true, toneMapped: false }), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  const ref = useRef<THREE.Points>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = clima.festa === 'carnaval';
    if (!ref.current.visible) return;
    const a = alvoCamera(), t = ambiente.tempo;
    for (let i = 0; i < N_CONFETE; i++) {
      const sx = sem[i * 3], sy = sem[i * 3 + 1], sz = sem[i * 3 + 2];
      const y = ((sy - t * 0.035 * (0.6 + sx)) % 1 + 1) % 1;
      pos[i * 3] = a.x + (sx - 0.5) * 420 + Math.sin(t * 2 + i) * 3;
      pos[i * 3 + 1] = a.y + y * 90;
      pos[i * 3 + 2] = a.z + (sz - 0.5) * 420 + Math.cos(t * 1.7 + i) * 3;
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

/** Bandeirinhas de São João esticadas sobre as ruas próximas da câmera. */
function Bandeirinhas() {
  const wv = useGame((s) => s.worldVersion);
  const [ativa, setAtiva] = useState(false);
  useFrame(() => { const a = clima.festa === 'junina'; if (a !== ativa) setAtiva(a); });
  const geoTri = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.28, 0, 0, 0.28, 0, 0, 0, -0.55, 0], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }), []);
  useEffect(() => () => { geoTri.dispose(); mat.dispose(); }, [geoTri, mat]);
  const dados = useMemo(() => {
    if (!ativa) return null;
    const mats: THREE.Matrix4[] = [], cores: THREE.Color[] = [];
    const pal = ['#e63946', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#f78c6b'].map((c) => new THREE.Color(c));
    const p = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
    const q = new THREE.Quaternion(), e = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const pf of perfisAtuais.values()) {
      if (n > 40) break;
      n++;
      for (let s = 6; s < pf.comprimento - 6 && mats.length < 7000; s += 16) {
        amostrarPerfil(pf, s, p);
        const nx = -p.tz, nz = p.tx; // atravessa a rua
        const L = 12;
        for (let k = 0; k <= 16; k++) {
          const t = k / 16 - 0.5;
          const x = p.x + nx * t * L, z = p.z + nz * t * L;
          const y = p.y + 6.5 - 1.2 * (1 - (2 * t) ** 2);
          q.setFromAxisAngle(e, Math.atan2(nx, nz) + Math.PI / 2);
          mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
          cores.push(pal[(k + mats.length) % pal.length]);
        }
      }
    }
    return { mats, cores };
  }, [ativa, wv]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const im = ref.current;
    if (!im || !dados) return;
    dados.mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, dados.cores[i]); });
    im.count = dados.mats.length;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }, [dados]);
  if (!dados || !dados.mats.length) return null;
  return <instancedMesh ref={ref} args={[geoTri, mat, dados.mats.length]} frustumCulled={false} />;
}

/** Incêndio florestal: brasas e coluna de fumaça numa área de mata perto da cidade. */
const N_FUMACA = 500;
function Incendio({ hm }: { hm: Heightmap }) {
  const tex = useMemo(texturaRedonda, []);
  const foco = useMemo(() => {
    let melhor = { x: 1500, z: 1500, f: -1 };
    for (let a = 0; a < Math.PI * 2; a += 0.2) for (const r of [1300, 1600, 1900]) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const i = Math.round((x + 3072) / 8), j = Math.round((z + 3072) / 8);
      const f = hm.forest[j * 769 + i] ?? 0;
      if (f > melhor.f && sampleHeight(hm, x, z) > 2) melhor = { x, z, f };
    }
    return { ...melhor, y: sampleHeight(hm, melhor.x, melhor.z) };
  }, [hm]);
  const { geo, pos, col, sem } = useMemo(() => {
    const pos = new Float32Array(N_FUMACA * 3), col = new Float32Array(N_FUMACA * 3), sem = new Float32Array(N_FUMACA * 2);
    for (let i = 0; i < N_FUMACA; i++) sem.set([Math.random(), Math.random()], i * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    return { geo: g, pos, col, sem };
  }, []);
  const mat = useMemo(() => new THREE.PointsMaterial({ size: 46, map: tex, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.55 }), [tex]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); tex.dispose(); }, [geo, mat, tex]);
  const ref = useRef<THREE.Points>(null);
  useFrame(() => {
    if (!ref.current) return;
    const k = clima.incendio;
    ref.current.visible = k > 0.03;
    if (!ref.current.visible) return;
    const t = ambiente.tempo;
    for (let i = 0; i < N_FUMACA; i++) {
      const s0 = sem[i * 2], s1 = sem[i * 2 + 1];
      const v = ((s0 + t * 0.04) % 1);
      const brasa = i < 120;
      const r = brasa ? 40 * s1 : 30 + v * 260;
      pos[i * 3] = foco.x + Math.cos(s1 * 40) * r + v * 220 * clima.vento.x * 4;
      pos[i * 3 + 1] = foco.y + (brasa ? 2 + v * 10 : 10 + v * 420);
      pos[i * 3 + 2] = foco.z + Math.sin(s1 * 40) * r + v * 220 * clima.vento.y * 4;
      if (brasa) { col[i * 3] = 3 * k; col[i * 3 + 1] = 1.1 * k; col[i * 3 + 2] = 0.2 * k; }
      else { const c = (0.45 - 0.2 * v) * k; col[i * 3] = c * 1.05; col[i * 3 + 1] = c * 0.95; col[i * 3 + 2] = c * 0.85; }
    }
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}

export function ClimaFx({ hm }: { hm: Heightmap }) {
  return (
    <group>
      <Chuva />
      <Raio hm={hm} />
      <Enchente hm={hm} />
      <Fogos />
      <Confete />
      <Bandeirinhas />
      <Incendio hm={hm} />
    </group>
  );
}
