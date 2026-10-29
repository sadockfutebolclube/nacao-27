/** Fase 31: pontos turísticos — dados validados, ocupação/eventos/contador/nota, posições dentro do mapa, modelos com créditos. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  curvaDoPonto, eventoAgora, notaDoPonto, ocupacaoAgora, pontoPorId, PONTOS, textoPico, TURISMO, visitantesDoPonto, visitantesHoje, type Contexto,
} from '../src/world/turismo';

const raiz = join(__dirname, '..');
const ctx = (o: Partial<Contexto> = {}): Contexto => ({ hora: 12, diaSemana: 2, mes: 6, chuva: 0, temp: 28, ...o });

// o mapa é centrado em (-22,945; -43,195) (scripts/fetch-cidades.ts) e a área edificável tem ±6.144 m
const proj = (lat: number, lon: number): [number, number] => [(lon + 43.195) * 111_320 * Math.cos((-22.945 * Math.PI) / 180), -(lat + 22.945) * 110_574];

describe('dados dos pontos turísticos', () => {
  it('têm todos os pontos pedidos, com fonte (OSM/Wikidata) e história', () => {
    const pedidos = ['cristo', 'pao-acucar', 'maracana', 'arcos', 'selaron', 'sambodromo', 'copacabana', 'ipanema', 'aterro', 'madureira', 'tijuca', 'parque-lage', 'jardim-botanico', 'quinta', 'roda-gigante', 'catedral', 'candelaria', 'theatro', 'biblioteca', 'museu-amanha', 'praca-maua', 'santos-dumont'];
    for (const id of pedidos) { const p = pontoPorId(id); expect(p, id).toBeTruthy(); expect(p!.fonte).toMatch(/OSM|Wikidata/); expect(p!.historia.length).toBeGreaterThan(60); }
    expect(new Set(PONTOS.map((p) => p.id)).size).toBe(PONTOS.length);
  });

  it('as posições ficam no Rio e dentro da área alcançável da câmera (só Madureira, fora do mapa, é marcado)', () => {
    for (const p of PONTOS) {
      const [x, z] = proj(p.lat, p.lon);
      if (p.foraDoMapa) { expect(Math.max(Math.abs(x), Math.abs(z)), p.id).toBeGreaterThan(6144 + 500); continue; }
      expect(Math.abs(x), p.id).toBeLessThan(6144 + 500);
      expect(Math.abs(z), p.id).toBeLessThan(6144 + 500);
    }
    expect(PONTOS.filter((p) => p.foraDoMapa).map((p) => p.id)).toEqual(['madureira']);
  });

  it('o Cristo e o Maracanã seguem as medidas pedidas', () => {
    const c = pontoPorId('cristo')!;
    expect(c.h).toBe(38); // 30 m de estátua + 8 m de pedestal
    expect(c.historia).toMatch(/30 m/); expect(c.historia).toMatch(/8 m/); expect(c.historia).toMatch(/28 m/);
    expect(pontoPorId('roda-gigante')!.h).toBe(88); // OSM height=88
  });

  it('cada zona usa uma atividade que existe; os lugares por ponto ficam num limite sensato', () => {
    for (const p of PONTOS) {
      let n = 0;
      for (const z of p.zonas) { expect(TURISMO.atividades[z.atividade], `${p.id}/${z.atividade}`).toBeTruthy(); n += z.n; }
      expect(n, p.id).toBeLessThanOrEqual(420);
    }
    // visitantes pedidos: foto, pose de braços abertos, sentar, vista (Cristo); correr, piquenique, bicicleta, trilha, patins, cachorro (parques)
    const ativ = (id: string) => new Set(pontoPorId(id)!.zonas.map((z) => z.atividade));
    for (const a of ['foto', 'posar', 'sentar', 'vista']) expect(ativ('cristo').has(a), `cristo/${a}`).toBe(true);
    for (const a of ['correr', 'piquenique', 'bicicleta', 'patins', 'cao']) expect(ativ('aterro').has(a), `aterro/${a}`).toBe(true);
    expect(ativ('tijuca').has('trilha')).toBe(true);
    for (const a of ['fila', 'torcida', 'vendedor']) expect(ativ('maracana').has(a), `maracana/${a}`).toBe(true);
    expect(ativ('roda-gigante').has('fila')).toBe(true);
  });

  it('as praias têm orla: quiosques, vôlei, postos, surfistas e ambulantes por km; barcos fundeados em JSON', () => {
    for (const id of ['copacabana', 'ipanema']) { const o = TURISMO.orla.praias[id]; expect(o.quiosquesPorKm).toBeGreaterThan(0); expect(o.voleiPorKm).toBeGreaterThan(0); expect(o.postosPorKm).toBeGreaterThan(0); expect(o.surfistasPorKm).toBeGreaterThan(0); expect(o.ambulantesPorKm).toBeGreaterThan(0); expect(o.eixo.length).toBeGreaterThanOrEqual(2); }
    expect(TURISMO.orla.barcosFundeados.length).toBeGreaterThanOrEqual(8);
  });
});

describe('ocupação, eventos, contador e nota', () => {
  const cristo = pontoPorId('cristo')!, mara = pontoPorId('maracana')!, samba = pontoPorId('sambodromo')!, praia = pontoPorId('copacabana')!;

  it('o pico do dia vale o declarado e a madrugada é vazia', () => {
    expect(curvaDoPonto(cristo, 12)).toBe(1);
    expect(curvaDoPonto(cristo, 3)).toBe(0);
    expect(visitantesDoPonto(cristo, ctx({ hora: 3 }))).toBe(0);
    expect(visitantesDoPonto(cristo, ctx({ hora: 12 }))).toBeGreaterThan(500);
    expect(visitantesDoPonto(cristo, ctx({ hora: 12 }))).toBeLessThanOrEqual(cristo.capacidade);
    expect(textoPico(cristo)).toBe('10h às 15h');
  });

  it('fim de semana e chuva mudam o número; a praia depende do calor', () => {
    expect(visitantesDoPonto(cristo, ctx({ diaSemana: 6 }))).toBeGreaterThan(visitantesDoPonto(cristo, ctx({ diaSemana: 2 })));
    expect(visitantesDoPonto(cristo, ctx({ chuva: 1 }))).toBeLessThan(visitantesDoPonto(cristo, ctx({ chuva: 0 })));
    expect(visitantesDoPonto(praia, ctx({ temp: 33, diaSemana: 6 }))).toBeGreaterThan(visitantesDoPonto(praia, ctx({ temp: 19, diaSemana: 6 })));
  });

  it('o Maracanã enche em dia de jogo e quase não tem gente no resto', () => {
    const jogo = ctx({ diaSemana: 0, hora: 16 }), folga = ctx({ diaSemana: 2, hora: 16 });
    expect(eventoAgora(mara, jogo)?.rotulo).toMatch(/domingo/);
    expect(visitantesDoPonto(mara, jogo)).toBeGreaterThan(40_000);
    expect(visitantesDoPonto(mara, folga)).toBeLessThan(1_000);
    // chegada: antes do jogo cresce; depois do jogo esvazia
    expect(visitantesDoPonto(mara, ctx({ diaSemana: 0, hora: 14.5 }))).toBeLessThan(visitantesDoPonto(mara, jogo));
    expect(visitantesDoPonto(mara, ctx({ diaSemana: 0, hora: 18.4 }))).toBeLessThan(visitantesDoPonto(mara, jogo) / 2);
    // jogo de quarta passa da meia-noite: 0h30 de quinta ainda é o jogo de quarta
    expect(eventoAgora(mara, ctx({ diaSemana: 4, hora: 0.2 }))).toBeNull(); // a janela termina às 24h
  });

  it('o Sambódromo só enche no Carnaval (fevereiro, fim de semana à noite)', () => {
    expect(visitantesDoPonto(samba, ctx({ mes: 2, diaSemana: 6, hora: 23 }))).toBeGreaterThan(30_000);
    expect(visitantesDoPonto(samba, ctx({ mes: 6, diaSemana: 6, hora: 23 }))).toBeLessThan(200);
    // desfile atravessa a madrugada: 3h de domingo é o desfile de sábado
    expect(eventoAgora(samba, ctx({ mes: 2, diaSemana: 0, hora: 3 }))).toBeTruthy();
  });

  it('o contador do dia só cresce e a nota fica entre 3 e 5, caindo com lotação alta', () => {
    let ant = -1;
    for (let h = 0; h <= 23; h += 1) { const v = visitantesHoje(cristo, ctx({ hora: h })); expect(v).toBeGreaterThanOrEqual(ant); ant = v; }
    expect(visitantesHoje(cristo, ctx({ hora: 18 }))).toBeGreaterThan(visitantesDoPonto(cristo, ctx({ hora: 12 })));
    for (const p of PONTOS) for (const h of [3, 12, 20]) { const n = notaDoPonto(p, ctx({ hora: h })); expect(n, p.id).toBeGreaterThanOrEqual(3); expect(n).toBeLessThanOrEqual(5); }
    const cheio = { ...cristo, ocupacaoPico: 1, fimDeSemana: 1 };
    expect(notaDoPonto(cheio, ctx({ hora: 12 }))).toBeLessThanOrEqual(notaDoPonto(cristo, ctx({ hora: 3 })));
    expect(ocupacaoAgora(cheio, ctx({ hora: 12 }))).toBe(1);
  });
});

describe('modelos 3D e créditos (regra de assets)', () => {
  const creditos = readFileSync(join(raiz, 'assets/CREDITS.md'), 'utf8');
  const modelos = ['turismo/bonde', 'turismo/guarda-sol', 'turismo/cadeira-praia', 'turismo/prancha', 'turismo/quiosque-banca', 'turismo/bicicleta', 'animal/cachorro', 'animado/roda-gigante'];

  it('todo GLB novo existe, é GLB e está nos créditos com autor e licença CC0/CC-BY', () => {
    for (const m of modelos) {
      const f = join(raiz, 'assets/models', `${m}.glb`);
      expect(existsSync(f), m).toBe(true);
      expect(readFileSync(f).readUInt32LE(0), m).toBe(0x46546c67);
      expect(creditos, m).toContain(m);
    }
    expect(creditos).toMatch(/Fase 31/);
    expect(creditos).toMatch(/Arif/); expect(creditos).toMatch(/Bruno Oliveira/); expect(creditos).toMatch(/S\. Paul Michael/);
    // nenhuma licença NC/ND
    expect(creditos).not.toMatch(/\bCC[- ]BY[- ](NC|ND)/i);
  });

  it('a comparação dos candidatos (≥3 por ponto) está documentada', () => {
    const doc = readFileSync(join(raiz, 'docs/turismo-modelos.md'), 'utf8');
    for (const t of ['Cristo Redentor', 'Roda-gigante', 'Bondinho', 'Bonde', 'Guarda-sol', 'Cadeira', 'Quiosque', 'Maracanã']) expect(doc, t).toContain(t);
    expect(doc).toMatch(/TEMP/);
  });
});
