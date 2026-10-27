/** Liga a trilha procedural (src/audio) ao jogo: repertório da UF, hora do dia, festas, chuva e volumes. */
import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { musica } from '../../audio/musica';
import { clima } from '../../render/city/climaVisual';
import { useGame } from '../../sim/bridge';

/** Sem props: repertório da UF em jogo. Com sigla/trilha: repertório fixo (Modo Presidente, a trilha nacional). */
export function TrilhaSonora({ sigla, trilha }: { sigla?: string; trilha?: string[] }) {
  const dadosUF = useApp((s) => s.dadosUF);
  const dados = sigla && trilha ? { sigla, tracos: { trilha } } : dadosUF;
  const volMusica = useApp((s) => s.volumeMusica);
  const volAmb = useApp((s) => s.volumeAmbiente);

  useEffect(() => {
    if (!dados) return;
    musica.setUF(dados.sigla, dados.tracos.trilha);
    // política de autoplay: o áudio nasce no primeiro gesto do jogador
    const gesto = () => musica.iniciar();
    window.addEventListener('pointerdown', gesto);
    window.addEventListener('keydown', gesto);
    const t = setInterval(() => {
      const h = sigla ? 12 : useGame.getState().hora;
      musica.setContexto({ noite: h < 5.5 || h >= 19.5, festa: clima.festa, chuva: clima.chuva });
    }, 1000);
    if (import.meta.env.DEV) (window as unknown as { __n27musica: typeof musica }).__n27musica = musica;
    return () => {
      window.removeEventListener('pointerdown', gesto);
      window.removeEventListener('keydown', gesto);
      clearInterval(t);
      musica.parar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados?.sigla]);

  useEffect(() => { musica.setVolumes(volMusica, volAmb); }, [volMusica, volAmb]);
  return null;
}

function useTocando() {
  const [nome, setNome] = useState(musica.tocandoAgora);
  useEffect(() => musica.ouvir(setNome), []);
  return nome;
}

/** Controles de som do menu de pausa. */
export function ControlesSom() {
  const volMusica = useApp((s) => s.volumeMusica);
  const volAmb = useApp((s) => s.volumeAmbiente);
  const setVolumes = useApp((s) => s.setVolumes);
  const tocando = useTocando();
  return (
    <div className="mt-3 text-xs">
      <div className="flex items-center justify-between text-suave mb-1">
        <span>Música: {Math.round(volMusica * 100)}%</span>
        {tocando && <button onClick={() => musica.pular()} className="text-acento hover:underline" title="Próximo ritmo da trilha">♪ {tocando} ⏭</button>}
      </div>
      <input type="range" min={0} max={1} step={0.05} value={volMusica} onChange={(e) => setVolumes(Number(e.target.value), volAmb)} className="w-full" aria-label="Volume da música" />
      <div className="text-suave mt-2 mb-1">Som ambiente (chuva): {Math.round(volAmb * 100)}%</div>
      <input type="range" min={0} max={1} step={0.05} value={volAmb} onChange={(e) => setVolumes(volMusica, Number(e.target.value))} className="w-full" aria-label="Volume do som ambiente" />
    </div>
  );
}
