import { create } from 'zustand';

/** Pronto = PrediosReais carregou as texturas e desenha os prédios reais (Edificios pula o corpo deles). */
export const usePrediosReais = create<{ pronto: boolean }>(() => ({ pronto: false }));
