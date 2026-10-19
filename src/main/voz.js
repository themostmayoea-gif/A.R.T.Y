// Fala (TTS) e reconhecimento de voz (STT).
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

// ---------- TTS: vozes neurais do Edge (grátis, precisa de internet) ----------
let tts = null;
let vozAtual = null;

async function sintetizar(texto, cfgVoz) {
  if (!tts || vozAtual !== cfgVoz.edgeVoz) {
    if (tts) try { tts.close(); } catch { /* ok */ }
    tts = new MsEdgeTTS();
    await tts.setMetadata(cfgVoz.edgeVoz, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    vozAtual = cfgVoz.edgeVoz;
  }
  const seguro = String(texto).replace(/[<>&]/g, ' ');
  const gerar = () => new Promise((resolve, reject) => {
    const partes = [];
    const { audioStream } = tts.toStream(seguro, { rate: cfgVoz.velocidade || '+0%', pitch: cfgVoz.tom || '+0Hz' });
    const timer = setTimeout(() => reject(new Error('TTS demorou demais')), 15000);
    audioStream.on('data', (d) => partes.push(d));
    audioStream.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(partes)); });
    audioStream.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
  try {
    const buf = await gerar();
    if (!buf.length) throw new Error('áudio vazio');
    return buf;
  } catch (e) {
    // conexão pode ter caído: recria uma vez
    tts = null;
    if (!sintetizar.tentando) {
      sintetizar.tentando = true;
      try { return await sintetizar(texto, cfgVoz); } finally { sintetizar.tentando = false; }
    }
    throw e;
  }
}

// ---------- STT: reconhecimento de voz do Google (o mesmo que o Chrome usa) ----------
// Recebe PCM 16 bits mono 16 kHz.
const CHAVE_PUBLICA = 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';

async function transcrever(pcm, idioma = 'pt-BR') {
  const url = `https://www.google.com/speech-api/v2/recognize?client=chromium&output=json&lang=${encodeURIComponent(idioma)}&key=${CHAVE_PUBLICA}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'audio/l16; rate=16000' },
      body: pcm
    });
    if (!resp.ok) throw new Error('reconhecimento de voz: HTTP ' + resp.status);
    const corpo = await resp.text();
    for (const linha of corpo.split('\n')) {
      if (!linha.trim()) continue;
      let j;
      try { j = JSON.parse(linha); } catch { continue; }
      const alt = j.result && j.result[0] && j.result[0].alternative;
      if (alt && alt.length) return alt[0].transcript.trim();
    }
    return '';
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sintetizar, transcrever };
