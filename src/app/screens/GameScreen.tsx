import { useEffect, useState } from 'react';
import type { NormaisUF } from '../../data/clima';
import { carregarCidadeReal, carregarClima, carregarEleitorado, carregarFiscal, carregarSocial } from '../../data/loader';
import type { CidadeReal } from '../../data/cidadeReal';
import { centroReal, terrenoReal } from '../../world/cidadeReal';
import { ajustarClima } from '../../data/municipios';
import { registrarPartida } from '../../conquistas/conquistas';
import { seedFromString } from '../../sim/core/rng';
import { iniciarSimulacao, mundo, pararSimulacao, useGame } from '../../sim/bridge';
import type { EstadoInit } from '../../sim/estado/calibracao';
import type { SimInit } from '../../sim/protocol';
import { CityCanvas } from '../../render/city/CityCanvas';
import { Hud } from '../../ui/hud/Hud';
import { pontoInicial } from '../../world/inicio';
import { generateTerrain, type Heightmap } from '../../world/terrain';
import { useApp } from '../store';
import { LoadingScreen } from './LoadingScreen';

export function GameScreen() {
  const dados = useApp((s) => s.dadosUF)!;
  const modo = useApp((s) => s.modo);
  const save = useApp((s) => s.saveParaCarregar);
  const municipio = useApp((s) => s.municipio);
  const querReal = useApp((s) => s.cidadeReal);
  const irPara = useApp((s) => s.irPara);
  const pronto = useGame((s) => s.pronto);
  const erroFatal = useGame((s) => s.erroFatal);
  const [hm, setHm] = useState<Heightmap | null>(null);
  const [inicio, setInicio] = useState<[number, number]>([0, 0]);
  const [init, setInit] = useState<SimInit | null>(null);

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const efeitos = Object.assign({}, ...dados.tracos.tracos.map((t) => t.efeitos)) as SimInit['efeitos'];

    // Fase 8: a cidade pode ser qualquer um dos municípios jogáveis da UF (padrão: a capital)
    const mun = municipio && municipio.ibge.startsWith(String(dados.id)) && !municipio.capital ? municipio : null;
    const comecar = (estado: EstadoInit | undefined, clima?: NormaisUF | null, real: CidadeReal | null = null) => {
      const i: SimInit = save?.init ?? {
        cidadeReal: real?.ibge,
        sigla: dados.sigla,
        nomeEstado: dados.nome,
        cidade: mun?.nome ?? dados.tracos.capital.nome,
        capital: !mun,
        terreno: mun?.terreno ?? dados.tracos.terreno,
        bioma: mun?.bioma ?? dados.tracos.biomas[0],
        latitude: mun?.lat ?? dados.tracos.capital.lat,
        efeitos,
        esgotoUF: dados.indicadores.esgoto,
        festas: dados.tracos.festas,
        regiao: dados.regiao.nome,
        seed: seedFromString(`${dados.sigla}:${mun?.nome ?? dados.tracos.capital.nome}`),
        modo,
        estado,
        clima: clima ? (mun ? ajustarClima(clima, mun) : clima) : undefined,
      };
      setInit(i);
      mundo.init = i;
      registrarPartida({ uf: i.sigla, regiao: i.regiao, bioma: i.bioma, interior: i.capital === false });
      iniciarSimulacao(save ? null : i, save, real);
      // o relevo é gerado na thread principal depois do primeiro paint da tela de carregamento
      timer = setTimeout(() => {
        const h = real ? terrenoReal(real, i.terreno, i.bioma, i.seed) : generateTerrain(i.seed, i.terreno, i.bioma);
        mundo.hm = h;
        setInicio(real ? centroReal(real) : pontoInicial(h));
        setHm(h);
      }, 60);
      useApp.setState({ tela: 'jogo' });
    };

    const ibgeSede = mun?.ibge ?? String(dados.tracos.capital.ibge);
    if (save) {
      // save de cidade real: recarrega ruas, prédios e relevo pelo código IBGE
      if (save.init.cidadeReal) carregarCidadeReal(save.init.cidadeReal).then((r) => { if (!cancelado) comecar(save.init.estado, null, r); });
      else comecar(save.init.estado);
    } else {
      // dados fiscais reais (SICONFI) alimentam o Tesouro estadual
      Promise.all([carregarFiscal(dados.sigla), carregarSocial(dados.sigla), carregarClima(dados.sigla), carregarEleitorado(dados.sigla), querReal ? carregarCidadeReal(ibgeSede) : null]).then(([fiscal, social, clima, eleitorado, real]) => {
        if (cancelado) return;
        comecar(fiscal ? {
          sigla: dados.sigla, fiscal, populacao: dados.populacao.valor, pibNominal: dados.pib.total, idh: dados.indicadores.idh,
          homicidios: dados.indicadores.homicidios, idebEM: dados.indicadores.idebEM, esgoto: dados.indicadores.esgoto,
          dificuldade: dados.tracos.dificuldade, efeitos, social: social ?? undefined,
          regiao: dados.regiao.nome, cidades: dados.maioresMunicipios.map((m) => m.nome), sede: mun?.nome, populacoes: dados.maioresMunicipios.map((m) => m.populacao), eleitorado: eleitorado ?? undefined,
        } : undefined, clima, real);
      });
    }
    return () => {
      cancelado = true;
      clearTimeout(timer);
      pararSimulacao();
    };
  }, [dados, modo, save, municipio, querReal]);

  if (erroFatal) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#060c0b]">
        <h2 className="titulo text-3xl text-perigo">A simulação travou</h2>
        <pre className="text-xs text-suave mt-4 max-w-2xl whitespace-pre-wrap">{erroFatal}</pre>
        <button onClick={() => irPara('menu')} className="mt-6 px-5 py-2 rounded-lg bg-white/10">Voltar ao menu</button>
      </div>
    );
  }

  return (
    <>
      {hm && init && <CityCanvas hm={hm} latitude={init.latitude} inicio={inicio} />}
      {hm && pronto && <Hud />}
      {(!hm || !pronto) && <LoadingScreen etapa={!hm ? 'Levantando o relevo e a mata nativa…' : 'Abrindo o Diário Oficial…'} />}
    </>
  );
}
