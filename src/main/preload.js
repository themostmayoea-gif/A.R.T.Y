// Ponte segura entre a interface e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

const ouvir = (canal) => (fn) => {
  const h = (_e, dados) => fn(dados);
  ipcRenderer.on(canal, h);
  return () => ipcRenderer.removeListener(canal, h);
};

contextBridge.exposeInMainWorld('arty', {
  inicial: () => ipcRenderer.invoke('inicial'),
  enviar: (texto) => ipcRenderer.invoke('enviar', texto),
  ouvido: (frase, direto) => ipcRenderer.invoke('ouvido', frase, direto),
  transcrever: (pcm) => ipcRenderer.invoke('transcrever', pcm),
  falar: (texto) => ipcRenderer.invoke('falar', texto),
  plano: (op, ref, valor) => ipcRenderer.invoke('plano', op, ref, valor),
  objetivo: (op, ref, valor) => ipcRenderer.invoke('objetivo', op, ref, valor),
  pref: (k, v) => ipcRenderer.invoke('pref', k, v),
  sistema: () => ipcRenderer.invoke('sistema'),
  clima: () => ipcRenderer.invoke('clima'),
  abrirConfig: () => ipcRenderer.invoke('abrir-config'),
  recarregarConfig: () => ipcRenderer.invoke('recarregar-config'),
  novaConversa: () => ipcRenderer.invoke('nova-conversa'),
  janela: (acao) => ipcRenderer.send('janela', acao),
  aoEstado: ouvir('estado'),
  aoClima: ouvir('clima'),
  aoPensando: ouvir('pensando'),
  aoLembrete: ouvir('lembrete'),
  aoOuvirAgora: ouvir('ouvir-agora'),
  aoJanela: ouvir('janela')
});
