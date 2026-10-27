import { readFileSync } from 'node:fs';
import { DadosFiscais } from '../src/data/fiscal';
import { DadosUF } from '../src/data/schemas';
import { DadosSociais } from '../src/data/social';
import { EleitoradoUF } from '../src/data/eleitorado';
import type { EstadoInit } from '../src/sim/estado/calibracao';

/** Monta o EstadoInit de uma UF a partir dos dados empacotados (IBGE + SICONFI). */
export function initDe(sigla: string): EstadoInit {
  const uf = DadosUF.parse(JSON.parse(readFileSync(`public/data/ufs/${sigla}.json`, 'utf8')));
  const fiscal = DadosFiscais.parse(JSON.parse(readFileSync(`public/data/fiscal/${sigla}.json`, 'utf8')));
  return {
    sigla, fiscal, populacao: uf.populacao.valor, pibNominal: uf.pib.total, idh: uf.indicadores.idh, homicidios: uf.indicadores.homicidios,
    idebEM: uf.indicadores.idebEM, esgoto: uf.indicadores.esgoto, dificuldade: uf.tracos.dificuldade,
    efeitos: Object.assign({}, ...uf.tracos.tracos.map((t) => t.efeitos)),
    social: DadosSociais.parse(JSON.parse(readFileSync('public/data/social/indicadores.json', 'utf8'))).valores[sigla],
    regiao: uf.regiao.nome, cidades: uf.maioresMunicipios.map((m) => m.nome), populacoes: uf.maioresMunicipios.map((m) => m.populacao),
    eleitorado: EleitoradoUF.parse(JSON.parse(readFileSync(`public/data/eleitorado/${sigla}.json`, 'utf8'))),
  };
}
