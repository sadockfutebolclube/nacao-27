import { useEffect, useState } from 'react';
import { useApp } from '../store';

const DICAS = [
  'Sem água e luz, bairro nenhum passa do primeiro nível.',
  'Esgoto sem tratamento vai direto para a praia — e o valor dos imóveis da orla despenca.',
  'Indústria gera empregos e ICMS, mas a fumaça derruba o valor do solo dos vizinhos.',
  'Cada malha viária conectada é uma rede: um reservatório isolado não abastece o outro lado do rio.',
  'Praças e parques valorizam o entorno. Pipoqueiro incluso.',
  'Shift trava a via em ângulos de 15°. Clique com o botão direito para cancelar.',
  'Ipês florescem entre julho e setembro. Repare.',
  'Troque a luz de vapor de sódio por LED no painel Visual e veja a cidade mudar à noite.',
];

export function LoadingScreen({ etapa }: { etapa: string }) {
  const dados = useApp((s) => s.dadosUF);
  const mun = useApp((s) => s.municipio);
  const [i, setI] = useState(() => Math.floor(Math.random() * DICAS.length));
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % DICAS.length), 3500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 bg-[#060c0b] flex flex-col items-center justify-center text-center px-6 z-50">
      <div className="text-acento/80 text-xs tracking-[0.35em] uppercase">Cerimônia de posse</div>
      <h1 className="titulo text-5xl sm:text-6xl font-bold mt-3">{mun && dados && mun.ibge.startsWith(String(dados.id)) ? mun.nome : dados?.tracos.capital.nome ?? '…'}</h1>
      <div className="text-suave mt-1">{dados?.nome}</div>
      {dados && <p className="italic text-acento mt-6 max-w-lg">“{dados.tracos.saudacao}”</p>}
      <div className="w-64 h-1 bg-white/10 rounded mt-10 overflow-hidden">
        <div className="h-full w-1/3 bg-acento rounded carregando" />
      </div>
      <div className="text-xs text-suave mt-3">{etapa}</div>
      <div className="text-sm text-texto/80 mt-10 max-w-md h-12 surgir" key={i}>💡 {DICAS[i]}</div>
    </div>
  );
}
