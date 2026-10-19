// Interface do A.R.T.Y: painéis, núcleo animado, conversa e controle de voz.
/* global arty, Voz */
'use strict';

const $ = (id) => document.getElementById(id);
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_CURTOS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const app = {
  cfg: {},
  estado: { planos: [], objetivos: [], log: [], prefs: {} },
  visual: 'aguardando',
  pensando: false,
  direto: false,       // ouvindo um comando sem precisar de "Arty"
  diretoAte: 0,
  processando: false
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ================================================================ DIA
let ultimoDiaCal = '';
function atualizarRelogio() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  $('hora').textContent = `${p(d.getHours())}:${p(d.getMinutes())}`;
  $('seg').textContent = p(d.getSeconds());
  $('diaSemana').textContent = DIAS[d.getDay()];
  $('dataTxt').textContent = `${p(d.getDate())} DE ${MESES[d.getMonth()].toUpperCase()} DE ${d.getFullYear()}`;
  const chave = d.toDateString();
  if (chave !== ultimoDiaCal) {
    if (ultimoDiaCal) arty.inicial().then((r) => renderEstado(r.estado)); // virou o dia: planos novos
    ultimoDiaCal = chave;
    renderCalendario(d);
  }
}

function renderCalendario(hoje) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const primeiro = new Date(ano, mes, 1).getDay();
  const nDias = new Date(ano, mes + 1, 0).getDate();
  let h = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((x) => `<div class="cab">${x}</div>`).join('');
  for (let i = 0; i < primeiro; i++) h += '<div class="d vazio">.</div>';
  for (let dia = 1; dia <= nDias; dia++) {
    const sem = (primeiro + dia - 1) % 7;
    const cls = ['d'];
    if (sem === 0 || sem === 6) cls.push('fds');
    if (dia === hoje.getDate()) cls.push('hoje');
    h += `<div class="${cls.join(' ')}">${dia}</div>`;
  }
  $('calendario').innerHTML = h;
}

// ================================================================ CLIMA
const ICONES = {
  sol: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="8"/><path d="M24 6v6M24 36v6M6 24h6M36 24h6M11.3 11.3l4.2 4.2M32.5 32.5l4.2 4.2M11.3 36.7l4.2-4.2M32.5 15.5l4.2-4.2"/></svg>',
  lua: '<svg viewBox="0 0 48 48"><path d="M30 8a16 16 0 1 0 10 26A13 13 0 0 1 30 8z"/></svg>',
  parcial: '<svg viewBox="0 0 48 48"><circle cx="18" cy="17" r="6"/><path d="M18 5v3M6 17h3M9.5 8.5l2 2M26.5 8.5l-2 2"/><path d="M16 38h20a7 7 0 0 0 0-14 10 10 0 0 0-19 2 6 6 0 0 0-1 12z"/></svg>',
  nuvem: '<svg viewBox="0 0 48 48"><path d="M14 36h22a8 8 0 0 0 0-16 11 11 0 0 0-21 2 7 7 0 0 0-1 14z"/></svg>',
  neblina: '<svg viewBox="0 0 48 48"><path d="M14 26h22a8 8 0 0 0 0-16 11 11 0 0 0-21 2 7 7 0 0 0-1 14z"/><path d="M8 32h32M12 38h26M8 44h22"/></svg>',
  chuva: '<svg viewBox="0 0 48 48"><path d="M14 28h22a8 8 0 0 0 0-16 11 11 0 0 0-21 2 7 7 0 0 0-1 14z"/><path d="M16 34l-3 6M24 34l-3 6M32 34l-3 6"/></svg>',
  tempestade: '<svg viewBox="0 0 48 48"><path d="M14 28h22a8 8 0 0 0 0-16 11 11 0 0 0-21 2 7 7 0 0 0-1 14z"/><path d="M25 30l-5 8h7l-4 8"/></svg>',
  neve: '<svg viewBox="0 0 48 48"><path d="M14 28h22a8 8 0 0 0 0-16 11 11 0 0 0-21 2 7 7 0 0 0-1 14z"/><path d="M16 36v6M13 39h6M30 36v6M27 39h6M23 40v6M20 43h6"/></svg>'
};

function renderClima(c) {
  if (!c) return;
  if (c.erro) {
    $('climaCond').textContent = 'sem conexão';
    $('climaCidade').textContent = (app.cfg.cidade || '').toUpperCase();
    return;
  }
  $('climaCidade').textContent = `${c.cidade}${c.uf ? ' / ' + c.uf : ''}`.toUpperCase();
  $('climaIcone').innerHTML = ICONES[c.icone] || ICONES.nuvem;
  $('climaTemp').textContent = c.temp;
  $('climaCond').textContent = c.texto;
  $('climaMax').textContent = c.max;
  $('climaMin').textContent = c.min;
  $('climaUmid').textContent = c.umidade;
  $('climaVento').textContent = c.vento;
  $('previsao').innerHTML = c.dias.slice(1, 6).map((d) => {
    const dt = new Date(d.data + 'T12:00:00');
    return `<div class="pd" title="${esc(d.texto)}${d.chuva != null ? ' — chuva ' + d.chuva + '%' : ''}"><b>${DIAS_CURTOS[dt.getDay()]}</b>${ICONES[d.icone] || ICONES.nuvem}<div class="mm">${d.max}° <span>${d.min}°</span></div></div>`;
  }).join('');
}

// ================================================================ SISTEMA
function medidor(el, rotulo, pct, texto) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  if (!el.firstChild) {
    el.innerHTML = `<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" class="marcas"/><circle cx="40" cy="40" r="${r}" class="trilho"/>` +
      `<circle cx="40" cy="40" r="${r}" class="valor" transform="rotate(-90 40 40)" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"/></svg>` +
      `<div class="num"></div><div class="rot">${rotulo}</div>`;
  }
  el.querySelector('.valor').setAttribute('stroke-dashoffset', String(circ * (1 - v / 100)));
  el.querySelector('.num').innerHTML = `<span>${texto}</span>`;
  el.classList.toggle('alto', rotulo !== 'BAT' && v >= 75 && v < 90);
  el.classList.toggle('critico', rotulo !== 'BAT' ? v >= 90 : (pct != null && v <= 15));
}

function fmtUptime(seg) {
  const d = Math.floor(seg / 86400);
  const h = Math.floor((seg % 86400) / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return (d ? `${d}d ` : '') + `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

function fmtVel(bps) {
  if (bps > 1e6) return (bps / 1e6).toFixed(1) + ' MB/s';
  if (bps > 1e3) return (bps / 1e3).toFixed(0) + ' KB/s';
  return Math.round(bps) + ' B/s';
}

const cpuHist = new Array(48).fill(0);
const rede = { down: new Array(60).fill(0), up: new Array(60).fill(0) };

async function atualizarSistema() {
  let s;
  try { s = await arty.sistema(); } catch { return; }
  $('nomePc').textContent = (s.nomePc || '').toUpperCase();
  medidor($('mCpu'), 'CPU', s.cpu, `${s.cpu}<small>%</small>`);
  medidor($('mRam'), 'RAM', s.ram, `${s.ram}<small>%</small>`);
  medidor($('mDisco'), 'DISCO', s.disco ? s.disco.usado : null, s.disco ? `${s.disco.usado}<small>%</small>` : '--');
  medidor($('mBateria'), 'BAT', s.bateria ? s.bateria.pct : 100, s.bateria ? `${s.bateria.pct}<small>%${s.bateria.carregando ? '+' : ''}</small>` : '<small>AC</small>');
  cpuHist.push(s.cpu); cpuHist.shift();
  $('cpuHist').innerHTML = cpuHist.map((v) => `<i style="height:${Math.max(2, v)}%" class="${v >= 90 ? 'c' : v >= 75 ? 'a' : ''}"></i>`).join('');
  $('uptime').textContent = fmtUptime(s.uptime);
  $('ramTxt').textContent = `${s.ramUsadaGB} / ${s.ramTotalGB} GB`;
  $('discoTxt').textContent = s.disco ? `${s.disco.livreGB} GB de ${s.disco.totalGB} GB` : '--';
  rede.down.push(s.rede.down); rede.down.shift();
  rede.up.push(s.rede.up); rede.up.shift();
  $('redeDown').textContent = fmtVel(s.rede.down);
  $('redeUp').textContent = fmtVel(s.rede.up);
  desenharRede();
}

function desenharRede() {
  const cv = $('graficoRede');
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w) return;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,229,255,.08)';
  g.lineWidth = 1;
  for (let y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
  for (let x = 0; x <= w; x += w / 12) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
  const max = Math.max(50e3, ...rede.down, ...rede.up) * 1.15;
  const linha = (dados, cor, preencher) => {
    g.beginPath();
    dados.forEach((v, i) => {
      const x = (i / (dados.length - 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = cor;
    g.lineWidth = 1.6;
    g.shadowColor = cor;
    g.shadowBlur = 6;
    g.stroke();
    g.shadowBlur = 0;
    if (preencher) {
      g.lineTo(w, h); g.lineTo(0, h); g.closePath();
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(0,229,255,.28)');
      grad.addColorStop(1, 'rgba(0,229,255,0)');
      g.fillStyle = grad;
      g.fill();
    }
  };
  linha(rede.down, '#00e5ff', true);
  linha(rede.up, '#3dffb5', false);
}

// ================================================================ PLANOS / OBJETIVOS / LOG
function renderEstado(e) {
  if (!e) return;
  app.estado = e;
  const planos = e.planos || [];
  $('planosCont').textContent = `${planos.filter((p) => p.feito).length}/${planos.length}`;
  $('listaPlanos').innerHTML = planos.length
    ? planos.map((p) => `<li class="${p.feito ? 'feito' : ''}" data-id="${p.id}"><span class="caixa" data-acao="marcar"></span><span class="t">${esc(p.texto)}</span><button class="x" data-acao="remover" title="Remover">×</button></li>`).join('')
    : '<li class="vazio">nada pra hoje. diz "Arty, anota aí pra hoje..."</li>';

  const objs = (e.objetivos || []).slice().sort((a, b) => a.concluido - b.concluido);
  $('listaObjetivos').innerHTML = objs.length
    ? objs.map((o) => `<li class="${o.concluido ? 'concluido' : ''}" data-id="${o.id}">
        <span class="t" title="${esc(o.nome)}">${esc(o.nome)}</span>
        <span class="acoes"><button data-acao="menos">-10</button><button data-acao="mais">+10</button><button data-acao="concluir" title="Concluir">OK</button><button data-acao="remover" title="Remover">×</button></span>
        <span class="pct">${o.progresso}%</span>
        <div class="barra" data-acao="barra" title="Clique para definir a %"><i style="width:${o.progresso}%"></i></div></li>`).join('')
    : '<li class="vazio">nenhum objetivo ainda</li>';

  $('log').innerHTML = (e.log || []).map((l) => {
    const t = new Date(l.t);
    return `<li><span>${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}</span>${esc(l.texto)}</li>`;
  }).join('');

  const prefs = e.prefs || {};
  $('btMudo').classList.toggle('mudo', !!prefs.mudo);
  $('btEscuta').classList.toggle('ativo', !!prefs.escuta);
  $('btEscuta').classList.toggle('desligado', !prefs.escuta);
  $('escutaTxt').textContent = prefs.escuta ? 'ON' : 'OFF';
  renderChips();
  sincronizarMic();
}

function renderChips() {
  const p = app.estado.prefs || {};
  const chips = [
    ['CÉREBRO', app.cfg.modo === 'api' ? 'API' : 'CLAUDE CODE', true],
    ['ESCUTA', p.escuta ? 'ON' : 'OFF', !!p.escuta],
    ['VOZ', p.mudo ? 'MUDO' : 'ON', !p.mudo],
    ['ATALHO', (app.cfg.atalho || '').toUpperCase().replace('CONTROL', 'CTRL'), true]
  ];
  $('chips').innerHTML = chips.map(([k, v, on]) => `<span class="chip ${on ? 'on' : 'off'}">${k}: ${esc(v)}</span>`).join('');
  $('modoCerebro').textContent = app.cfg.modo === 'api' ? 'API' : 'CLAUDE CODE';
}

$('listaPlanos').addEventListener('click', async (ev) => {
  const li = ev.target.closest('li[data-id]');
  const acao = ev.target.dataset.acao;
  if (!li || !acao) return;
  const p = app.estado.planos.find((x) => x.id === li.dataset.id);
  if (acao === 'marcar') { await arty.plano('marcar', li.dataset.id, !p.feito); if (!p.feito) Voz.bipe(1200, 0.05); }
  if (acao === 'remover') await arty.plano('remover', li.dataset.id);
});

$('listaObjetivos').addEventListener('click', async (ev) => {
  const li = ev.target.closest('li[data-id]');
  const alvo = ev.target.closest('[data-acao]');
  if (!li || !alvo) return;
  const o = app.estado.objetivos.find((x) => x.id === li.dataset.id);
  const acao = alvo.dataset.acao;
  if (acao === 'mais') await arty.objetivo('progresso', o.id, o.progresso + 10);
  if (acao === 'menos') await arty.objetivo('progresso', o.id, o.progresso - 10);
  if (acao === 'concluir') await arty.objetivo('concluir', o.id);
  if (acao === 'remover') await arty.objetivo('remover', o.id);
  if (acao === 'barra') {
    const r = alvo.getBoundingClientRect();
    const pct = Math.round(((ev.clientX - r.left) / r.width) * 20) * 5;
    await arty.objetivo('progresso', o.id, pct);
  }
});

$('formPlano').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const v = $('novoPlano').value.trim();
  if (!v) return;
  $('novoPlano').value = '';
  await arty.plano('add', v);
});

$('formObjetivo').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const v = $('novoObjetivo').value.trim();
  if (!v) return;
  $('novoObjetivo').value = '';
  await arty.objetivo('criar', v, 0);
});

// ================================================================ CONVERSA
function addMsg(quem, texto, extra = '') {
  const nomes = { eu: 'VOCÊ', arty: 'A.R.T.Y', sistema: 'SISTEMA' };
  const div = document.createElement('div');
  div.className = `msg ${quem} ${extra}`;
  div.innerHTML = `<span class="quem">${nomes[quem]}</span><span class="txt">${esc(texto)}</span>`;
  const chat = $('chat');
  chat.appendChild(div);
  while (chat.children.length > 80) chat.firstChild.remove();
  chat.scrollTop = chat.scrollHeight;
}

async function responder(fala, { erro = false, ouvirDepois = false } = {}) {
  if (!fala) return;
  addMsg('arty', fala, erro ? 'erro' : '');
  if (app.estado.prefs.mudo) { if (ouvirDepois) ouvirDireto(); return; }
  Voz.pausar('falando');
  try {
    await Voz.falar(fala);
  } finally {
    setTimeout(() => {
      Voz.retomar('falando');
      if (ouvirDepois) ouvirDireto();
    }, 250);
  }
}

async function enviarComando(texto) {
  texto = texto.trim();
  if (!texto) return;
  if (app.processando) { addMsg('sistema', 'calma, ainda processando o anterior...'); return; }
  app.processando = true;
  addMsg('eu', texto);
  Voz.pausar('pensando');
  let r;
  try {
    r = await arty.enviar(texto);
  } catch (e) {
    r = { fala: 'Ih, deu erro aqui: ' + e.message, erro: true };
  } finally {
    Voz.retomar('pensando');
    app.processando = false;
  }
  if (r && !r.ignorar) await responder(r.fala, { erro: r.erro });
}

// ================================================================ VOZ
async function sincronizarMic() {
  const precisa = !!app.estado.prefs.escuta || app.direto;
  if (app.ligandoMic) return;
  try {
    app.ligandoMic = true;
    if (precisa && !Voz.ligado && (!app.micFalhou || app.direto)) await Voz.ligar();
    if (!precisa && Voz.ligado) Voz.desligar();
    app.micFalhou = false;
  } catch (e) {
    // avisa uma vez só; tenta de novo quando clicar no microfone ou ligar a escuta
    if (!app.micFalhou) addMsg('sistema', 'não consegui acessar o microfone: ' + e.message, 'erro');
    app.micFalhou = true;
    if (app.direto) fimDireto();
  } finally {
    app.ligandoMic = false;
  }
  $('dicaVoz').textContent = app.estado.prefs.escuta
    ? 'diga "Arty" ou clique no microfone'
    : 'modo escuta desligado — clique no microfone';
}

async function ouvirDireto(segundos) {
  Voz.parar();
  app.direto = true;
  app.diretoAte = Date.now() + (segundos || (app.cfg.escuta && app.cfg.escuta.esperaComando) || 8) * 1000;
  $('btMic').classList.add('gravando');
  Voz.bipe(660, 0.05);
  setTimeout(() => Voz.bipe(990, 0.06), 70);
  await sincronizarMic();
}

function fimDireto() {
  app.direto = false;
  $('btMic').classList.remove('gravando');
  sincronizarMic();
}

Voz.aoInicioFala(() => {
  // estendeu a janela de escuta enquanto a pessoa ainda está falando
  if (app.direto) app.diretoAte = Math.max(app.diretoAte, Date.now() + 16000);
});

Voz.aoFrase(async (pcm) => {
  const eraDireto = app.direto;
  if (eraDireto) fimDireto();
  if (app.processando) return;
  app.transcrevendo = true;
  let r;
  try {
    r = await arty.transcrever(pcm.buffer);
  } finally {
    app.transcrevendo = false;
  }
  if (r.erro) {
    if (eraDireto) addMsg('sistema', 'reconhecimento de voz falhou: ' + r.erro, 'erro');
    return;
  }
  if (!r.texto) {
    if (eraDireto) addMsg('sistema', 'não entendi nada, fala de novo');
    return;
  }
  const o = await arty.ouvido(r.texto, eraDireto);
  if (o.ignorar) return;
  if (!o.comando) {
    const falas = ['Fala aí.', 'Opa, fala.', 'Diz aí, mano.', 'Tô ouvindo.', 'Hm? Fala.'];
    await responder(falas[Math.floor(Math.random() * falas.length)], { ouvirDepois: true });
    return;
  }
  await enviarComando(o.comando);
});

// ================================================================ NÚCLEO ANIMADO
const aneis = [...document.querySelectorAll('#aneis .anel')].map((el) => ({ el, vel: parseFloat(el.dataset.vel), ang: Math.random() * 360 }));

function montarAneis() {
  const ns = 'http://www.w3.org/2000/svg';
  const marcas = $('anelMarcas');
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const grande = i % 10 === 0;
    const r1 = 252;
    const r2 = grande ? 266 : 258;
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', (Math.cos(a) * r1).toFixed(1));
    l.setAttribute('y1', (Math.sin(a) * r1).toFixed(1));
    l.setAttribute('x2', (Math.cos(a) * r2).toFixed(1));
    l.setAttribute('y2', (Math.sin(a) * r2).toFixed(1));
    l.setAttribute('class', 'marca-anel' + (grande ? ' grande' : ''));
    marcas.appendChild(l);
  }
  const hexs = $('anelHex');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const cx = Math.cos(a) * 184;
    const cy = Math.sin(a) * 184;
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const b = (k / 6) * Math.PI * 2 + Math.PI / 6;
      pts.push(`${(cx + Math.cos(b) * 9).toFixed(1)},${(cy + Math.sin(b) * 9).toFixed(1)}`);
    }
    const p = document.createElementNS(ns, 'polygon');
    p.setAttribute('points', pts.join(' '));
    p.setAttribute('class', 'hex');
    hexs.appendChild(p);
  }
}

const VEL = { aguardando: 1, ouvindo: 2.2, pensando: 14, falando: 3 };
const TEXTOS = { aguardando: 'AGUARDANDO', ouvindo: 'OUVINDO', pensando: 'PENSANDO', falando: 'FALANDO' };
let velAtual = 1;
let giroFloco = 0;
let nivelSuave = 0;
let ultimoT = performance.now();

function estadoVisual() {
  if (Voz.falando) return 'falando';
  if (app.pensando || app.transcrevendo) return 'pensando';
  if (app.direto || Voz.usuarioFalando) return 'ouvindo';
  return 'aguardando';
}

function animar(t) {
  const dt = Math.min(0.05, (t - ultimoT) / 1000);
  ultimoT = t;
  const est = estadoVisual();
  if (est !== app.visual) {
    app.visual = est;
    $('core').dataset.estado = est;
    $('estadoTxt').textContent = TEXTOS[est];
  }
  velAtual += (VEL[est] - velAtual) * Math.min(1, dt * 3);
  for (const a of aneis) {
    a.ang = (a.ang + a.vel * velAtual * dt * 12) % 360;
    a.el.setAttribute('transform', `rotate(${a.ang.toFixed(2)})`);
  }
  let nivel = 0;
  let brilho;
  const seg = t / 1000;
  if (est === 'falando') {
    nivel = Voz.nivelVoz();
    brilho = 0.75 + nivel * 0.6;
  } else if (est === 'ouvindo') {
    nivel = Voz.nivelMic() * 0.8;
    brilho = 0.95 + 0.25 * Math.sin(seg * 6) + nivel * 0.4;
  } else if (est === 'pensando') {
    brilho = 0.7 + 0.2 * Math.sin(seg * 9);
    Voz.nivelVoz();
  } else {
    Voz.nivelVoz();
    brilho = 0.5 + 0.28 * Math.sin(seg * 1.4); // respirando
  }
  nivelSuave += (nivel - nivelSuave) * Math.min(1, dt * 18);
  giroFloco = (giroFloco + dt * (est === 'pensando' ? 40 : est === 'aguardando' ? 3 : 6)) % 360;
  const core = $('core');
  core.style.setProperty('--nivel', nivelSuave.toFixed(3));
  core.style.setProperty('--brilho', Math.max(0, brilho).toFixed(3));
  core.style.setProperty('--giro', giroFloco.toFixed(2) + 'deg');

  if (app.direto && Date.now() > app.diretoAte && !Voz.usuarioFalando) fimDireto();
  requestAnimationFrame(animar);
}

// ================================================================ ENTRADA DE TEXTO E BOTÕES
const campo = $('campo');
campo.addEventListener('focus', () => Voz.pausar('digitando'));
campo.addEventListener('input', () => Voz.pausar('digitando'));
campo.addEventListener('blur', () => { if (!campo.value.trim()) Voz.retomar('digitando'); });
$('formEntrada').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = campo.value;
  campo.value = '';
  Voz.retomar('digitando');
  campo.blur();
  enviarComando(v);
});

$('btMic').addEventListener('click', () => {
  if (Voz.falando) { Voz.parar(); }
  if (app.direto) { fimDireto(); return; }
  app.micFalhou = false;
  ouvirDireto();
});
$('btMudo').addEventListener('click', async () => {
  const mudo = !app.estado.prefs.mudo;
  if (mudo) Voz.parar();
  app.estado.prefs = await arty.pref('mudo', mudo);
  renderEstado(app.estado);
});
$('btEscuta').addEventListener('click', () => {
  app.micFalhou = false;
  arty.pref('escuta', !app.estado.prefs.escuta);
});
$('btMin').addEventListener('click', () => arty.janela('min'));
$('btMax').addEventListener('click', () => arty.janela('max'));
$('btFechar').addEventListener('click', () => arty.janela('fechar'));
$('btConfig').addEventListener('click', () => arty.abrirConfig());
$('btRecarregar').addEventListener('click', async () => {
  const r = await arty.recarregarConfig();
  app.cfg = r.cfg;
  Voz.configurar(app.cfg.voz);
  renderChips();
  addMsg('sistema', r.cfgErro || 'config recarregado');
});
$('btNova').addEventListener('click', async () => {
  await arty.novaConversa();
  $('chat').innerHTML = '';
  addMsg('sistema', 'conversa nova, memória limpa');
});

document.addEventListener('keydown', (ev) => {
  const noCampo = document.activeElement && document.activeElement.tagName === 'INPUT';
  if ((ev.ctrlKey && ev.code === 'Space') || (ev.key === '/' && !noCampo)) {
    ev.preventDefault();
    campo.focus();
  } else if (ev.key === 'Escape') {
    if (Voz.falando) Voz.parar();
    if (noCampo) document.activeElement.blur();
  }
});

// ================================================================ EVENTOS DO PROCESSO PRINCIPAL
arty.aoEstado(renderEstado);
arty.aoClima(renderClima);
arty.aoPensando((v) => { app.pensando = v; });
arty.aoLembrete((l) => {
  Voz.bipe(880, 0.12, 0.08); setTimeout(() => Voz.bipe(1320, 0.15, 0.08), 160);
  responder(l.fala);
});
arty.aoOuvirAgora(() => ouvirDireto());

// ================================================================ INICIALIZAÇÃO
async function inicializar() {
  montarAneis();
  const r = await arty.inicial();
  app.cfg = r.cfg;
  Voz.configurar(app.cfg.voz);
  if (!r.floco) document.querySelectorAll('img[src*="ARTY_floco"]').forEach((img) => { img.style.visibility = 'hidden'; });

  const linhas = [
    'carregando núcleo...', 'calibrando anéis do HUD', 'conectando sensores do sistema',
    `sincronizando clima: ${app.cfg.cidade || '—'}`, 'carregando planos e objetivos',
    `cérebro: ${app.cfg.modo === 'api' ? 'API Anthropic' : 'Claude Code'}`, 'módulo de voz pt-BR ok', 'A.R.T.Y online'
  ];
  const boot = $('bootLinhas');
  for (let i = 0; i < linhas.length; i++) {
    await esperar(130);
    const d = document.createElement('div');
    d.textContent = linhas[i];
    boot.appendChild(d);
    $('bootBarra').style.width = `${((i + 1) / linhas.length) * 100}%`;
    Voz.bipe(600 + i * 90, 0.035, 0.03, 'square');
  }
  await esperar(350);
  document.body.classList.remove('iniciando');
  $('core').classList.add('entra');
  document.querySelector('.titulo-janela').classList.add('entra');
  const paineis = [...document.querySelectorAll('.painel')];
  paineis.forEach((p, i) => {
    setTimeout(() => { p.classList.add('entra'); Voz.bipe(1000 + (i % 4) * 140, 0.03, 0.025); }, 120 + i * 110);
  });

  atualizarRelogio();
  setInterval(atualizarRelogio, 1000);
  renderEstado(r.estado);
  renderClima(r.clima);
  atualizarSistema();
  setInterval(atualizarSistema, 2000);
  requestAnimationFrame(animar);
  window.addEventListener('resize', desenharRede);

  if (r.cfgErro) addMsg('sistema', r.cfgErro, 'erro');
  const nome = r.cfg.nome && r.cfg.nome !== 'SEU NOME' ? r.cfg.nome : '';
  setTimeout(() => {
    if (!nome) addMsg('sistema', 'dica: coloque seu nome e cidade no config (botão de engrenagem lá em cima) e clique em recarregar');
    responder(saudacao(nome));
  }, 120 + paineis.length * 110 + 500);
}

function saudacao(nome) {
  const h = new Date().getHours();
  const periodo = h < 5 ? 'Madrugada, hein' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const n = nome ? `, ${nome}` : '';
  const op = [
    `${periodo}${n}. A.R.T.Y online, bora.`,
    `${periodo}${n}! Tô on, manda aí.`,
    `E aí${n}. ${periodo}. Sistemas de pé, suave.`
  ];
  return op[Math.floor(Math.random() * op.length)];
}

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

inicializar();
