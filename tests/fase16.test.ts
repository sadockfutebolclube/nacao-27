import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bairroMaisPerto, CidadeReal } from '../src/data/cidadeReal';
import { lotacaoPraia } from '../src/render/city/Praia';
import { sortearTipo } from '../src/render/city/Veiculos';

const arq = 'public/data/cidades/3304557.json';
const rio = existsSync(arq) ? CidadeReal.parse(JSON.parse(readFileSync(arq, 'utf8'))) : null;

describe('Fase 16 — frota, gente e bairros', () => {
  it('a frota tem os tipos do Rio e as proporções mudam entre avenida e rua', () => {
    const conta = (avenida: boolean, faixas: number) => {
      const c = new Map<number, number>();
      for (let i = 0; i < 20000; i++) { const t = sortearTipo((i + 0.5) / 20000, avenida, faixas); c.set(t, (c.get(t) ?? 0) + 1); }
      return c;
    };
    const av = conta(true, 4), rua = conta(false, 2);
    for (const t of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) expect(av.has(t) || rua.has(t), `tipo ${t}`).toBe(true);
    // BRT só em avenida larga; mais ônibus na avenida que na rua
    expect(av.get(9) ?? 0).toBeGreaterThan(0);
    expect(rua.get(9) ?? 0).toBe(0);
    expect(conta(true, 2).get(9) ?? 0).toBe(0);
    expect(av.get(1)!).toBeGreaterThan(rua.get(1)!);
    // viatura e caminhão de lixo são raros
    expect((av.get(10) ?? 0) / 20000).toBeLessThan(0.03);
    expect((av.get(11) ?? 0) / 20000).toBeLessThan(0.03);
  });

  it('a praia lota com sol, calor e fim de semana, e esvazia na chuva e à noite', () => {
    const sabado = lotacaoPraia(12, 0, 32, 6);
    expect(sabado).toBeGreaterThan(0.9);
    expect(lotacaoPraia(12, 0, 32, 3)).toBeLessThan(sabado * 0.5); // dia útil
    expect(lotacaoPraia(12, 0.8, 32, 6)).toBe(0); // chuva forte
    expect(lotacaoPraia(21, 0, 32, 6)).toBe(0); // noite
    expect(lotacaoPraia(6, 0, 32, 6)).toBe(0); // madrugada
    expect(lotacaoPraia(12, 0, 17, 6)).toBe(0); // frio
    expect(lotacaoPraia(12, 0, 26, 6)).toBeLessThan(sabado);
  });

  it('o Rio traz os nomes de bairro e a ficha acha o bairro mais perto', () => {
    if (!rio) return;
    expect(rio.nomesBairros!.length).toBeGreaterThan(80);
    expect(rio.bairros!.length / 4).toBe(rio.nomesBairros!.length);
    const nomes = new Set(rio.nomesBairros);
    for (const n of ['Copacabana', 'Ipanema', 'Botafogo', 'Tijuca']) expect(nomes.has(n), n).toBe(true);
    // em cima do ponto de Copacabana o bairro é Copacabana
    const k = rio.nomesBairros!.indexOf('Copacabana');
    let x = 0, z = 0;
    for (let i = 0; i < rio.bairros!.length; i += 4) if (rio.bairros![i + 3] === k) { x = rio.bairros![i]; z = rio.bairros![i + 1]; }
    expect(bairroMaisPerto(rio, x, z)).toBe('Copacabana');
    // no meio do mar não há bairro por perto
    expect(bairroMaisPerto(rio, 0, 8000)).toBeNull();
  });
});
