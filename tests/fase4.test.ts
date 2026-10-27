import { describe, expect, it } from 'vitest';
import traits from '../data/ufs/traits.json';
import { ArquivoTracos } from '../src/data/schemas';
import { Zone } from '../src/sim/catalog';
import type { SimInit } from '../src/sim/protocol';
import { Simulation, TICKS_POR_DIA } from '../src/sim/simulation';
import { Transporte } from '../src/sim/city/transporte';
import { generateTerrain, sampleHeight } from '../src/world/terrain';
import { initDe } from './helpers';

const rj = ArquivoTracos.parse(traits).ufs.find((u) => u.sigla === 'RJ')!;
const hm = generateTerrain(2027, rj.terreno, 'mata-atlantica');
const init = (comEstado: boolean): SimInit => ({
  sigla: 'RJ', nomeEstado: 'Rio de Janeiro', cidade: 'Rio de Janeiro', terreno: rj.terreno, bioma: 'mata-atlantica',
  latitude: rj.capital.lat, efeitos: Object.assign({}, ...rj.tracos.map((t) => t.efeitos)), esgotoUF: 66, festas: rj.festas,
  regiao: 'Sudeste', seed: 2027, modo: 'mandato', estado: comEstado ? initDe('RJ') : undefined,
});

function origem(): [number, number] {
  for (let r = 0; r < 1200; r += 40) for (let a = 0; a < Math.PI * 2; a += 0.4) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let ok = true;
    for (let dx = -320; dx <= 320 && ok; dx += 40) for (let dz = -240; dz <= 240 && ok; dz += 40) {
      const h = sampleHeight(hm, x + dx, z + dz);
      if (h < 1.2 || h > 40) ok = false;
    }
    if (ok) return [x, z];
  }
  return [0, -600];
}

const dias = (sim: Simulation, n: number) => { for (let i = 0; i < n * TICKS_POR_DIA; i++) sim.step(); };

/** Bairro de empregos (indústria + comércio) com pouca moradia: receita para déficit habitacional. */
function cidadeComEmpregos(comEstado = false) {
  const sim = new Simulation(init(comEstado), hm);
  sim.caixa = 5e9; // foco no comportamento, não no dinheiro
  const [ox, oz] = origem();
  for (let k = -1; k <= 1; k++) {
    expect(sim.command({ kind: 'road', req: { x0: ox - 300, z0: oz + k * 80, cx: ox, cz: oz + k * 80, x1: ox + 300, z1: oz + k * 80, type: k === 0 ? 'avenida' : 'rua' } }).ok).toBe(true);
  }
  for (let k = -2; k <= 2; k++) sim.command({ kind: 'road', req: { x0: ox + k * 140, z0: oz - 160, cx: ox + k * 140, cz: oz, x1: ox + k * 140, z1: oz + 160, type: 'rua' } });
  sim.command({ kind: 'zone', x: ox - 150, z: oz, radius: 170, zone: Zone.Industrial });
  sim.command({ kind: 'zone', x: ox + 150, z: oz, radius: 170, zone: Zone.Comercial });
  sim.command({ kind: 'zone', x: ox, z: oz - 150, radius: 60, zone: Zone.ResAlta });
  for (const eq of ['reservatorio', 'subestacao', 'reservatorio', 'subestacao']) {
    for (let dx = -300; dx <= 300; dx += 25) if (sim.command({ kind: 'service', eq, x: ox + dx, z: oz + 200 }).ok) break;
  }
  return { sim, ox, oz };
}

describe('Fase 4 — favelas e território', () => {
  it('déficit de moradia popular faz surgir favela, que cresce e semeia domínio territorial', () => {
    const { sim } = cidadeComEmpregos();
    dias(sim, 400);
    expect(sim.empregos).toBeGreaterThan(200);
    expect(sim.favelas.ativas().length).toBeGreaterThan(0);
    const f = sim.favelas.ativas()[0];
    expect(f.casas.length).toBeGreaterThan(8);
    expect(sim.populacaoInformal).toBeGreaterThan(30);
    expect(sim.territorio.controleEm(f.cx, f.cz)).toBeGreaterThan(0.15);
    expect(sim.noticias.some((n) => n.texto.includes('Ocupação irregular'))).toBe(true);
  }, 120_000);

  it('operação policial derruba o domínio na hora; ação repetida no mesmo lugar é bloqueada', () => {
    const { sim } = cidadeComEmpregos();
    dias(sim, 400);
    const f = sim.favelas.ativas()[0];
    sim.territorio.semear(f.cx, f.cz, f.grupo, 0.8);
    const antes = sim.territorio.controleEm(f.cx, f.cz);
    const r = sim.command({ kind: 'operacao', x: f.cx, z: f.cz });
    expect(r.ok).toBe(true);
    expect(sim.territorio.controleEm(f.cx, f.cz)).toBeLessThan(antes * 0.5);
    expect(sim.command({ kind: 'operacao', x: f.cx, z: f.cz }).ok).toBe(false);
  }, 120_000);

  it('urbanização vira obra do Estado e, concluída, a favela fica urbanizada', () => {
    const { sim } = cidadeComEmpregos(true);
    dias(sim, 400);
    const f = sim.favelas.ativas()[0];
    expect(sim.command({ kind: 'favela', id: f.id, acao: 'urbanizar' }).ok).toBe(true);
    expect(f.status).toBe('urbanizando');
    // dá dinheiro para a obra andar
    sim.estado!.loa = { ...sim.estado!.loa, investimento: { ...sim.estado!.loa.investimento, infraestrutura: sim.estado!.loa.investimento.infraestrutura + 3e9 } };
    dias(sim, 900);
    expect(sim.favelas.ativas().find((x) => x.id === f.id)?.status).toBe('urbanizada');
  }, 180_000);

  it('ZEIS cresce para atender o déficit popular', () => {
    const { sim, ox, oz } = cidadeComEmpregos();
    sim.command({ kind: 'zone', x: ox, z: oz + 150, radius: 120, zone: Zone.ZEIS });
    dias(sim, 300);
    let zeis = 0;
    for (let i = 0; i < sim.lots.length; i++) if (sim.arch[i] === 13 || sim.arch[i] === 14) zeis++;
    expect(zeis).toBeGreaterThan(3);
  }, 120_000);
});

describe('Fase 4 — serviços e mobilidade', () => {
  it('posto de saúde, escola e delegacia dão cobertura e reduzem o crime estimado', () => {
    const { sim, ox, oz } = cidadeComEmpregos();
    dias(sim, 120);
    const crimeAntes = sim.servicosSociais.resumo.crime;
    for (const eq of ['ubs', 'escola', 'delegacia']) {
      for (let dx = -250; dx <= 250; dx += 20) if (sim.command({ kind: 'service', eq, x: ox + dx, z: oz - 200 }).ok) break;
    }
    dias(sim, 60);
    expect(sim.servicosSociais.resumo.saude).toBeGreaterThan(0.1);
    expect(sim.servicosSociais.resumo.educacao).toBeGreaterThan(0.1);
    expect(sim.servicosSociais.resumo.seguranca).toBeGreaterThan(0.1);
    expect(sim.servicosSociais.resumo.crime).toBeLessThan(crimeAntes + 0.05);
  }, 120_000);

  it('linha de ônibus nas vias: traçado, passageiros, divisão modal e volumes nas ruas', () => {
    const { sim, ox, oz } = cidadeComEmpregos();
    dias(sim, 200);
    const paradas = [{ x: ox - 280, z: oz }, { x: ox, z: oz }, { x: ox + 280, z: oz }];
    const plano = Transporte.planejar(sim.graph, 'onibus', paradas);
    expect(plano.ok).toBe(true);
    expect(plano.comprimento).toBeGreaterThan(400);
    expect(sim.command({ kind: 'linha', tipo: 'onibus', paradas }).ok).toBe(true);
    dias(sim, 30);
    const r = sim.transporte.resumo;
    expect(r.viagensDia).toBeGreaterThan(0);
    expect(r.tempoMedio).toBeGreaterThan(2);
    const m = r.modal;
    expect(m.carro + m.coletivo + m.ape + m.informal).toBeCloseTo(1, 3);
    expect(sim.transporte.volumes.size).toBeGreaterThan(0);
    // BRT exige avenidas: a rua lateral não serve
    expect(Transporte.planejar(sim.graph, 'brt', [{ x: ox - 280, z: oz - 80 }, { x: ox + 280, z: oz - 80 }]).ok).toBe(false);
  }, 120_000);

  it('metrô vira obra estadual e passa a operar quando concluído', () => {
    const { sim, ox, oz } = cidadeComEmpregos(true);
    dias(sim, 60);
    const r = sim.command({ kind: 'linha', tipo: 'metro', paradas: [{ x: ox - 300, z: oz }, { x: ox + 300, z: oz }] });
    expect(r.ok).toBe(true);
    const linha = sim.transporte.linhas[0];
    expect(linha.status).toBe('em_obra');
    expect(sim.estado!.obras.some((o) => o.custom?.ref.id === linha.id)).toBe(true);
    sim.estado!.loa = { ...sim.estado!.loa, investimento: { ...sim.estado!.loa.investimento, transporte: 6e9 } };
    dias(sim, 365 * 4);
    expect(linha.status).toBe('operando');
  }, 240_000);

  it('save/load preserva favelas, território e linhas', () => {
    const { sim, ox, oz } = cidadeComEmpregos();
    dias(sim, 300);
    sim.command({ kind: 'linha', tipo: 'onibus', paradas: [{ x: ox - 280, z: oz }, { x: ox + 280, z: oz }] });
    dias(sim, 20);
    const save = JSON.parse(JSON.stringify(sim.serialize()));
    const copia = Simulation.deserialize(save, hm);
    expect(copia.favelas.ativas().length).toBe(sim.favelas.ativas().length);
    expect(copia.transporte.linhas.length).toBe(1);
    dias(sim, 30); dias(copia, 30);
    expect(copia.populacaoInformal).toBe(sim.populacaoInformal);
    expect(copia.transporte.resumo.viagensDia).toBe(sim.transporte.resumo.viagensDia);
  }, 120_000);
});
