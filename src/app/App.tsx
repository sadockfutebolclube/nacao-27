import { lazy, Suspense, useEffect } from 'react';
import { carregarUF } from '../data/loader';
import { AvisoConquista } from '../ui/conquistas/Conquistas';
import { AplicarAcessibilidade } from '../ui/Opcoes';
// Fase 10: a cidade carrega sob demanda (o menu abre bem mais rápido)
const GameScreen = lazy(() => import('./screens/GameScreen').then((m) => ({ default: m.GameScreen })));
import { MenuScreen } from './screens/MenuScreen';
import { useApp } from './store';

/** Fase 13: o jogo é só o Rio de Janeiro — governo do estado do RJ com a capital real. */
export const UF_JOGO = 'RJ' as const;

/** Começa um mandato (ou sandbox) no Rio: capital real, sem escolha de estado ou município. */
export async function novoJogoRio(modo: 'mandato' | 'sandbox') {
  const app = useApp.getState();
  app.setModo(modo);
  app.setMunicipio(null);
  useApp.setState({ cidadeReal: true });
  app.iniciar(await carregarUF(UF_JOGO));
}

export function App() {
  const tela = useApp((s) => s.tela);
  const setErro = useApp((s) => s.setErro);

  useEffect(() => {
    // atalho/deep link: ?jogar (ou o antigo ?uf=RJ) entra direto; &modo=sandbox para o sandbox
    const q = new URLSearchParams(location.search);
    if (q.has('jogar') || q.get('uf')?.toUpperCase() === UF_JOGO) novoJogoRio(q.get('modo') === 'sandbox' ? 'sandbox' : 'mandato').catch((e) => setErro(String(e)));
  }, [setErro]);

  return (
    <div className="relative w-full h-full">
      {tela === 'menu' && <MenuScreen />}
      <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-suave text-sm pointer-events-none">Carregando…</div>}>
        {(tela === 'carregando' || tela === 'jogo') && <GameScreen />}
      </Suspense>
      <AvisoConquista />
      <AplicarAcessibilidade />
    </div>
  );
}
