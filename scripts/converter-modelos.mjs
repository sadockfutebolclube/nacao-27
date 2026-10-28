// npm run converter-modelos
// Converte os modelos baixados (data/cache/modelos-origem: Kenney CC0 e Poly Pizza CC-BY/CC0) em GLB com compressão meshopt,
// limpos (sem nós vazios, vértices soldados, texturas ≤ 1024 px) e os grava em assets/models/<categoria>/<nome>.glb.
// Os créditos de cada um estão em assets/CREDITS.md. O jogo normaliza escala e orientação pelo catálogo (src/data/veiculos/especiais.json).
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(raiz, 'data/cache/modelos-origem');
const W = join(origem, 'kenney-watercraft/Models/GLB format');
const C = join(origem, 'kenney-car/Models/GLB format');
const P = join(origem, 'polypizza');

/** [arquivo de origem, categoria, nome de saída] */
const LISTA = [
  [`${P}/aviao-linha-a.glb`, 'aviao', 'aviao-linha-a'],
  [`${P}/aviao-linha-b.glb`, 'aviao', 'aviao-linha-b'],
  [`${P}/aviao-pequeno.glb`, 'aviao', 'aviao-pequeno'],
  [`${P}/caca.glb`, 'aviao', 'caca'],
  [`${P}/heli-escuro.glb`, 'helicoptero', 'heli-escuro'],
  [`${P}/heli-amarelo.glb`, 'helicoptero', 'heli-amarelo'],
  [`${P}/heli-branco.glb`, 'helicoptero', 'heli-branco'],
  [`${P}/heli-grande.glb`, 'helicoptero', 'heli-grande'],
  [`${P}/heli-militar.glb`, 'helicoptero', 'heli-militar'],
  [`${P}/humvee.glb`, 'terrestre', 'humvee'],
  ...['ship-cargo-a', 'ship-cargo-b', 'ship-cargo-c', 'ship-large', 'ship-ocean-liner', 'ship-ocean-liner-small', 'ship-small',
    'boat-fishing-small', 'boat-sail-a', 'boat-sail-b', 'boat-speed-a', 'boat-speed-b', 'boat-speed-d', 'boat-tug-a', 'boat-row-small', 'boat-tow-a'].map((n) => [`${W}/${n}.glb`, 'navio', n]),
  ...['police', 'ambulance', 'firetruck', 'truck', 'suv', 'van', 'sedan', 'hatchback-sports', 'taxi', 'delivery', 'garbage-truck'].map((n) => [`${C}/${n}.glb`, 'terrestre', n]),
  // Fase 30: ônibus e moto (Poly Pizza, CC-BY)
  // Fase 30: personagens com esqueleto (sem quantização: a pele precisa das posições em float)
  [`${origem}/pessoas/homem.glb`, 'pessoa', 'homem'],
  [`${P}/onibus-a.glb`, 'terrestre', 'onibus-a'], [`${P}/moto-b.glb`, 'terrestre', 'moto-b'],
];

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
let antes = 0, depois = 0;
for (const [src, cat, nome] of LISTA) {
  const doc = await io.read(src);
  if (cat === 'pessoa') await doc.transform(dedup(), prune());
  else await doc.transform(dedup(), prune(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  for (const t of doc.getRoot().listTextures()) { const [w, h] = t.getSize() ?? [0, 0]; if (Math.max(w, h) > 1024) throw new Error(`${nome}: textura ${w}x${h} > 1024`); }
  const dst = join(raiz, 'assets/models', cat, `${nome}.glb`);
  mkdirSync(dirname(dst), { recursive: true });
  await io.write(dst, doc);
  const a = statSync(src).size, d = statSync(dst).size;
  antes += a; depois += d;
  console.log(`${cat}/${nome}.glb  ${(a / 1024).toFixed(0)} KB → ${(d / 1024).toFixed(0)} KB`);
}
console.log(`total ${(antes / 1024).toFixed(0)} KB → ${(depois / 1024).toFixed(0)} KB (${LISTA.length} modelos)`);
void EXTMeshoptCompression;
