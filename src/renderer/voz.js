// Microfone (detecção de fala), reprodução da voz e sons de interface.
/* global arty */
'use strict';

const Voz = (() => {
  const TAXA = 16000;
  const QUADRO = 1024; // 64 ms a 16 kHz

  let ctx = null;
  let stream = null;
  let proc = null;
  let fonte = null;

  // estado da detecção de fala
  let piso = 0.01;
  let falandoUsuario = false;
  let quadrosVoz = 0;
  let quadrosSilencio = 0;
  let gravacao = [];
  let preRoll = [];

  let nivelMic = 0;
  const pausas = new Set(); // 'falando', 'digitando', 'pensando'

  let aoFrase = null; // callback(Int16Array)
  let aoInicioFala = null;

  async function ligar() {
    if (ctx) return;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    ctx = new AudioContext({ sampleRate: TAXA });
    fonte = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(QUADRO, 1, 1);
    proc.onaudioprocess = (ev) => quadro(ev.inputBuffer.getChannelData(0));
    fonte.connect(proc);
    proc.connect(ctx.destination); // necessário para o processador rodar (a saída é silêncio)
  }

  function desligar() {
    if (!ctx) return;
    try { proc.disconnect(); fonte.disconnect(); } catch { /* ok */ }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
    ctx = stream = proc = fonte = null;
    resetar();
    nivelMic = 0;
  }

  function resetar() {
    falandoUsuario = false;
    quadrosVoz = quadrosSilencio = 0;
    gravacao = [];
    preRoll = [];
  }

  function quadro(dados) {
    if (pausas.size) {
      if (falandoUsuario || gravacao.length) resetar();
      nivelMic = 0;
      return;
    }
    let soma = 0;
    for (let i = 0; i < dados.length; i++) soma += dados[i] * dados[i];
    const rms = Math.sqrt(soma / dados.length);
    nivelMic = Math.min(1, rms * 12);
    const limiar = Math.max(0.014, piso * 2.8);
    const copia = new Float32Array(dados);

    if (!falandoUsuario) {
      piso = piso * 0.96 + rms * 0.04;
      preRoll.push(copia);
      if (preRoll.length > 5) preRoll.shift();
      if (rms > limiar) {
        quadrosVoz++;
        if (quadrosVoz >= 2) {
          falandoUsuario = true;
          gravacao = preRoll.slice();
          preRoll = [];
          quadrosSilencio = 0;
          if (aoInicioFala) aoInicioFala();
        }
      } else {
        quadrosVoz = 0;
      }
      return;
    }

    gravacao.push(copia);
    if (rms > limiar * 0.6) { quadrosVoz++; quadrosSilencio = 0; } else quadrosSilencio++;
    const acabou = quadrosSilencio >= 12 || gravacao.length > 230; // ~0,8 s de silêncio ou 15 s
    if (acabou) {
      const util = quadrosVoz >= 5;
      const partes = gravacao;
      resetar();
      if (util && aoFrase) aoFrase(paraPcm(partes));
    }
  }

  function paraPcm(partes) {
    const total = partes.reduce((n, p) => n + p.length, 0);
    const out = new Int16Array(total);
    let o = 0;
    for (const p of partes) {
      for (let i = 0; i < p.length; i++) {
        const s = Math.max(-1, Math.min(1, p[i]));
        out[o++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- falar
  let ctxSaida = null;
  let analisador = null;
  let tocando = null;
  let nivelVoz = 0;
  let falsoNivel = 0;
  let cfgVoz = {};

  function saida() {
    if (!ctxSaida) {
      ctxSaida = new AudioContext();
      analisador = ctxSaida.createAnalyser();
      analisador.fftSize = 512;
      analisador.connect(ctxSaida.destination);
    }
    return ctxSaida;
  }

  function lerNivelVoz() {
    if (tocando && analisador) {
      const buf = new Uint8Array(analisador.fftSize);
      analisador.getByteTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += ((v - 128) / 128) ** 2;
      nivelVoz = Math.min(1, Math.sqrt(s / buf.length) * 4);
    } else if (falsoNivel > 0) {
      falsoNivel *= 0.9;
      nivelVoz = falsoNivel * (0.6 + Math.random() * 0.4);
    } else {
      nivelVoz *= 0.85;
    }
    return nivelVoz;
  }

  async function falar(texto) {
    parar();
    const r = await arty.falar(texto);
    if (r && r.audio) {
      try {
        const c = saida();
        if (c.state === 'suspended') await c.resume();
        const bytes = r.audio instanceof Uint8Array ? r.audio : new Uint8Array(r.audio);
        const buf = await c.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        await new Promise((resolve) => {
          const src = c.createBufferSource();
          src.buffer = buf;
          src.connect(analisador);
          src.onended = () => { tocando = null; resolve(); };
          tocando = { src, resolve };
          src.start();
        });
        return;
      } catch (e) {
        console.warn('falha ao tocar áudio, usando voz do Windows', e);
      }
    }
    await falarWindows(texto);
  }

  function escolherVoz() {
    const vozes = speechSynthesis.getVoices();
    const pt = vozes.filter((v) => /pt[-_]BR/i.test(v.lang));
    const pref = (cfgVoz.windowsVoz || 'Daniel').toLowerCase();
    return pt.find((v) => v.name.toLowerCase().includes(pref)) ||
      pt.find((v) => /daniel|antonio|heitor|francisco|male/i.test(v.name)) || pt[0] || null;
  }

  function falarWindows(texto) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'pt-BR';
      const v = escolherVoz();
      if (v) u.voice = v;
      const vel = parseFloat(String(cfgVoz.velocidade || '0').replace('%', ''));
      u.rate = Math.max(0.5, Math.min(2, 1 + (isNaN(vel) ? 0 : vel / 100)));
      u.pitch = 1.05;
      u.onboundary = () => { falsoNivel = 1; };
      u.onstart = () => { falsoNivel = 1; };
      u.onend = u.onerror = () => { falsoNivel = 0; resolve(); };
      tocando = null;
      speechSynthesis.speak(u);
      // garante a pulsação mesmo sem eventos de palavra
      const pulso = setInterval(() => { if (speechSynthesis.speaking) falsoNivel = Math.max(falsoNivel, 0.5 + Math.random() * 0.5); else clearInterval(pulso); }, 160);
    });
  }

  function parar() {
    if (tocando) {
      try { tocando.src.stop(); } catch { /* ok */ }
      const r = tocando.resolve;
      tocando = null;
      r();
    }
    if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.cancel();
  }

  // ---------------------------------------------------------------- bipes
  function bipe(freq = 880, dur = 0.06, vol = 0.05, tipo = 'sine') {
    try {
      const c = saida();
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = tipo;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur + 0.02);
    } catch { /* sem áudio */ }
  }

  return {
    ligar,
    desligar,
    get ligado() { return !!ctx; },
    pausar: (motivo) => pausas.add(motivo),
    retomar: (motivo) => pausas.delete(motivo),
    get pausado() { return pausas.size > 0; },
    get usuarioFalando() { return falandoUsuario; },
    nivelMic: () => nivelMic,
    nivelVoz: lerNivelVoz,
    aoFrase: (fn) => { aoFrase = fn; },
    aoInicioFala: (fn) => { aoInicioFala = fn; },
    falar,
    parar,
    get falando() { return !!tocando || (window.speechSynthesis && speechSynthesis.speaking); },
    configurar: (v) => { cfgVoz = v || {}; },
    bipe
  };
})();
