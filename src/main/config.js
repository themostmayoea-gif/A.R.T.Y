// Configuração do A.R.T.Y: fica em %APPDATA%\ARTY\config.json.
// Na primeira execução o arquivo é criado com os valores padrão abaixo.
const fs = require('fs');
const path = require('path');

const PADRAO = {
  nome: '',
  cidade: 'São Paulo',
  voz: {
    // "edge": vozes neurais da Microsoft (precisa de internet, soa bem melhor)
    // "windows": vozes instaladas no Windows (offline)
    motor: 'edge',
    edgeVoz: 'pt-BR-AntonioNeural',
    windowsVoz: 'Daniel',
    velocidade: '+8%',
    tom: '+4Hz'
  },
  escuta: {
    palavrasAtivacao: ['arty', 'arti', 'artie', 'arte', 'artes', 'harty', 'hearty', 'art', 'aarti'],
    idioma: 'pt-BR',
    // segundos que ele espera o próximo comando depois de "fala aí"
    esperaComando: 8
  },
  cerebro: {
    // "claude-code": usa o Claude Code instalado (claude -p) com a sua assinatura
    // "api": usa uma chave da API da Anthropic (preencha apiKey)
    modo: 'claude-code',
    modelo: 'haiku',
    claudeCaminho: '',
    apiKey: '',
    apiModelo: 'claude-haiku-5-5',
    timeoutSegundos: 90
  },
  atalhoGlobal: 'Control+Alt+A',
  musicaPadrao: 'youtube',
  programas: {
    'chrome': { nome: 'Google Chrome', abrir: 'chrome', apelidos: ['chrome', 'google chrome', 'navegador'] },
    'edge': { nome: 'Microsoft Edge', abrir: 'msedge', apelidos: ['edge'] },
    'spotify': { nome: 'Spotify', abrir: 'spotify:', apelidos: ['spotify'] },
    'discord': { nome: 'Discord', abrir: 'discord://', apelidos: ['discord', 'disc'] },
    'steam': { nome: 'Steam', abrir: 'steam://open/main', apelidos: ['steam'] },
    'roblox studio': { nome: 'Roblox Studio', abrir: 'roblox-studio:', apelidos: ['roblox studio', 'studio'] },
    'vscode': { nome: 'VS Code', abrir: 'vscode://', apelidos: ['vs code', 'vscode', 'visual studio code', 'code'] },
    'calculadora': { nome: 'Calculadora', abrir: 'calc', apelidos: ['calculadora', 'calc'] },
    'explorador': { nome: 'Explorador de Arquivos', abrir: 'explorer', apelidos: ['explorador', 'explorer', 'arquivos', 'pastas'] },
    'bloco de notas': { nome: 'Bloco de Notas', abrir: 'notepad', apelidos: ['bloco de notas', 'notepad'] },
    'gerenciador de tarefas': { nome: 'Gerenciador de Tarefas', abrir: 'taskmgr', apelidos: ['gerenciador de tarefas', 'task manager'] },
    'configuracoes': { nome: 'Configurações', abrir: 'ms-settings:', apelidos: ['configurações', 'configuracoes', 'settings'] }
  }
};

function mesclar(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return extra === undefined ? base : extra;
  }
  const out = { ...base };
  for (const k of Object.keys(extra || {})) {
    // "programas" é substituído inteiro, para o usuário poder remover itens
    out[k] = (k === 'programas' || !(k in base)) ? extra[k] : mesclar(base[k], extra[k]);
  }
  return out;
}

function carregar(dir) {
  const arq = path.join(dir, 'config.json');
  let doUsuario = {};
  let erro = null;
  if (fs.existsSync(arq)) {
    try {
      doUsuario = JSON.parse(fs.readFileSync(arq, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      erro = `config.json inválido (${e.message}). Usando o padrão.`;
    }
  } else {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(arq, JSON.stringify(PADRAO, null, 2), 'utf8');
  }
  const cfg = mesclar(PADRAO, doUsuario);
  return { cfg, arquivo: arq, erro };
}

module.exports = { carregar, PADRAO, mesclar };
