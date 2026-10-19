// Operações do Windows que o A.R.T.Y pode fazer. Nada de comando arbitrário:
// só abre o que está na lista do config, URLs http(s) e teclas de mídia.
const { spawn } = require('child_process');
const path = require('path');

const TECLAS = {
  tocar_pausar: 179,
  proxima: 176,
  anterior: 177,
  mudo: 173,
  volume_menos: 174,
  volume_mais: 175
};

function powershell(script) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('powershell saiu com código ' + code))));
  });
}

function criar(shell) {
  return {
    async abrirUrl(url) {
      await shell.openExternal(url);
    },

    // "abrir" vem do config: URI (spotify:, steam://...), caminho de .exe ou nome registrado (chrome, calc...)
    async abrirPrograma(abrir) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(abrir) && !/^[a-z]:\\/i.test(abrir)) {
        await shell.openExternal(abrir);
        return;
      }
      if (path.isAbsolute(abrir)) {
        const erro = await shell.openPath(abrir);
        if (erro) throw new Error(erro);
        return;
      }
      if (!/^[\w .-]+$/.test(abrir)) throw new Error('nome de programa inválido no config');
      if (process.platform !== 'win32') throw new Error('só funciona no Windows');
      await new Promise((resolve, reject) => {
        const p = spawn('cmd.exe', ['/d', '/c', 'start', '""', abrir], { windowsHide: true, detached: true, stdio: 'ignore' });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`o Windows não achou "${abrir}"`))));
        p.unref();
      });
    },

    async midia(comando, vezes = 1) {
      const tecla = TECLAS[comando];
      if (!tecla) throw new Error('comando de mídia desconhecido');
      if (process.platform !== 'win32') throw new Error('só funciona no Windows');
      await powershell(`$w=New-Object -ComObject WScript.Shell; 1..${vezes}|%{$w.SendKeys([char]${tecla})}`);
    },

    async bloquear() {
      if (process.platform !== 'win32') throw new Error('só funciona no Windows');
      spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    }
  };
}

module.exports = { criar, TECLAS };
