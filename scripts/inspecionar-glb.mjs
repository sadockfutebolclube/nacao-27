// node scripts/inspecionar-glb.mjs <arquivos.glb...>  -> nós, caixa, triângulos, materiais e texturas de cada GLB
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  const sc = root.getDefaultScene() ?? root.listScenes()[0];
  const b = getBounds(sc);
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  const nos = root.listNodes().map((n) => n.getName() + (n.getMesh() ? '*' : '')).join(',');
  const tex = root.listTextures().map((t) => `${t.getSize()?.join('x')}`).join(' ');
  const mats = root.listMaterials().map((m) => `${m.getName()}${m.getBaseColorTexture() ? '[tex]' : ''}`).join(',');
  const sz = (b.max.map((v, i) => (v - b.min[i]).toFixed(2))).join('×');
  console.log(`${f.replace(/.*[\\/]/, '')}: ${Math.round(tris)} tris · caixa ${sz} (min ${b.min.map((v) => v.toFixed(1))}) · nós [${nos}] · mats [${mats}] · tex ${tex || '-'}`);
}
