/**
 * Trilha sonora regional procedural (Fase 8) — tudo sintetizado na Web Audio API, sem arquivos:
 * cada UF toca os gêneros da sua trilha (data/ufs/traits.json → generos.ts). A cada faixa o motor sorteia
 * tom, progressões e motivos melódicos (frase A A' B A com pausas para respirar), toca 40-50 compassos
 * e troca de gênero. À noite fica mais lenta e grave; festas trocam o repertório (frevo no Carnaval do
 * Recife, forró no São João); a chuva ganha um ambiente de ruído filtrado.
 * O áudio só começa depois de um gesto do jogador (política de autoplay dos navegadores).
 */
import { GENEROS, generoDe, generoDeFesta, type Genero, type Timbre, type VozBateria } from './generos';

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** PRNG pequeno e determinístico por faixa (mulberry32). */
function rng(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Nota { passo: number; dur: number; grau: number }
interface Faixa {
  g: Genero;
  tom: number;
  /** progressões por seção: A, B */
  progA: number[];
  progB: number[];
  motA: Nota[];
  motB: Nota[];
  compassos: number;
  bpm: number;
}

export interface ContextoMusica { noite: boolean; festa: null | 'carnaval' | 'junina' | 'fogos'; chuva: number }

class Musica {
  ctx: AudioContext | null = null;
  private mestre!: GainNode;
  private busMusica!: GainNode;
  private busAmb!: GainNode;
  private reverb!: ConvolverNode;
  private envioRev!: GainNode;
  private brilho!: BiquadFilterNode;
  private ruido!: AudioBuffer;
  private chuvaGain: GainNode | null = null;
  private timer: number | null = null;

  private sigla = '';
  private playlist: Genero[] = [];
  private iPlaylist = 0;
  private faixa: Faixa | null = null;
  private compasso = 0;
  private passo = 0;
  private proximo = 0;
  private pausaAte = 0;
  private contador = 1;
  private ctxJogo: ContextoMusica = { noite: false, festa: null, chuva: 0 };
  private festaAtual: ContextoMusica['festa'] = null;

  volumeMusica = 0.5;
  volumeAmbiente = 0.6;
  tocandoAgora = '';
  private ouvintes = new Set<(nome: string) => void>();

  /** Cria o AudioContext (chamar num gesto do usuário). */
  iniciar() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.mestre = ctx.createGain();
    this.mestre.gain.value = 0.9;
    this.mestre.connect(comp).connect(ctx.destination);
    this.brilho = ctx.createBiquadFilter();
    this.brilho.type = 'lowpass'; this.brilho.frequency.value = 12000;
    this.busMusica = ctx.createGain();
    this.busMusica.gain.value = this.volumeMusica * 0.5;
    this.busMusica.connect(this.brilho).connect(this.mestre);
    this.busAmb = ctx.createGain();
    this.busAmb.gain.value = this.volumeAmbiente;
    this.busAmb.connect(this.mestre);
    // reverb de sala: resposta ao impulso de ruído com decaimento exponencial
    const dur = 1.8, ir = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2.6;
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.envioRev = ctx.createGain();
    this.envioRev.gain.value = 0.22;
    this.envioRev.connect(this.reverb).connect(this.busMusica);
    this.ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const r = this.ruido.getChannelData(0);
    for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
    this.proximo = ctx.currentTime + 0.3;
    this.timer = window.setInterval(() => this.agendar(), 40);
  }

  parar() {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.chuvaGain = null;
    this.faixa = null;
  }

  /** Define o repertório da UF (palavras de traits.trilha). */
  setUF(sigla: string, trilha: string[]) {
    if (sigla === this.sigla) return;
    this.sigla = sigla;
    const vistos = new Set<string>();
    this.playlist = trilha.map(generoDe).filter((g) => (vistos.has(g.id) ? false : (vistos.add(g.id), true)));
    if (this.playlist.length === 0) this.playlist = [GENEROS.mpb];
    this.iPlaylist = 0;
    this.faixa = null;
  }

  setContexto(c: ContextoMusica) {
    this.ctxJogo = c;
    if (c.festa !== this.festaAtual) {
      this.festaAtual = c.festa;
      const g = c.festa ? generoDeFesta(c.festa, this.sigla) : null;
      if (g && this.faixa?.g.id !== g.id) this.faixa = null; // troca na próxima virada de compasso
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.brilho.frequency.setTargetAtTime(c.noite ? 3800 : 12000, t, 2);
    if (c.chuva > 0.02 && !this.chuvaGain) this.ligarChuva();
    this.chuvaGain?.gain.setTargetAtTime(Math.min(1, c.chuva) * 0.35, t, 1.5);
  }

  setVolumes(musica: number, ambiente: number) {
    this.volumeMusica = musica;
    this.volumeAmbiente = ambiente;
    if (!this.ctx) return;
    this.busMusica.gain.setTargetAtTime(musica * 0.5, this.ctx.currentTime, 0.1);
    this.busAmb.gain.setTargetAtTime(ambiente, this.ctx.currentTime, 0.1);
  }

  /** Pula para o próximo gênero da trilha. */
  pular() {
    this.faixa = null;
    if (this.ctx) this.pausaAte = this.ctx.currentTime + 0.4;
  }

  ouvir(f: (nome: string) => void) {
    this.ouvintes.add(f);
    return () => { this.ouvintes.delete(f); };
  }

  // ---------------------------------------------------------------- composição

  private novaFaixa(): Faixa {
    const festa = this.festaAtual ? generoDeFesta(this.festaAtual, this.sigla) : null;
    const g = festa ?? this.playlist[this.iPlaylist++ % this.playlist.length] ?? GENEROS.mpb;
    const r = rng((this.contador++ * 2654435761) ^ (this.sigla.charCodeAt(0) << 8) ^ Date.now());
    const tom = 50 + Math.floor(r() * 12) - 5; // centro em ré, de lá a mi
    const progA = g.progressoes[Math.floor(r() * g.progressoes.length)];
    const outras = g.progressoes.filter((p) => p !== progA);
    const progB = outras.length ? outras[Math.floor(r() * outras.length)] : progA;
    const bpm = g.bpm * (this.ctxJogo.noite ? 0.92 : 1) * (0.97 + r() * 0.06);
    const f: Faixa = { g, tom, progA, progB, motA: this.motivo(g, progA, r), motB: this.motivo(g, progB, r), compassos: 44 + Math.floor(r() * 3) * 4, bpm };
    this.tocandoAgora = `${g.nome}${festa ? ' (festa)' : ''}`;
    for (const o of this.ouvintes) o(this.tocandoAgora);
    return f;
  }

  /** Motivo de 2 compassos: ritmo com acentos nos tempos, alturas em passeio pela escala puxado para notas do acorde. */
  private motivo(g: Genero, prog: number[], r: () => number): Nota[] {
    const P = g.passos, notas: Nota[] = [];
    const esc = g.escalaMelodia ?? g.escala;
    let grau = Math.floor(r() * 3) * 2; // começa na tônica, terça ou quinta
    for (let s = 0; s < P * 2; s++) {
      const forte = s % 4 === 0 ? 1 : s % 2 === 0 ? 0.6 : 0.35;
      if (r() > g.lead.densidade * forte * 1.4) continue;
      const passos = [-2, -1, -1, 0, 1, 1, 2, 3, -3];
      grau += passos[Math.floor(r() * passos.length)];
      if (s % 4 === 0) {
        // notas do acorde no tempo forte (na escala de 7 notas: graus pares a partir da fundamental)
        const raiz = prog[Math.floor(s / P)] ?? 0;
        if (esc.length === 7) { const rel = ((grau - raiz) % 7 + 7) % 7; if (rel % 2 === 1) grau += r() < 0.5 ? -1 : 1; }
      }
      grau = Math.max(-4, Math.min(esc.length + 4, grau));
      notas.push({ passo: s, dur: 1, grau });
    }
    for (let i = 0; i < notas.length; i++) notas[i].dur = Math.min(6, (notas[i + 1]?.passo ?? P * 2) - notas[i].passo);
    if (notas.length) { const u = notas[notas.length - 1]; u.grau = Math.round(u.grau / esc.length) * esc.length; }
    return notas;
  }

  /** Nota MIDI do grau da escala (graus negativos/acima da oitava viram oitavas). */
  private nota(esc: number[], tom: number, grau: number, oitava = 0) {
    const n = esc.length, o = Math.floor(grau / n), i = ((grau % n) + n) % n;
    return tom + esc[i] + 12 * (o + oitava);
  }

  private acorde(g: Genero, tom: number, grau: number): number[] {
    const out = [0, 2, 4].map((k) => this.nota(g.escala, tom, grau + k));
    if (g.setimas) out.push(this.nota(g.escala, tom, grau + 6));
    return out;
  }

  // ---------------------------------------------------------------- agendamento

  private agendar() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.proximo < ctx.currentTime + 0.15) {
      if (this.proximo < this.pausaAte) { this.proximo = this.pausaAte; continue; }
      if (!this.faixa) { this.faixa = this.novaFaixa(); this.compasso = 0; this.passo = 0; }
      const f = this.faixa, g = f.g, dt = 60 / f.bpm / 4;
      const swing = this.passo % 2 === 1 ? g.swing * dt : 0;
      this.tocarPasso(f, this.proximo + swing, dt);
      this.proximo += dt;
      if (++this.passo >= g.passos) {
        this.passo = 0;
        if (++this.compasso >= f.compassos) {
          this.faixa = null;
          this.pausaAte = this.proximo + 3.5;
        }
      }
    }
  }

  private tocarPasso(f: Faixa, t: number, dt: number) {
    const g = f.g, c = this.compasso, s = this.passo, fim = f.compassos;
    // forma: intro 4 · A 8 · B 8 · A 8 · respiro 4 · B 8 · A 4+ · final
    const sec = c < 4 ? 'intro' : c < 12 ? 'A' : c < 20 ? 'B' : c < 28 ? 'A' : c < 32 ? 'respiro' : c < 40 ? 'B' : 'A';
    const ultimo = c === fim - 1;
    const prog = sec === 'B' ? f.progB : f.progA;
    const grauAc = prog[c % 4];
    const noite = this.ctxJogo.noite;

    // bateria
    if (!ultimo) {
      for (const tr of g.bateria) {
        if (!tr.padrao) continue;
        if (sec === 'respiro' && tr.voz !== 'ganza' && tr.voz !== 'maraca' && tr.voz !== 'chimbal' && tr.voz !== 'triangulo' && tr.voz !== 'agogo') continue;
        if (c < 2 && g.bateria.length > 2 && tr !== g.bateria[0] && tr !== g.bateria[1]) continue;
        const ch = tr.padrao[s % tr.padrao.length];
        if (ch === '.' || ch === undefined) continue;
        const vel = (ch === 'o' ? 0.45 : 1) * (tr.vol ?? 0.8) * (noite ? 0.7 : 1);
        this.bateria(tr.voz, t, vel, ch === 'b');
      }
    } else if (ultimo && s === 0) {
      for (const tr of g.bateria.slice(0, 1)) this.bateria(tr.voz, t, 0.9, false);
    }

    // baixo
    const b = g.baixo[s % g.baixo.length];
    if (b && b !== '.' && b !== '-' && (c >= 1 || s >= 8) && !(ultimo && s > 0)) {
      let dur = 1;
      while (dur < g.passos && (g.baixo[(s + dur) % g.baixo.length] === '.' || g.baixo[(s + dur) % g.baixo.length] === '-') && s + dur < g.passos) dur++;
      const k = b === '3' ? 2 : b === '5' ? 4 : b === '7' ? 6 : b === '8' ? 7 : 0;
      this.baixo(mtof(this.nota(g.escala, f.tom, grauAc + k, -2)), t, Math.min(dur, 4) * dt * 0.9 + (ultimo ? 2 : 0));
    }

    // acompanhamento
    if (g.acomp && (c >= 2 || g.bateria.length === 0)) {
      const ch = g.acomp.padrao[s % g.acomp.padrao.length];
      if (ultimo) { if (s === 0) this.acordeSom(g.acomp.timbre, this.acorde(g, f.tom, grauAc), t, 2.5, 0.8); }
      else if (ch === 'x' || ch === 'X') {
        const longo = ch === 'X' ? g.passos * dt : dt * 1.6;
        this.acordeSom(g.acomp.timbre, this.acorde(g, f.tom, grauAc), t, longo, ch === 'X' ? 0.55 : 0.7);
      } else if (ch === 'r') {
        const ac = this.acorde(g, f.tom, grauAc), n = ac[(s / 2) % ac.length | 0] + 12;
        this.voz(g.acomp.timbre, mtof(n), t, dt * 2, 0.45);
      }
    }

    // melodia
    if ((sec === 'A' || sec === 'B') && !ultimo) {
      const mot = sec === 'B' ? f.motB : f.motA;
      const inicio = c < 12 ? 4 : c < 20 ? 12 : c < 28 ? 20 : c < 40 ? 32 : 40;
      const rel = (c - inicio) % 8;
      // A A' : no segundo par, a última nota sobe uma terça (variação)
      const pos = (rel % 2) * g.passos + s;
      const nota = mot.find((n) => n.passo === pos);
      if (nota) {
        const variacao = rel >= 6 && nota === mot[mot.length - 1] ? 2 : 0;
        const esc = g.escalaMelodia ?? g.escala;
        const oit = g.lead.oitava - 4 - (noite ? 1 : 0);
        const m = this.nota(esc, f.tom, nota.grau + variacao, oit);
        const dur = nota.dur * dt * 0.95;
        this.voz(g.lead.timbre, mtof(m), t, dur, 0.55);
        if (g.lead.tercas && esc.length === 7) this.voz(g.lead.timbre, mtof(this.nota(esc, f.tom, nota.grau + variacao - 2, oit)), t, dur, 0.35);
      }
    }
  }

  // ---------------------------------------------------------------- síntese

  private env(g: GainNode, t: number, a: number, pico: number, dur: number, rel: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + a);
    g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur), rel);
  }

  private saida(rev: number) {
    const ctx = this.ctx!, g = ctx.createGain();
    g.connect(this.busMusica);
    if (rev > 0) { const e = ctx.createGain(); e.gain.value = rev; g.connect(e).connect(this.envioRev); }
    return g;
  }

  private osc(tipo: OscillatorType, freq: number, t: number, fim: number, destino: AudioNode, detune = 0) {
    const o = this.ctx!.createOscillator();
    o.type = tipo; o.frequency.value = freq; o.detune.value = detune;
    o.connect(destino); o.start(t); o.stop(fim);
    return o;
  }

  /** Uma nota de um instrumento melódico. */
  private voz(timbre: Timbre, f: number, t: number, dur: number, vel: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.connect(g);
    g.connect(this.saida(0.6));
    const fim = t + dur + 1.2;
    const vibrato = (prof: number, taxa: number, ...os: OscillatorNode[]) => {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = taxa; lg.gain.value = prof;
      l.connect(lg); for (const o of os) lg.connect(o.detune);
      l.start(t + 0.08); l.stop(fim);
    };
    switch (timbre) {
      case 'sanfona': {
        filtro.frequency.value = 2600; filtro.Q.value = 1.5;
        const a = this.osc('sawtooth', f, t, fim, filtro, -7), b = this.osc('sawtooth', f, t, fim, filtro, 7), c = this.osc('square', f / 2, t, fim, filtro);
        vibrato(9, 5.5, a, b, c);
        this.env(g, t, 0.02, vel * 0.16, dur, 0.06);
        break;
      }
      case 'flauta': case 'pifano': {
        filtro.frequency.value = timbre === 'pifano' ? 5000 : 3200;
        const a = this.osc(timbre === 'pifano' ? 'triangle' : 'sine', f, t, fim, filtro);
        this.osc('sine', f * 2, t, fim, filtro).detune.value = 3;
        vibrato(14, 5, a);
        const sopro = ctx.createBufferSource(), sf = ctx.createBiquadFilter(), sg = ctx.createGain();
        sopro.buffer = this.ruido; sf.type = 'bandpass'; sf.frequency.value = f * 2; sf.Q.value = 4; sg.gain.value = 0.05;
        sopro.connect(sf).connect(sg).connect(filtro); sopro.start(t); sopro.stop(fim);
        this.env(g, t, 0.04, vel * 0.3, dur, 0.08);
        break;
      }
      case 'metais': {
        filtro.Q.value = 2;
        filtro.frequency.setValueAtTime(600, t);
        filtro.frequency.exponentialRampToValueAtTime(3800, t + 0.06);
        filtro.frequency.setTargetAtTime(1800, t + 0.08, 0.2);
        const a = this.osc('sawtooth', f, t, fim, filtro, -5), b = this.osc('sawtooth', f, t, fim, filtro, 6);
        vibrato(6, 5.8, a, b);
        this.env(g, t, 0.03, vel * 0.17, dur, 0.05);
        break;
      }
      case 'guitarra': case 'melodica': case 'sintetizador': {
        filtro.frequency.value = timbre === 'sintetizador' ? 4200 : 2400;
        const a = this.osc(timbre === 'melodica' ? 'square' : timbre === 'sintetizador' ? 'sawtooth' : 'square', f, t, fim, filtro);
        if (timbre === 'guitarra') { a.frequency.setValueAtTime(f * 0.97, t); a.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
        vibrato(timbre === 'guitarra' ? 18 : 8, 6, a);
        this.env(g, t, 0.01, vel * 0.13, dur, timbre === 'guitarra' ? 0.18 : 0.06);
        break;
      }
      case 'guitarra-dist': {
        const ws = ctx.createWaveShaper(), curva = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curva[i] = Math.tanh(x * 4); }
        ws.curve = curva;
        filtro.frequency.value = 2800;
        ws.connect(filtro);
        const a = this.osc('sawtooth', f, t, fim, ws), b = this.osc('sawtooth', f * 1.5, t, fim, ws);
        b.detune.value = 4;
        vibrato(10, 5.5, a, b);
        this.env(g, t, 0.01, vel * 0.1, dur, 0.1);
        break;
      }
      case 'viola': case 'violao': case 'cavaco': case 'harpa': case 'piano': {
        // corda dedilhada: brilho que se fecha rápido
        const brilho = timbre === 'cavaco' ? 5200 : timbre === 'viola' ? 4200 : timbre === 'harpa' ? 3600 : timbre === 'piano' ? 3000 : 2400;
        filtro.frequency.setValueAtTime(brilho, t);
        filtro.frequency.exponentialRampToValueAtTime(timbre === 'piano' ? 900 : 500, t + 0.35);
        const tipo: OscillatorType = timbre === 'piano' || timbre === 'harpa' ? 'triangle' : 'sawtooth';
        this.osc(tipo, f, t, fim, filtro);
        if (timbre === 'viola') this.osc('sawtooth', f * 2, t, fim, filtro, 6); // cordas duplas em oitava
        if (timbre === 'piano') this.osc('sine', f * 2, t, fim, filtro);
        const sus = timbre === 'harpa' ? 0.5 : timbre === 'piano' ? 0.6 : 0.3;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vel * (tipo === 'sawtooth' ? 0.16 : 0.3), t + 0.004);
        g.gain.setTargetAtTime(0.0001, t + 0.005, Math.min(sus, dur * 0.8 + 0.05));
        break;
      }
      case 'violino': {
        filtro.frequency.value = 3400; filtro.Q.value = 1;
        const a = this.osc('sawtooth', f, t, fim, filtro);
        vibrato(16, 5.6, a);
        this.env(g, t, 0.06, vel * 0.15, dur, 0.1);
        break;
      }
      case 'teclado': case 'pad': {
        filtro.frequency.value = timbre === 'pad' ? 1400 : 2600;
        this.osc(timbre === 'pad' ? 'sawtooth' : 'square', f, t, fim, filtro, -8);
        this.osc(timbre === 'pad' ? 'sawtooth' : 'square', f, t, fim, filtro, 8);
        this.env(g, t, timbre === 'pad' ? 0.4 : 0.005, vel * (timbre === 'pad' ? 0.06 : 0.08), dur, timbre === 'pad' ? 0.5 : 0.05);
        break;
      }
    }
  }

  private acordeSom(timbre: Timbre, notas: number[], t: number, dur: number, vel: number) {
    // violão/cavaco "rasgam" o acorde; os demais atacam junto
    const rasgo = timbre === 'violao' || timbre === 'cavaco' || timbre === 'viola' ? 0.012 : 0;
    notas.forEach((n, i) => this.voz(timbre, mtof(n), t + i * rasgo, dur, vel / Math.sqrt(notas.length)));
  }

  private baixo(f: number, t: number, dur: number) {
    const ctx = this.ctx!, g = ctx.createGain(), filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass'; filtro.frequency.value = 700;
    filtro.connect(g); g.connect(this.saida(0));
    const fim = t + dur + 0.5;
    this.osc('triangle', f, t, fim, filtro);
    this.osc('sine', f, t, fim, filtro);
    this.env(g, t, 0.008, 0.42, dur, 0.06);
  }

  private ruidoEm(t: number, dur: number, freq: number, tipo: BiquadFilterType, vel: number, q = 1, rev = 0.15) {
    const ctx = this.ctx!, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.ruido;
    f.type = tipo; f.frequency.value = freq; f.Q.value = q;
    s.connect(f).connect(g).connect(this.saida(rev));
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }

  private tom(t: number, f0: number, f1: number, dur: number, vel: number, tipo: OscillatorType = 'sine', rev = 0.1) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    o.connect(g).connect(this.saida(rev));
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private bateria(v: VozBateria, t: number, vel: number, alt: boolean) {
    switch (v) {
      case 'bumbo': this.tom(t, 130, 45, 0.32, vel * 0.9); break;
      case 'surdo': this.tom(t, 85, 52, 0.6, vel * 0.85); break;
      case 'zabumba': this.tom(t, 110, 55, 0.4, vel * 0.9); this.ruidoEm(t, 0.04, 900, 'bandpass', vel * 0.15); break;
      case 'bacalhau': this.ruidoEm(t, 0.05, 3000, 'highpass', vel * 0.3); this.tom(t, 420, 380, 0.05, vel * 0.1, 'triangle'); break;
      case 'caixa': this.ruidoEm(t, 0.14, 2200, 'bandpass', vel * 0.45, 0.8); this.tom(t, 220, 180, 0.08, vel * 0.18, 'triangle'); break;
      case 'aro': this.tom(t, 1700, 1500, 0.035, vel * 0.25, 'square'); this.ruidoEm(t, 0.03, 3000, 'bandpass', vel * 0.15, 2); break;
      case 'tamborim': this.tom(t, 820, 760, 0.07, vel * 0.25, 'triangle'); this.ruidoEm(t, 0.03, 5000, 'highpass', vel * 0.15); break;
      case 'ganza': case 'maraca': this.ruidoEm(t, v === 'maraca' ? 0.07 : 0.05, v === 'maraca' ? 5000 : 7000, 'highpass', vel * 0.22); break;
      case 'chimbal': this.ruidoEm(t, alt ? 0.25 : 0.04, 8500, 'highpass', vel * 0.2); break;
      case 'triangulo':
        // 'a' aberto, 'b' abafado
        this.tom(t, 2650, 2650, alt ? 0.05 : 0.5, vel * 0.09, 'sine', 0.3);
        this.tom(t, 4180, 4180, alt ? 0.04 : 0.35, vel * 0.05, 'sine', 0.3);
        break;
      case 'agogo': this.tom(t, alt ? 610 : 905, alt ? 600 : 895, 0.18, vel * 0.13, 'square', 0.3); break;
      case 'gongue': this.tom(t, 420, 410, 0.3, vel * 0.13, 'square', 0.3); break;
      case 'palmas': for (let i = 0; i < 3; i++) this.ruidoEm(t + i * 0.009, 0.06, 1400, 'bandpass', vel * 0.35, 1.2, 0.3); break;
      case 'matraca': this.ruidoEm(t, 0.03, 2400, 'bandpass', vel * 0.4, 3); this.ruidoEm(t + 0.025, 0.03, 2600, 'bandpass', vel * 0.3, 3); break;
      case 'alfaia': this.tom(t, 95, 60, 0.45, vel * 0.95); this.ruidoEm(t, 0.03, 1200, 'bandpass', vel * 0.2); break;
      case 'pandeiro': this.ruidoEm(t, 0.09, 9000, 'highpass', vel * 0.2); if (!alt && vel > 0.4) this.tom(t, 260, 200, 0.12, vel * 0.25); break;
      case 'atabaque': this.tom(t, alt ? 330 : 240, alt ? 300 : 190, 0.22, vel * 0.5, 'sine'); this.ruidoEm(t, 0.02, 1800, 'bandpass', vel * 0.12); break;
    }
  }

  private ligarChuva() {
    const ctx = this.ctx!, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter();
    s.buffer = this.ruido; s.loop = true;
    f.type = 'lowpass'; f.frequency.value = 2400;
    f2.type = 'highpass'; f2.frequency.value = 300;
    this.chuvaGain = ctx.createGain();
    this.chuvaGain.gain.value = 0;
    s.connect(f).connect(f2).connect(this.chuvaGain).connect(this.busAmb);
    s.start();
  }
}

export const musica = new Musica();
