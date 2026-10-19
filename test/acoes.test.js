const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Executor, comandoRapido, acharPrograma } = require('../src/main/acoes');
const { interpretar } = require('../src/main/cerebro');
const { Store } = require('../src/main/store');
const { PADRAO } = require('../src/main/config');

function falso() {
  const feitos = [];
  return {
    feitos,
    abrirUrl: async (u) => feitos.push(['url', u]),
    abrirPrograma: async (p) => feitos.push(['prog', p]),
    midia: async (c, n) => feitos.push(['midia', c, n]),
    bloquear: async () => feitos.push(['bloquear'])
  };
}

test('comandos rápidos de mídia', () => {
  assert.strictEqual(comandoRapido('aumenta o volume').acoes[0].comando, 'volume_mais');
  assert.strictEqual(comandoRapido('Abaixa o som').acoes[0].comando, 'volume_menos');
  assert.strictEqual(comandoRapido('próxima música').acoes[0].comando, 'proxima');
  assert.strictEqual(comandoRapido('pausa a música').acoes[0].comando, 'tocar_pausar');
  assert.strictEqual(comandoRapido('abre o spotify'), null);
  assert.strictEqual(comandoRapido('aumenta o volume da minha vida amorosa'), null);
});

test('acha programas pela lista do config', () => {
  assert.strictEqual(acharPrograma(PADRAO.programas, 'Roblox Studio').chave, 'roblox studio');
  assert.strictEqual(acharPrograma(PADRAO.programas, 'vs code').chave, 'vscode');
  assert.strictEqual(acharPrograma(PADRAO.programas, 'calculadora').abrir, 'calc');
  assert.strictEqual(acharPrograma(PADRAO.programas, 'format c:'), null);
});

test('executor executa e recusa', async () => {
  const win = falso();
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'arty-')));
  const ex = new Executor({ store, win, cfg: PADRAO });
  await ex.executar({ tipo: 'abrir_programa', alvo: 'spotify' });
  await ex.executar({ tipo: 'pesquisar', onde: 'google', termo: 'clima & tempo' });
  await ex.executar({ tipo: 'tocar_musica', onde: 'spotify', termo: 'Matuê' });
  await ex.executar({ tipo: 'midia', comando: 'volume_mais' });
  await ex.executar({ tipo: 'plano_adicionar', texto: 'estudar matemática' });
  await ex.executar({ tipo: 'objetivo_progresso', nome: 'meu jogo do Roblox', progresso: 40 });
  await ex.executar({ tipo: 'abrir_site', url: 'youtube.com' });
  await assert.rejects(ex.executar({ tipo: 'abrir_programa', alvo: 'cmd' }));
  await assert.rejects(ex.executar({ tipo: 'abrir_site', url: 'file:///C:/Windows' }));
  await assert.rejects(ex.executar({ tipo: 'desligar_pc' }));
  assert.deepStrictEqual(win.feitos, [
    ['prog', 'spotify:'],
    ['url', 'https://www.google.com/search?q=clima%20%26%20tempo'],
    ['url', 'spotify:search:Matu%C3%AA'],
    ['midia', 'volume_mais', 5],
    ['url', 'https://youtube.com/']
  ]);
  assert.strictEqual(store.planosHoje()[0].texto, 'estudar matemática');
  assert.strictEqual(store.objetivos()[0].progresso, 40);
});

test('interpreta respostas do cérebro', () => {
  assert.deepStrictEqual(interpretar('{"fala":"Suave 😎","acoes":[{"tipo":"bloquear_pc"}]}'), { fala: 'Suave', acoes: [{ tipo: 'bloquear_pc' }] });
  assert.deepStrictEqual(interpretar('```json\n{"fala":"oi","acoes":[]}\n```'), { fala: 'oi', acoes: [] });
  assert.deepStrictEqual(interpretar('blá {"fala":"x","acoes":[{"tipo":"rm_rf"}]} blá'), { fala: 'x', acoes: [] });
  assert.deepStrictEqual(interpretar('só texto'), { fala: 'só texto', acoes: [] });
  assert.deepStrictEqual(interpretar({ fala: 'obj', acoes: [] }), { fala: 'obj', acoes: [] });
});
