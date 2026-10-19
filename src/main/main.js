// Processo principal do A.R.T.Y (Electron).
const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, shell, nativeImage, Notification, session } = require('electron');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const { Store } = require('./store');
const { criarCerebro } = require('./cerebro');
const { Executor, comandoRapido } = require('./acoes');
const winOps = require('./windows');
const clima = require('./clima');
const sistema = require('./sistema');
const voz = require('./voz');
const { comandoOriginal, limparFala } = require('./texto');

const DIR = process.env.ARTY_DATA_DIR || path.join(app.getPath('appData'), 'ARTY');
fs.mkdirSync(DIR, { recursive: true });
app.setPath('userData', path.join(DIR, 'electron'));
app.setAppUserModelId('com.arty.assistente');

const ASSETS = path.join(__dirname, '..', '..', 'assets');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let cfg;
let cfgErro = null;
let store;
let cerebro;
let executor;
let janela = null;
let bandeja = null;
let saindo = false;
let ultimoClima = null;
let ultimoSistema = null;
const historico = []; // conversa (só na memória)

function carregarConfig() {
  const r = config.carregar(DIR);
  cfg = r.cfg;
  cfgErro = r.erro;
  cerebro = criarCerebro(cfg, DIR);
  executor = new Executor({ store, win: winOps.criar(shell), cfg, aoMudar: enviarEstado });
}

function enviar(canal, dados) {
  if (janela && !janela.isDestroyed()) janela.webContents.send(canal, dados);
}

function enviarEstado() {
  enviar('estado', store.estado());
}

function registrar(texto) {
  store.registrar(texto);
  enviarEstado();
}

// ---------------------------------------------------------------- janela
function criarJanela() {
  janela = new BrowserWindow({
    width: 1560,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    frame: false,
    show: false,
    backgroundColor: '#020a14',
    title: 'A.R.T.Y',
    icon: path.join(ASSETS, 'ARTY.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  janela.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  janela.once('ready-to-show', () => {
    if (!process.argv.includes('--oculto')) janela.show();
  });
  // Fechar só esconde na bandeja
  janela.on('close', (e) => {
    if (!saindo) {
      e.preventDefault();
      janela.hide();
    }
  });
  // Nunca navega para fora nem abre janelas novas
  janela.webContents.on('will-navigate', (e) => e.preventDefault());
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.on('maximize', () => enviar('janela', { maximizada: true }));
  janela.on('unmaximize', () => enviar('janela', { maximizada: false }));
}

function mostrar(ouvir = false) {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
  if (ouvir) enviar('ouvir-agora');
}

function alternarJanela() {
  if (janela.isVisible() && janela.isFocused()) janela.hide();
  else mostrar();
}

// ---------------------------------------------------------------- bandeja
function menuBandeja() {
  const escuta = !!store.pref('escuta');
  const login = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: 'Abrir', click: () => mostrar() },
    { label: 'Modo escuta', type: 'checkbox', checked: escuta, click: (m) => definirEscuta(m.checked) },
    { label: 'Iniciar com o Windows', type: 'checkbox', checked: login, click: (m) => {
      app.setLoginItemSettings({ openAtLogin: m.checked, args: ['--oculto'] });
      atualizarBandeja();
    } },
    { type: 'separator' },
    { label: 'Sair', click: () => { saindo = true; app.quit(); } }
  ]);
}

function criarBandeja() {
  // o ícone da bandeja é o próprio floco
  let img = nativeImage.createFromPath(path.join(ASSETS, 'ARTY_floco.png'));
  img = img.isEmpty() ? nativeImage.createFromPath(path.join(ASSETS, 'tray.png')) : img.resize({ width: 32, height: 32, quality: 'best' });
  bandeja = new Tray(img);
  bandeja.setToolTip('A.R.T.Y');
  bandeja.on('click', alternarJanela);
  atualizarBandeja();
}

function atualizarBandeja() {
  if (bandeja) bandeja.setContextMenu(menuBandeja());
}

function definirEscuta(ligado) {
  store.pref('escuta', !!ligado);
  enviarEstado();
  atualizarBandeja();
}

// ---------------------------------------------------------------- conversa
function contexto() {
  const agora = new Date();
  const planos = store.planosHoje();
  const objetivos = store.objetivos();
  return {
    agora: agora.toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    clima: ultimoClima ? clima.resumoClima(ultimoClima) : 'indisponível',
    sistema: sistema.resumoSistema(ultimoSistema),
    planos: planos.map((p) => `${p.texto}${p.feito ? ' (feito)' : ''}`).join('; '),
    objetivos: objetivos.map((o) => `${o.nome} ${o.progresso}%${o.concluido ? ' (concluído)' : ''}`).join('; '),
    lembretes: store.dados.lembretes.map((l) => `${l.texto} às ${new Date(l.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`).join('; ')
  };
}

let ocupado = false;

async function processar(texto) {
  texto = String(texto || '').trim();
  if (!texto) return { fala: '' };
  if (ocupado) return { fala: 'Calma aí mano, ainda tô pensando na anterior.', ignorar: true };
  ocupado = true;
  try {
    historico.push({ quem: 'eu', texto });
    let resp = comandoRapido(texto);
    if (!resp) {
      enviar('pensando', true);
      try {
        resp = await cerebro.perguntar(texto, contexto(), historico.slice(0, -1));
      } finally {
        enviar('pensando', false);
      }
    }
    const falhas = [];
    for (const a of resp.acoes) {
      try {
        registrar(await executor.executar(a));
      } catch (e) {
        falhas.push(e.message);
        registrar(`Falhou (${a.tipo}): ${e.message}`);
      }
    }
    let fala = resp.fala || (resp.acoes.length ? 'Feito.' : 'Hmm, deu branco aqui. Fala de novo?');
    if (falhas.length) fala += ` Só que deu ruim: ${falhas[0]}.`;
    fala = limparFala(fala);
    historico.push({ quem: 'arty', texto: fala });
    if (historico.length > 40) historico.splice(0, historico.length - 40);
    return { fala };
  } catch (e) {
    historico.pop();
    registrar('Erro no cérebro: ' + e.message);
    return { fala: `Ih mano, deu ruim aqui: ${e.message}.`, erro: true };
  } finally {
    ocupado = false;
  }
}

// ---------------------------------------------------------------- IPC
function configurarIpc() {
  ipcMain.handle('inicial', () => ({
    estado: store.estado(),
    cfg: { nome: cfg.nome, cidade: cfg.cidade, voz: cfg.voz, escuta: cfg.escuta, atalho: cfg.atalhoGlobal, modo: cfg.cerebro.modo },
    cfgErro,
    clima: ultimoClima,
    floco: fs.existsSync(path.join(ASSETS, 'ARTY_floco.png'))
  }));

  ipcMain.handle('enviar', (_e, texto) => processar(texto));

  // Frase ouvida no modo escuta: só responde se começar com "Arty"
  ipcMain.handle('ouvido', async (_e, frase, direto) => {
    if (direto) return { comando: frase };
    const cmd = comandoOriginal(frase, cfg.escuta.palavrasAtivacao);
    if (cmd === null) return { ignorar: true };
    return { comando: cmd };
  });

  ipcMain.handle('transcrever', async (_e, pcm) => {
    try {
      return { texto: await voz.transcrever(Buffer.from(pcm), cfg.escuta.idioma) };
    } catch (e) {
      return { erro: e.message };
    }
  });

  ipcMain.handle('falar', async (_e, texto) => {
    if (cfg.voz.motor !== 'edge') return { erro: 'motor windows' };
    try {
      return { audio: await voz.sintetizar(texto, cfg.voz) };
    } catch (e) {
      return { erro: e.message };
    }
  });

  ipcMain.handle('plano', (_e, op, ref, valor) => {
    try {
      if (op === 'add') registrar(`Plano adicionado: ${store.addPlano(ref).texto}`);
      if (op === 'marcar') store.marcarPlano(ref, valor);
      if (op === 'remover') registrar(`Plano removido: ${store.removerPlano(ref).texto}`);
    } catch (e) { return { erro: e.message }; }
    enviarEstado();
    return { ok: true };
  });

  ipcMain.handle('objetivo', (_e, op, ref, valor) => {
    try {
      if (op === 'criar') registrar(`Objetivo criado: ${store.criarObjetivo(ref, valor || 0).nome}`);
      if (op === 'progresso') store.progressoObjetivo(ref, valor);
      if (op === 'concluir') registrar(`Objetivo concluído: ${store.concluirObjetivo(ref).nome}`);
      if (op === 'remover') registrar(`Objetivo removido: ${store.removerObjetivo(ref).nome}`);
    } catch (e) { return { erro: e.message }; }
    enviarEstado();
    return { ok: true };
  });

  ipcMain.handle('pref', (_e, k, v) => {
    if (k === 'escuta') definirEscuta(v);
    else store.pref(k, v);
    return store.dados.prefs;
  });

  ipcMain.handle('sistema', async () => {
    ultimoSistema = await sistema.ler();
    return ultimoSistema;
  });

  ipcMain.handle('clima', () => atualizarClima());

  ipcMain.handle('abrir-config', () => shell.openPath(path.join(DIR, 'config.json')));
  ipcMain.handle('recarregar-config', () => {
    carregarConfig();
    registrarAtalho();
    atualizarClima();
    return { cfg: { nome: cfg.nome, cidade: cfg.cidade, voz: cfg.voz, escuta: cfg.escuta, atalho: cfg.atalhoGlobal, modo: cfg.cerebro.modo }, cfgErro };
  });
  ipcMain.handle('nova-conversa', () => { historico.length = 0; cerebro.reiniciar(); return true; });

  ipcMain.on('janela', (_e, acao) => {
    if (!janela) return;
    if (acao === 'min') janela.minimize();
    if (acao === 'max') janela.isMaximized() ? janela.unmaximize() : janela.maximize();
    if (acao === 'fechar') janela.hide();
  });
}

// ---------------------------------------------------------------- tarefas periódicas
async function atualizarClima() {
  try {
    ultimoClima = await clima.buscarClima(cfg.cidade || 'São Paulo');
    enviar('clima', ultimoClima);
  } catch (e) {
    enviar('clima', { erro: e.message });
  }
  return ultimoClima;
}

function verificarLembretes() {
  for (const l of store.lembretesVencidos()) {
    registrar(`Lembrete: ${l.texto}`);
    const nome = cfg.nome && cfg.nome !== 'SEU NOME' ? cfg.nome : 'mano';
    enviar('lembrete', { texto: l.texto, fala: `Ô ${nome}, lembrete: ${l.texto}.` });
    if (Notification.isSupported()) {
      new Notification({ title: 'A.R.T.Y — lembrete', body: l.texto, icon: path.join(ASSETS, 'ARTY.ico') }).show();
    }
  }
}

function registrarAtalho() {
  globalShortcut.unregisterAll();
  try {
    if (!globalShortcut.register(cfg.atalhoGlobal || 'Control+Alt+A', () => mostrar(true))) {
      registrar(`Não consegui registrar o atalho ${cfg.atalhoGlobal}`);
    }
  } catch (e) {
    registrar(`Atalho inválido no config: ${cfg.atalhoGlobal}`);
  }
}

// ---------------------------------------------------------------- início
app.on('second-instance', () => mostrar());

app.whenReady().then(() => {
  store = new Store(DIR);
  store.faxina();
  carregarConfig();

  // Microfone liberado só para a própria janela do app
  session.defaultSession.setPermissionRequestHandler((wc, permissao, cb) => cb(permissao === 'media'));
  session.defaultSession.setPermissionCheckHandler((wc, permissao) => permissao === 'media');
  // Bloqueia qualquer requisição de rede vinda da interface (ela só fala com o processo principal)
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_d, cb) => cb({ cancel: true }));

  configurarIpc();
  criarJanela();
  criarBandeja();
  registrarAtalho();
  atualizarClima();
  setInterval(atualizarClima, 15 * 60 * 1000);
  setInterval(verificarLembretes, 5000);
  registrar('Sistema iniciado');
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { saindo = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
