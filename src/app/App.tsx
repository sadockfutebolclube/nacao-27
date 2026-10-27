import { lazy, Suspense, useEffect } from 'react';
import { carregarIndice, carregarMalhaBrasil, carregarMunicipios, carregarUF } from '../data/loader';
import { SiglaUF } from '../data/schemas';
import { BrasilScene } from '../render/brasil/BrasilScene';
import { AvisoConquista } from '../ui/conquistas/Conquistas';
import { AplicarAcessibilidade } from '../ui/Opcoes';
// Fase 10: a cidade e a Presidência carregam sob demanda (o menu abre bem mais rápido)
const GameScreen = lazy(() => import('./screens/GameScreen').then((m) => ({ default: m.GameScreen })));
const TelaPresidente = lazy(() => import('../ui/presidente/Planalto').then((m) => ({ default: m.TelaPresidente })));
const SetupPresidente = lazy(() => import('../ui/presidente/Setup').then((m) => ({ default: m.SetupPresidente })));
import { MenuScreen } from './screens/MenuScreen';
import { SelecaoScreen } from './screens/SelecaoScreen';
import { useApp } from './store';

export function App() {
  const tela = useApp((s) => s.tela);
  const setDados = useApp((s) => s.setDados);
  const setErro = useApp((s) => s.setErro);

  useEffect(() => {
    Promise.all([carregarIndice(), carregarMalhaBrasil()])
      .then(([i, m]) => setDados(i, m))
      .catch((e) => setErro(String(e instanceof Error ? e.message : e)));
    // atalho/deep link: ?uf=RJ&modo=sandbox entra direto no jogo
    const q = new URLSearchParams(location.search);
    const uf = SiglaUF.safeParse(q.get('uf')?.toUpperCase());
    if (uf.success) {
      useApp.getState().setModo(q.get('modo') === 'sandbox' ? 'sandbox' : 'mandato');
      const nomeMun = q.get('mun');
      const chave = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      Promise.all([carregarUF(uf.data), nomeMun ? carregarMunicipios(uf.data) : null]).then(([d, ms]) => {
        useApp.getState().setMunicipio(ms?.municipios.find((x) => chave(x.nome) === chave(nomeMun!)) ?? null);
        useApp.getState().iniciar(d);
      }).catch((e) => setErro(String(e)));
    }
  }, [setDados, setErro]);

  const brasil = tela === 'menu' || tela === 'selecao' || tela === 'presidente' || tela === 'presidente-setup';
  return (
    <div className="relative w-full h-full">
      {brasil && (
        <div className="absolute inset-0">
          <BrasilScene tela={tela} />
        </div>
      )}
      {tela === 'menu' && <MenuScreen />}
      {tela === 'selecao' && <SelecaoScreen />}
      <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center text-suave text-sm pointer-events-none">Carregando…</div>}>
        {tela === 'presidente-setup' && <SetupPresidente />}
        {tela === 'presidente' && <TelaPresidente />}
        {(tela === 'carregando' || tela === 'jogo') && <GameScreen />}
      </Suspense>
      <AvisoConquista />
      <AplicarAcessibilidade />
    </div>
  );
}
