/**
 * Mapa 3D do Brasil: malha real do IBGE extrudada por UF. Serve de fundo cinematográfico
 * do menu, mesa de seleção de estado e, no Modo Presidente (Fase 9), o mapa do país governado:
 * aprovação por UF, relação com os governadores ou votos da eleição.
 */
import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useApp, type Tela } from '../../app/store';
import type { SiglaUF } from '../../data/schemas';
import { CORES_REGIAO, corRampa, normalizar } from './metricas';
import { usePres } from '../../sim/presidente/store';
import { PARTIDOS } from '../../sim/politica/dados';
import { useNivel } from '../qualidade';
import { acessibilidade } from '../acessibilidade';

const LON0 = -53.5, LAT0 = -15.2;
const KX = Math.cos((LAT0 * Math.PI) / 180);
export const proj = (lon: number, lat: number): [number, number] => [(lon - LON0) * KX, (lat - LAT0)];

interface UFGeo { sigla: SiglaUF; geom: THREE.ExtrudeGeometry; borda: THREE.BufferGeometry; centro: [number, number]; area: number }

function aneis(f: Feature): Position[][][] {
  const g = f.geometry as Polygon | MultiPolygon;
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

function construirGeo(f: Feature): UFGeo {
  const shapes: THREE.Shape[] = [];
  const bordaPts: number[] = [];
  let maior = 0;
  let centro: [number, number] = [0, 0];
  let areaTotal = 0;
  for (const poly of aneis(f)) {
    const [ext, ...furos] = poly;
    const pts = ext.slice(0, -1).map(([lon, lat]) => new THREE.Vector2(...proj(lon, lat)));
    const area = Math.abs(THREE.ShapeUtils.area(pts));
    areaTotal += area;
    if (area < 0.002) continue;
    const shape = new THREE.Shape(pts);
    for (const h of furos) shape.holes.push(new THREE.Path(h.slice(0, -1).map(([lon, lat]) => new THREE.Vector2(...proj(lon, lat)))));
    shapes.push(shape);
    if (area > maior) {
      maior = area;
      // centróide do polígono (fórmula de área com sinal)
      let cx = 0, cy = 0, a2 = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        const cr = p.x * q.y - q.x * p.y;
        a2 += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
      }
      centro = [cx / (3 * a2), cy / (3 * a2)];
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      bordaPts.push(p.x, 1, -p.y, q.x, 1, -q.y);
    }
  }
  const geom = new THREE.ExtrudeGeometry(shapes, { depth: 1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 });
  geom.rotateX(-Math.PI / 2);
  geom.computeVertexNormals();
  const borda = new THREE.BufferGeometry();
  borda.setAttribute('position', new THREE.Float32BufferAttribute(bordaPts, 3));
  return { sigla: f.properties!.sigla as SiglaUF, geom, borda, centro, area: areaTotal };
}

function Oceano() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vXY; varying vec3 vW;
      void main() { vXY = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vXY; varying vec3 vW;
      float linha(float v, float passo, float larg) { float f = abs(fract(v / passo + 0.5) - 0.5) * passo; return 1.0 - smoothstep(0.0, larg, f); }
      void main() {
        vec2 p = vW.xz;
        float r = length(p * vec2(1.0, 0.9));
        vec3 fundo = mix(vec3(0.035, 0.085, 0.10), vec3(0.012, 0.025, 0.035), smoothstep(8.0, 46.0, r));
        float grade = max(linha(p.x, 5.0 * ${KX.toFixed(4)}, 0.035), linha(p.y, 5.0, 0.035)) * 0.5;
        float equador = linha(p.y + ${(-LAT0).toFixed(3)}, 1000.0, 0.06);
        float tropico = linha(p.y + ${(-LAT0 - 23.44).toFixed(3)}, 1000.0, 0.05);
        float onda = 0.5 + 0.5 * sin(r * 1.6 - uTime * 0.6);
        vec3 c = fundo + vec3(0.12, 0.35, 0.32) * grade * (0.35 + 0.25 * onda) * smoothstep(48.0, 10.0, r);
        c += vec3(0.95, 0.75, 0.3) * (equador + tropico) * 0.35 * smoothstep(50.0, 12.0, r);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }), []);
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt; });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.05} material={mat}>
      <planeGeometry args={[220, 220]} />
    </mesh>
  );
}

function UFMesh({ geo, altura, cor, tela, capital, rotulo }: { geo: UFGeo; altura: number; cor: string; tela: Tela; capital: [number, number]; rotulo?: string }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), []);
  const bordaMat = useMemo(() => new THREE.LineBasicMaterial({ color: '#d9fff2', transparent: true, opacity: 0.55 }), []);
  const corAlvo = useMemo(() => new THREE.Color(cor), [cor]);
  const hover = useApp((s) => s.hover === geo.sigla);
  const sel = useApp((s) => s.selecionada === geo.sigla);
  const setHover = useApp((s) => s.setHover);
  const setSel = useApp((s) => s.setSelecionada);
  const interativo = tela === 'selecao' || tela === 'presidente' || tela === 'presidente-setup';

  useEffect(() => () => { mat.dispose(); bordaMat.dispose(); }, [mat, bordaMat]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = 1 - Math.exp(-dt * 7);
    const alvoH = altura * (hover || sel ? 1.12 : 1);
    g.scale.y += (alvoH - g.scale.y) * k;
    g.position.y += ((sel ? 0.55 : hover ? 0.3 : 0) - g.position.y) * k;
    mat.color.lerp(corAlvo, k);
    const em = sel ? 0.45 : hover ? 0.28 : 0;
    mat.emissive.copy(mat.color).multiplyScalar(em);
    bordaMat.opacity += ((sel ? 1 : hover ? 0.9 : 0.35) - bordaMat.opacity) * k;
    bordaMat.color.set(sel ? '#fff3c4' : '#d9fff2');
  });

  return (
    <group ref={ref} scale-y={0.01}>
      <mesh
        geometry={geo.geom}
        material={mat}
        castShadow
        receiveShadow
        onPointerOver={interativo ? (e) => { e.stopPropagation(); setHover(geo.sigla); document.body.style.cursor = 'pointer'; } : undefined}
        onPointerOut={interativo ? () => { setHover(null); document.body.style.cursor = ''; } : undefined}
        onClick={interativo ? (e) => { e.stopPropagation(); setSel(geo.sigla); } : undefined}
      />
      <lineSegments geometry={geo.borda} material={bordaMat} />
      {interativo && (
        <Html position={[geo.centro[0], 1.15, -geo.centro[1]]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`num text-[11px] font-semibold tracking-wider transition-all text-center leading-tight ${hover || sel ? 'text-white scale-125' : 'text-white/70'}`} style={{ textShadow: '0 1px 4px #000' }}>
            {geo.sigla}{rotulo && <div className="text-[9px] font-normal">{rotulo}</div>}
          </div>
        </Html>
      )}
      {/* capital */}
      <mesh position={[capital[0], 1.04, -capital[1]]}>
        <cylinderGeometry args={[0.09, 0.09, 0.08, 12]} />
        <meshBasicMaterial color={sel || hover ? '#ffe9a8' : '#ffd36b'} toneMapped={false} />
      </mesh>
    </group>
  );
}

function CameraRig({ tela }: { tela: Tela }) {
  const { camera, pointer } = useThree();
  const t = useRef(0);
  const look = useMemo(() => new THREE.Vector3(), []);
  const alvoLook = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    t.current += dt;
    const k = 1 - Math.exp(-dt * 1.8);
    let pos: THREE.Vector3;
    if (tela === 'menu') {
      const parado = acessibilidade.reduzirMovimento;
      const a = -0.6 + (parado ? 0 : Math.sin(t.current * 0.07) * 0.5);
      pos = new THREE.Vector3(Math.sin(a) * 40, 22 + (parado ? 0 : Math.sin(t.current * 0.11) * 2), Math.cos(a) * 40);
      // desloca o olhar para a esquerda da câmera: o Brasil fica à direita, livre do menu
      const dir = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
      const direita = new THREE.Vector3().crossVectors(dir, THREE.Object3D.DEFAULT_UP).normalize();
      alvoLook.set(0, 0, 1).addScaledVector(direita, -12);
    } else if (tela === 'presidente-setup') {
      // o formulário fica à esquerda: o mapa vai para a direita
      pos = new THREE.Vector3(-3 + pointer.x * 2, 48 + pointer.y, 30);
      alvoLook.set(-3, 0, 2.5);
    } else if (tela === 'presidente') {
      // o painel do Planalto ocupa a direita: o mapa fica à esquerda
      pos = new THREE.Vector3(11 + pointer.x * 1.5, 47 + pointer.y, 29);
      alvoLook.set(11, 0, 2.5);
    } else {
      pos = new THREE.Vector3(4.5 + pointer.x * 2.5, 50 + pointer.y * 1.5, 30);
      alvoLook.set(4.5, 0, 2.5);
    }
    camera.position.lerp(pos, k);
    look.lerp(alvoLook, k);
    camera.lookAt(look);
  });
  return null;
}

function Mapa({ tela }: { tela: Tela }) {
  const indice = useApp((s) => s.indice);
  const malha = useApp((s) => s.malha);
  const metrica = useApp((s) => s.metrica);
  const daltonico = useApp((s) => s.daltonico);

  const geos = useMemo(() => (malha ? malha.features.map(construirGeo) : []), [malha]);
  useEffect(() => () => geos.forEach((g) => { g.geom.dispose(); g.borda.dispose(); }), [geos]);
  const norm = useMemo(() => (indice ? normalizar(indice.ufs, metrica) : null), [indice, metrica]);
  usePres((s) => s.v);
  const camada = usePres((s) => s.camada);
  const pres = usePres((s) => s.pres);

  if (!indice || !norm) return null;
  // Modo Presidente: cor e altura vêm do governo federal
  const presCor = (sigla: string): { cor: string; alt: number; rotulo: string } | null => {
    if (tela !== 'presidente' || !pres) return null;
    const ap = pres.aprovUF[sigla] ?? 50;
    if (camada === 'governadores') {
      const g = pres.governadores.find((x) => x.uf === sigla);
      const r = g?.relacao ?? 0;
      return { cor: r > 0.15 ? '#3ee0b0' : r > -0.15 ? '#f5b942' : '#ff6b5b', alt: 0.5 + (r + 1) * 0.5, rotulo: g ? PARTIDOS[g.partido].sigla : '' };
    }
    if (camada === 'eleicao' && pres.eleicao) {
      const el = pres.eleicao;
      let ids: number[], vs: number[];
      if (el.segundo) { ids = el.segundo.ids; vs = el.segundo.porUF[sigla]; } else if (el.primeiro) { ids = el.candidatos.map((c) => c.id); vs = el.primeiro.porUF[sigla]; }
      else { ids = el.candidatos.filter((c) => c.ativo).map((c) => c.id); const it = pres.intencao(ids).porUF[sigla]; vs = ids.map((i) => it[i]); }
      let k = 0;
      vs.forEach((v, i) => { if (v > vs[k]) k = i; });
      const c = el.candidatos[ids[k]];
      return { cor: PARTIDOS[c.partido].cor, alt: 0.4 + vs[k] * 1.6, rotulo: `${Math.round(vs[k] * 100)}%` };
    }
    return { cor: corRampa(Math.min(1, Math.max(0, (ap - 20) / 50)), daltonico), alt: 0.3 + Math.max(0, ap) / 70, rotulo: `${Math.round(ap)}%` };
  };
  return (
    <group>
      {geos.map((g) => {
        const r = indice.ufs.find((u) => u.sigla === g.sigla)!;
        const n = norm.get(g.sigla)!;
        const pc = presCor(g.sigla);
        const cor = pc ? pc.cor : metrica === 'regiao' || tela === 'menu' || tela === 'presidente-setup' ? CORES_REGIAO[r.regiao.sigla] : corRampa(n.t, daltonico);
        const alt = pc ? pc.alt : tela === 'menu' || tela === 'presidente-setup' ? 0.35 + n.altura * 0.25 : n.altura;
        return <UFMesh key={g.sigla} geo={g} altura={alt} cor={cor} tela={tela} capital={proj(r.tracos.capital.lon, r.tracos.capital.lat)} rotulo={pc?.rotulo} />;
      })}
    </group>
  );
}

export function BrasilScene({ tela }: { tela: Tela }) {
  const setSel = useApp((s) => s.setSelecionada);
  const nivel = useNivel();
  return (
    <Canvas
      shadows
      dpr={nivel === 'baixa' ? 1 : nivel === 'media' ? [1, 1.5] : [1, 2]}
      camera={{ position: [30, 30, 40], fov: 42, near: 0.5, far: 400 }}
      gl={{ antialias: false, toneMapping: THREE.NoToneMapping }}
      onPointerMissed={() => (tela === 'selecao' || tela === 'presidente' || tela === 'presidente-setup') && setSel(null)}
    >
      <color attach="background" args={['#050b0b']} />
      <fog attach="fog" args={['#050b0b', 55, 120]} />
      <hemisphereLight args={['#bfe8ff', '#1b1208', 0.6]} />
      <directionalLight
        position={[-18, 30, 14]}
        intensity={2.6}
        color="#ffd9a8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[22, 10, -18]} intensity={0.7} color="#6fb8ff" />
      <Oceano />
      <Mapa tela={tela} />
      <CameraRig tela={tela} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.85} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <Vignette offset={0.25} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}
