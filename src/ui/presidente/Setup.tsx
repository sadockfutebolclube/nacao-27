/** Montagem do Modo Presidente (Fase 9): nome, partido e estado de origem, sobre o mapa do Brasil. */
import { useState } from 'react';
import { useApp } from '../../app/store';
import { carregarMacro } from '../../data/loader';
import { PARTIDOS, type IdPartido } from '../../sim/politica/dados';
import { usePres } from '../../sim/presidente/store';
import { Icone } from '../Icone';
import { registrarPartida } from '../../conquistas/conquistas';

const NOMES: Record<'f' | 'm', string[]> = {
  f: ['Helena Duarte', 'Marta Siqueira', 'Lúcia Bezerra', 'Renata Albuquerque', 'Teresa Monteiro'],
  m: ['Paulo Nogueira', 'Ricardo Bastos', 'Antônio Falcão', 'Severino Lacerda', 'Eduardo Prates'],
};
export const rotuloIdeologia = (x: number) => (x < -0.6 ? 'esquerda' : x < -0.15 ? 'centro-esquerda' : x <= 0.2 ? 'centro' : x < 0.55 ? 'centro-direita' : 'direita');

export function SetupPresidente() {
  const indice = useApp((s) => s.indice);
  const sel = useApp((s) => s.selecionada);
  const irPara = useApp((s) => s.irPara);
  const carreira = useApp((s) => s.carreira);
  const iniciar = usePres((s) => s.iniciar);
  const [genero, setGenero] = useState<'f' | 'm'>('f');
  const [nome, setNome] = useState(NOMES.f[Math.floor(Math.random() * 5)]);
  const [partido, setPartido] = useState<IdPartido>(carreira?.partido ?? 'UPB');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const origem = carreira?.uf ?? sel;
  const ufOrigem = indice?.ufs.find((u) => u.sigla === origem);

  const posse = async () => {
    if (!indice || !origem) return;
    setCarregando(true);
    try {
      const macro = await carregarMacro();
      await iniciar({
        partido, origem, nome: nome.trim() || NOMES[genero][0], genero, anoInicio: carreira ? carreira.ano : 2027, semente: `${nome}:${partido}:${origem}:${Date.now() % 100000}`, macro,
        ufs: indice.ufs.map((u) => ({ sigla: u.sigla, nome: u.nome, regiao: u.regiao.nome, populacao: u.populacao.valor, cidades: [u.tracos.capital.nome] })),
        carreira: carreira ? { uf: carreira.uf, aprovacao: carreira.aprovacao } : undefined,
      });
      if (carreira) registrarPartida({ carreira: true });
      useApp.setState({ carreira: null, selecionada: null });
      irPara('presidente');
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e));
      setCarregando(false);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      <div className="absolute top-4 left-4 pointer-events-auto">
        <button onClick={() => irPara('menu')} className="painel rounded-lg px-3 py-2 flex items-center gap-1 text-sm hover:bg-white/10"><Icone nome="voltar" tamanho={16} /> Menu</button>
      </div>
      <div className="absolute left-4 top-16 bottom-4 w-[min(440px,calc(100%-2rem))] painel rounded-2xl p-5 pointer-events-auto overflow-auto surgir">
        <div className="text-acento/80 text-[11px] tracking-[0.3em] uppercase">Modo Presidente</div>
        <h1 className="titulo text-4xl font-bold leading-none mt-1">Palácio do Planalto</h1>
        <p className="text-xs text-suave mt-2 leading-relaxed">
          Economia real de hoje (Selic, IPCA, câmbio e dívida do Banco Central), um Congresso de 594 parlamentares fictícios,
          um STF com 11 ministros, um Banco Central autônomo e 27 governadores. Quatro anos — talvez oito.
        </p>
        {carreira && <div className="mt-3 text-xs rounded-lg bg-acento/10 border border-acento/30 px-3 py-2">Carreira: você chega ao Planalto depois de governar {carreira.uf} com {Math.round(carreira.aprovacao)}% de aprovação — o estado é seu reduto.</div>}

        <div className="mt-5 text-[11px] text-suave uppercase tracking-wider">Nome</div>
        <div className="flex gap-2 mt-1">
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} className="flex-1 min-w-0 bg-white/5 border border-borda rounded-lg px-3 py-2 text-sm" aria-label="Nome do(a) presidente" />
          <div className="flex rounded-lg overflow-hidden border border-borda text-sm">
            {(['f', 'm'] as const).map((g) => (
              <button key={g} onClick={() => { setGenero(g); setNome(NOMES[g][Math.floor(Math.random() * 5)]); }} className={`px-2.5 text-xs ${genero === g ? 'bg-acento text-tinta font-semibold' : 'text-suave hover:text-white'}`}>{g === 'f' ? 'Presidenta' : 'Presidente'}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 text-[11px] text-suave uppercase tracking-wider">Partido (fictício)</div>
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          {(Object.keys(PARTIDOS) as IdPartido[]).sort((a, b) => PARTIDOS[a].ideologia - PARTIDOS[b].ideologia).map((p) => (
            <button key={p} onClick={() => setPartido(p)} className={`text-left rounded-lg px-2.5 py-1.5 border text-xs ${partido === p ? 'border-acento bg-acento/10' : 'border-white/10 hover:bg-white/5'}`}>
              <div className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PARTIDOS[p].cor }} /><b>{PARTIDOS[p].sigla}</b></div>
              <div className="text-[10px] text-suave truncate">{PARTIDOS[p].nome} · {rotuloIdeologia(PARTIDOS[p].ideologia)}</div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-suave mt-1">A ideologia define quem é base e quem é oposição no Congresso e como cada região do país reage ao governo.</p>

        <div className="mt-4 text-[11px] text-suave uppercase tracking-wider">Estado de origem</div>
        <div className="text-sm mt-1">{ufOrigem ? <b>{ufOrigem.nome}</b> : <span className="text-suave pulsar">Clique num estado no mapa.</span>}{ufOrigem && <span className="text-suave text-xs"> · seu reduto eleitoral</span>}</div>

        {erro && <div className="text-perigo text-xs mt-3">{erro}</div>}
        <button disabled={!origem || carregando} onClick={posse} className={`mt-5 w-full rounded-xl px-5 py-3 titulo text-lg font-semibold ${origem ? 'bg-acento text-tinta hover:brightness-110' : 'bg-white/5 text-suave'}`}>
          {carregando ? 'Subindo a rampa…' : `Tomar posse em 5 de janeiro de ${carreira ? carreira.ano : 2027} →`}
        </button>
      </div>
    </div>
  );
}
