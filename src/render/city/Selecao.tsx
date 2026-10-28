/**
 * Contorno da entidade selecionada (Fase 25): as 12 arestas da caixa dela (a mesma usada no picking) em amarelo, por cima de
 * tudo, mais um anel no chão e, nas entidades pequenas (pessoas, carros), um marcador flutuante que cresce com a distância
 * para ser achado de longe. Segue a entidade a cada quadro; se ela saiu de cena (a pessoa entrou num prédio) some.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { registro } from '../../entidades/registro';
import { useSelecao } from '../../entidades/selecao';

const COR = '#ffd45e';

export function Selecao() {
  const sel = useSelecao();
  const camera = useThree((s) => s.camera);
  const grupo = useRef<THREE.Group>(null);
  const marcador = useRef<THREE.Mesh>(null);
  const anel = useRef<THREE.Mesh>(null);

  const rec = useMemo(() => {
    // caixa unitária de arestas: de −0,5 a 0,5 em x e z, de 0 a 1 em y
    const caixa = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    const mCaixa = new THREE.LineBasicMaterial({ color: COR, depthTest: false, transparent: true, opacity: 0.95 });
    const aneis = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
    const mAnel = new THREE.MeshBasicMaterial({ color: COR, depthTest: false, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const cone = new THREE.ConeGeometry(0.5, 1.2, 4).rotateX(Math.PI);
    const mCone = new THREE.MeshBasicMaterial({ color: COR, depthTest: false, transparent: true, opacity: 0.95 });
    const linhas = new THREE.LineSegments(caixa, mCaixa);
    linhas.renderOrder = 999;
    return { caixa, mCaixa, aneis, mAnel, cone, mCone, linhas };
  }, []);
  useEffect(() => () => { rec.caixa.dispose(); rec.mCaixa.dispose(); rec.aneis.dispose(); rec.mAnel.dispose(); rec.cone.dispose(); rec.mCone.dispose(); }, [rec]);

  const tmp = useMemo(() => ({ x: 0, y: 0, z: 0, yaw: 0, w: 0, h: 0, d: 0 }), []);
  useFrame(({ clock }) => {
    const g = grupo.current, m = marcador.current, a = anel.current;
    if (!g || !m || !a) return;
    const cx = sel.id !== null ? registro.caixaDe(sel.id, tmp) : null;
    g.visible = !!cx;
    if (!cx) return;
    g.position.set(cx.x, cx.y, cx.z);
    g.rotation.y = cx.yaw;
    rec.linhas.scale.set(Math.max(0.2, cx.w), Math.max(0.2, cx.h), Math.max(0.2, cx.d));
    const pequeno = cx.w * cx.d < 40;
    // anel no chão (não gira com a caixa)
    const raio = Math.max(cx.w, cx.d) * (pequeno ? 0.9 : 0.62) + 0.5;
    a.rotation.y = -cx.yaw;
    a.scale.setScalar(raio);
    a.position.y = 0.08;
    // marcador flutuante, maior quanto mais longe a câmera
    m.visible = pequeno;
    if (pequeno) {
      const dist = camera.position.distanceTo(g.position);
      const k = Math.min(10, Math.max(1, dist / 35));
      m.scale.setScalar(k);
      m.position.y = cx.h + 1.4 * k + Math.sin(clock.elapsedTime * 3) * 0.15 * k;
    }
  });

  if (sel.id === null) return null;
  return (
    <group ref={grupo} visible={false}>
      <primitive object={rec.linhas} />
      <mesh ref={anel} geometry={rec.aneis} material={rec.mAnel} renderOrder={998} />
      <mesh ref={marcador} geometry={rec.cone} material={rec.mCone} renderOrder={999} />
    </group>
  );
}
