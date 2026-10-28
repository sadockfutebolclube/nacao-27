/** Fase 24: densidade de pedestres dirigida por dados (uso do solo, horário, POIs, classe da região). */
import { describe, expect, it } from 'vitest';
import type { CidadeReal } from '../src/data/cidadeReal';
import { ATIVIDADES, CLASSES, CONFIG, PERSONAS, celulaDe, construirGrade, curva, Densidade, densidadeClasse, diaDaSemana, fimDeSemana, somarVias, sortearPersonaAtividade, visivelDe } from '../src/render/city/densidade';
import { corCalor } from '../src/render/city/MapaCalorPedestres';
import { BUILD_HALF } from '../src/world/constants';

describe('configuração (pedestres.json)', () => {
  it('rotinas começam à meia-noite, estão em ordem e só usam atividades conhecidas', () => {
    for (const p of PERSONAS) {
      const r = CONFIG.personas[p] as { util: (number | string)[][]; fds: (number | string)[][] };
      for (const dia of [r.util, r.fds]) {
        expect(dia[0][0], p).toBe(0);
        for (let i = 1; i < dia.length; i++) expect(dia[i][0] as number, p).toBeGreaterThan(dia[i - 1][0] as number);
        for (const b of dia) expect(ATIVIDADES.includes(b[1] as never), `${p}: ${b[1]}`).toBe(true);
      }
    }
  });

  it('a mistura de personas de cada classe soma ~1 e todas as classes têm pico e mistura', () => {
    for (const c of CLASSES) {
      const cl = CONFIG.classes[c];
      expect(cl.pico, c).toBeGreaterThan(0);
      const soma = Object.values(cl.mistura as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(soma, c).toBeGreaterThan(0.95);
      expect(soma, c).toBeLessThan(1.05);
    }
  });
});

describe('rotina: quem está na rua em cada hora', () => {
  it('de madrugada quase ninguém; nos horários de deslocamento a maioria dos trabalhadores', () => {
    expect(visivelDe('trabalhador', 3, false)).toBeLessThan(0.02);
    expect(visivelDe('trabalhador', 7, false)).toBeGreaterThan(0.6);
    expect(visivelDe('trabalhador', 18, false)).toBeGreaterThan(0.5);
    expect(visivelDe('trabalhador', 10, false)).toBeLessThan(0.3); // dentro do trabalho
  });

  it('no fim de semana o trabalhador sai de manhã cedo bem menos e passeia à tarde', () => {
    expect(visivelDe('trabalhador', 7, true)).toBeLessThan(visivelDe('trabalhador', 7, false) * 0.3);
    expect(visivelDe('trabalhador', 11, true)).toBeGreaterThan(visivelDe('trabalhador', 11, false));
  });

  it('esportista corre cedo e no fim da tarde, ambulante trabalha o dia todo na rua', () => {
    expect(visivelDe('esportista', 6, false)).toBeGreaterThan(0.8);
    expect(visivelDe('esportista', 12, false)).toBeLessThan(0.05);
    expect(visivelDe('ambulante', 13, false)).toBeGreaterThan(0.9);
    expect(visivelDe('ambulante', 2, false)).toBeLessThan(0.02);
  });

  it('a curva é contínua: meia hora de diferença não muda mais que ~35%', () => {
    for (const p of PERSONAS) for (let h = 0; h < 24; h += 0.5) {
      expect(Math.abs(visivelDe(p, h + 0.5, false) - visivelDe(p, h, false)), `${p} ${h}h`).toBeLessThan(0.35);
    }
  });
});

describe('densidade por classe, hora e dia', () => {
  it('rua residencial de madrugada ≈ 0; Centro cheio no horário comercial e vazio à noite', () => {
    expect(densidadeClasse('residencial', 3, false)).toBeLessThan(0.6);
    expect(densidadeClasse('residencial', 8, false)).toBeGreaterThan(densidadeClasse('residencial', 3, false) * 10);
    const c10 = densidadeClasse('centro', 10, false), c23 = densidadeClasse('centro', 23, false);
    expect(c10).toBeGreaterThan(12);
    expect(c23).toBeLessThan(c10 * 0.2);
  });

  it('orla de dia é alta e à noite baixa; sábado na orla > dia útil; Centro no sábado < dia útil', () => {
    expect(densidadeClasse('orla', 11, true)).toBeGreaterThan(densidadeClasse('orla', 11, false));
    expect(densidadeClasse('orla', 11, false)).toBeGreaterThan(densidadeClasse('orla', 2, false) * 8);
    expect(densidadeClasse('centro', 10, true)).toBeLessThan(densidadeClasse('centro', 10, false) * 0.6);
  });

  it('a classe "vazio" (mato, morro) quase não tem ninguém em hora alguma', () => {
    for (let h = 0; h < 24; h += 1) expect(densidadeClasse('vazio', h, false)).toBeLessThan(1.5);
  });

  it('curva() interpola e é circular nas pontas', () => {
    const c = [[0, 1], [12, 3], [24, 1]];
    expect(curva(c, 6)).toBeCloseTo(2);
    expect(curva(c, 30)).toBeCloseTo(2); // 30 h = 6 h
  });

  it('dia da semana do calendário do jogo (1/1/2027 é sexta; 2/1 é sábado)', () => {
    expect(diaDaSemana(2027, 1, 1)).toBe(5);
    expect(fimDeSemana(diaDaSemana(2027, 1, 2))).toBe(true);
    expect(fimDeSemana(diaDaSemana(2027, 1, 4))).toBe(false);
  });
});

/** cidade de mentira: 1 quarteirão comercial denso, 1 residencial, resto vazio; a água fica a leste (x > 2000) */
function cidadeFalsa(): CidadeReal {
  const predios: number[] = [];
  const add = (x: number, z: number, tipo: number, n: number) => { for (let i = 0; i < n; i++) predios.push(x + (i % 5) * 9, z + Math.floor(i / 5) * 9, 0, 14, 14, tipo === 1 ? 8 : 3, tipo, 1, -1); };
  add(-1000, -1000, 1, 25); // comercial, alto
  add(0, 0, 0, 25); // residencial, baixo
  return { predios, bairros: [-980, -980, 0, 0], nomesBairros: ['Centro'] } as unknown as CidadeReal;
}

describe('grade de classes a partir dos prédios', () => {
  const grade = construirGrade({ real: cidadeFalsa(), distAgua: (x) => (x > 2000 ? 0 : 2000 - x) });
  const peso = (x: number, z: number, c: (typeof CLASSES)[number]) => grade.peso[celulaDe(grade, x, z) * CLASSES.length + CLASSES.indexOf(c)];

  it('os pesos de cada célula somam 1 (ou 0 dentro da água)', () => {
    for (let k = 0; k < grade.n * grade.n; k += 97) {
      let s = 0;
      for (let c = 0; c < CLASSES.length; c++) s += grade.peso[k * CLASSES.length + c];
      expect(s === 0 || Math.abs(s - 1) < 1e-4, `célula ${k}: ${s}`).toBe(true);
    }
    expect(celulaDe(grade, BUILD_HALF - 5, 0)).toBeGreaterThanOrEqual(0);
  });

  it('terreno sem prédio é vazio, quarteirão comercial no bairro "Centro" é centro, quarteirão de casas é residencial', () => {
    expect(peso(-3000, 3000, 'vazio')).toBeGreaterThan(0.9);
    expect(peso(-980, -980, 'centro')).toBeGreaterThan(0.5);
    expect(peso(20, 20, 'residencial')).toBeGreaterThan(0.5);
  });

  it('dentro da água ninguém anda; perto da água é orla', () => {
    expect(grade.peso.slice(celulaDe(grade, 2500, 0) * CLASSES.length, celulaDe(grade, 2500, 0) * CLASSES.length + CLASSES.length).every((v) => v === 0)).toBe(true);
    expect(peso(1900, 4000, 'orla')).toBeGreaterThan(0.5);
  });

  it('Densidade: o mesmo lugar tem mais gente às 10h que às 3h; modelo agregado soma densidade × via', () => {
    const d = new Densidade(grade);
    d.preparar(10, false);
    const dia = d.em(-980, -980);
    d.preparar(3, false);
    const noite = d.em(-980, -980);
    expect(dia).toBeGreaterThan(noite * 8);
    somarVias(grade, [[-980, -980, 500], [20, 20, 500]]);
    d.preparar(10, false);
    const t10 = d.total();
    d.preparar(3, false);
    expect(t10).toBeGreaterThan(d.total() * 5);
    expect(t10).toBeCloseTo((d.preparar(10, false), d.celula(celulaDe(grade, -980, -980)) * 5 + d.celula(celulaDe(grade, 20, 20)) * 5), 6);
  });

  it('parada de ônibus reforça a densidade na hora do rush', () => {
    const g2 = construirGrade({ real: cidadeFalsa(), distAgua: () => 5000, paradas: [20, 20, 0] });
    const d = new Densidade(g2), d0 = new Densidade(grade);
    d.preparar(7.5, false); d0.preparar(7.5, false);
    expect(d.em(20, 20)).toBeGreaterThan(d0.em(20, 20) + 3);
  });
});

describe('quem nasce: persona e atividade da rotina', () => {
  it('às 8h de um dia útil no centro, a maioria visível está se deslocando; ninguém dorme na rua', () => {
    const pesos = new Float64Array(CLASSES.length);
    pesos[CLASSES.indexOf('centro')] = 1;
    let desloca = 0, n = 0;
    for (let i = 0; i < 400; i++) {
      const { persona, atividade } = sortearPersonaAtividade(pesos, 8, false, (i * 0.618) % 1, ((i * 0.377) + 0.11) % 1);
      expect(PERSONAS.includes(persona)).toBe(true);
      expect(atividade === 'dorme' || atividade === 'casa').toBe(false);
      if (atividade === 'desloca') desloca++;
      n++;
    }
    expect(desloca / n).toBeGreaterThan(0.45);
  });
});

describe('mapa de calor', () => {
  it('rampa: transparente sem gente, azul → vermelho com mais gente', () => {
    const c: [number, number, number, number] = [0, 0, 0, 0];
    corCalor(0, c);
    expect(c[3]).toBe(0);
    corCalor(0.2, c);
    expect(c[2]).toBeGreaterThan(c[0]); // azulado
    corCalor(1, c);
    expect(c[0]).toBeGreaterThan(200); // vermelho
    expect(c[2]).toBeLessThan(80);
  });
});
