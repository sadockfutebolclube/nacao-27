/**
 * Som espacial dos veículos especiais (Fase 27): sirene, helicóptero, jato, avião de hélice, navio e lancha, sintetizados em Web Audio
 * (nenhum arquivo de áudio) e posicionados no mundo por `PannerNode` — o volume cai com a distância e o som vem da direção certa.
 * Só as `MAX_VOZES` fontes mais perto da câmera soam; as outras ficam em silêncio. Usa o AudioContext da música (criado no primeiro
 * clique do jogador); sem ele, não faz nada.
 */
import { musica } from './musica';

export type TipoSom = 'sirene' | 'helicoptero' | 'jato' | 'helice' | 'navio' | 'lancha';
export interface Emissor { id: number; x: number; y: number; z: number; tipo: TipoSom }

/** alcance (m) e distância de referência de cada som */
export const ALCANCE: Record<TipoSom, { max: number; ref: number; ganho: number }> = {
  sirene: { max: 700, ref: 25, ganho: 0.16 },
  helicoptero: { max: 1600, ref: 60, ganho: 0.5 },
  jato: { max: 4000, ref: 250, ganho: 0.5 },
  helice: { max: 1200, ref: 60, ganho: 0.3 },
  navio: { max: 3500, ref: 200, ganho: 0.35 },
  lancha: { max: 700, ref: 20, ganho: 0.2 },
};
const MAX_VOZES = 8;

interface Voz { id: number; tipo: TipoSom; painel: PannerNode; saida: GainNode; parar: () => void; extra?: { buzina: () => void } }

class Espacial {
  private vozes = new Map<number, Voz>();
  private ruido: AudioBuffer | null = null;
  private ctx: AudioContext | null = null;
  /** diagnóstico: quantas vozes estão tocando e a distância da mais longe */
  vozesAtivas = 0;

  private buffer(ctx: AudioContext) {
    if (this.ruido && this.ctx === ctx) return this.ruido;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.ruido = b; this.ctx = ctx;
    return b;
  }

  private criar(ctx: AudioContext, e: Emissor): Voz {
    const a = ALCANCE[e.tipo];
    const painel = ctx.createPanner();
    painel.panningModel = 'HRTF'; painel.distanceModel = 'inverse';
    painel.refDistance = a.ref; painel.maxDistance = a.max; painel.rolloffFactor = 1.3;
    const saida = ctx.createGain();
    saida.gain.value = 0;
    saida.connect(painel).connect(ctx.destination);
    const nos: AudioScheduledSourceNode[] = [];
    const ruidoLoop = () => { const s = ctx.createBufferSource(); s.buffer = this.buffer(ctx); s.loop = true; s.start(); nos.push(s); return s; };
    const osc = (tipo: OscillatorType, f: number) => { const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = f; o.start(); nos.push(o); return o; };
    let extra: Voz['extra'];

    switch (e.tipo) {
      case 'sirene': { // gemido: dente-de-serra varrendo 650–1250 Hz
        const o = osc('sawtooth', 900), lfo = osc('triangle', 0.55), prof = ctx.createGain();
        prof.gain.value = 300; lfo.connect(prof).connect(o.frequency);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.7;
        o.connect(bp).connect(saida);
        break;
      }
      case 'helicoptero': { // pás: ruído de banda larga modulado a ~14 Hz + zumbido grave do motor
        const r = ruidoLoop(), bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 480;
        const am = ctx.createGain(); am.gain.value = 0.55;
        const lfo = osc('sine', 14), prof = ctx.createGain(); prof.gain.value = 0.45; lfo.connect(prof).connect(am.gain);
        r.connect(bp).connect(am).connect(saida);
        const m = osc('sawtooth', 62), g = ctx.createGain(); g.gain.value = 0.12; m.connect(g).connect(saida);
        break;
      }
      case 'jato': { // turbina: ruído filtrado com um sopro lento
        const r = ruidoLoop(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
        const g = ctx.createGain(); g.gain.value = 0.7;
        const lfo = osc('sine', 0.17), prof = ctx.createGain(); prof.gain.value = 250; lfo.connect(prof).connect(lp.frequency);
        r.connect(lp).connect(g).connect(saida);
        break;
      }
      case 'helice': {
        const o = osc('sawtooth', 96), o2 = osc('sawtooth', 99.5), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
        const g = ctx.createGain(); g.gain.value = 0.35; o.connect(lp); o2.connect(lp); lp.connect(g).connect(saida);
        break;
      }
      case 'navio': { // motor grave e, de vez em quando, a buzina
        const o = osc('sawtooth', 46), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
        const g = ctx.createGain(); g.gain.value = 0.8; o.connect(lp).connect(g).connect(saida);
        extra = { buzina: () => {
          const t = ctx.currentTime, b = ctx.createGain(); b.gain.setValueAtTime(0, t); b.gain.linearRampToValueAtTime(0.9, t + 0.08); b.gain.setValueAtTime(0.9, t + 1.6); b.gain.linearRampToValueAtTime(0, t + 2);
          b.connect(saida);
          for (const f of [117, 175]) { const h = ctx.createOscillator(); h.type = 'square'; h.frequency.value = f; const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 700; h.connect(lp2).connect(b); h.start(t); h.stop(t + 2.1); }
        } };
        break;
      }
      case 'lancha': {
        const o = osc('sawtooth', 105), r = ruidoLoop(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
        const g = ctx.createGain(); g.gain.value = 0.4; o.connect(g).connect(saida); const g2 = ctx.createGain(); g2.gain.value = 0.3; r.connect(bp).connect(g2).connect(saida);
        break;
      }
    }
    const parar = () => {
      const t = ctx.currentTime;
      saida.gain.cancelScheduledValues(t); saida.gain.setTargetAtTime(0, t, 0.08);
      setTimeout(() => { for (const n of nos) { try { n.stop(); } catch { /* já parou */ } } saida.disconnect(); painel.disconnect(); }, 400);
    };
    return { id: e.id, tipo: e.tipo, painel, saida, parar, extra };
  }

  /** Chamar uma vez por quadro: câmera (posição e direção para onde olha) e as fontes de som do quadro. */
  atualizar(cam: { x: number; y: number; z: number; fx: number; fy: number; fz: number }, emissores: Emissor[]) {
    const ctx = musica.ctx;
    if (!ctx || ctx.state !== 'running') { this.vozesAtivas = 0; return; }
    const L = ctx.listener;
    if (L.positionX) { L.positionX.value = cam.x; L.positionY.value = cam.y; L.positionZ.value = cam.z; L.forwardX.value = cam.fx; L.forwardY.value = cam.fy; L.forwardZ.value = cam.fz; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
    // as mais próximas (dentro do alcance de cada tipo)
    const cand = emissores
      .map((e) => ({ e, d: Math.hypot(e.x - cam.x, e.y - cam.y, e.z - cam.z) }))
      .filter((c) => c.d < ALCANCE[c.e.tipo].max)
      .sort((a, b) => a.d / ALCANCE[a.e.tipo].ref - b.d / ALCANCE[b.e.tipo].ref)
      .slice(0, MAX_VOZES);
    const vivos = new Set(cand.map((c) => c.e.id));
    for (const [id, v] of this.vozes) if (!vivos.has(id)) { v.parar(); this.vozes.delete(id); }
    const vol = Math.max(0, Math.min(1, musica.volumeAmbiente));
    for (const { e, d } of cand) {
      let v = this.vozes.get(e.id);
      if (!v) { v = this.criar(ctx, e); this.vozes.set(e.id, v); }
      v.painel.positionX.value = e.x; v.painel.positionY.value = e.y; v.painel.positionZ.value = e.z;
      const a = ALCANCE[e.tipo];
      // corte suave no limite do alcance
      const borda = Math.min(1, Math.max(0, (a.max - d) / (a.max * 0.25)));
      v.saida.gain.setTargetAtTime(a.ganho * vol * borda, ctx.currentTime, 0.1);
      if (v.extra && Math.random() < 0.0006) v.extra.buzina();
    }
    this.vozesAtivas = this.vozes.size;
  }

  /** Para tudo (ao sair do jogo). */
  silenciar() { for (const v of this.vozes.values()) v.parar(); this.vozes.clear(); this.vozesAtivas = 0; }
}

export const audioEspacial = new Espacial();
