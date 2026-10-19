const test = require('node:test');
const assert = require('node:assert');
const { detectarAtivacao, comandoOriginal, limparFala, melhorItem, normalizar } = require('../src/main/texto');
const { PADRAO } = require('../src/main/config');

const P = PADRAO.escuta.palavrasAtivacao;

test('palavra de ativação e variações', () => {
  assert.deepStrictEqual(detectarAtivacao('Arty', P), { comando: '' });
  assert.deepStrictEqual(detectarAtivacao('arte', P), { comando: '' });
  assert.deepStrictEqual(detectarAtivacao('Ô Artie, abre o Spotify', P), { comando: 'abre o spotify' });
  assert.deepStrictEqual(detectarAtivacao('e aí arti que horas são', P), { comando: 'que horas sao' });
  assert.strictEqual(detectarAtivacao('eu gosto de arte moderna', P), null);
  assert.strictEqual(detectarAtivacao('abre o spotify', P), null);
  assert.strictEqual(detectarAtivacao('', P), null);
});

test('comando mantém o texto original', () => {
  assert.strictEqual(comandoOriginal('Arty, anota aí pra hoje: estudar matemática', P), 'anota aí pra hoje: estudar matemática');
  assert.strictEqual(comandoOriginal('Oi Arty abre o Roblox-Studio', P), 'abre o Roblox-Studio');
  assert.strictEqual(comandoOriginal('Arty!', P), '');
  assert.strictEqual(comandoOriginal('nada a ver', P), null);
});

test('limpa emoji e markdown da fala', () => {
  assert.strictEqual(limparFala('**Suave** mano 😄 bora!'), 'Suave mano bora!');
});

test('acha item parecido', () => {
  const lista = [{ t: 'Estudar matemática' }, { t: 'Treino às 18h' }, { t: 'Jogo do Roblox' }];
  assert.strictEqual(melhorItem(lista, 'matematica', (x) => x.t).t, 'Estudar matemática');
  assert.strictEqual(melhorItem(lista, 'meu jogo do roblox', (x) => x.t).t, 'Jogo do Roblox');
  assert.strictEqual(melhorItem(lista, 'lavar louça', (x) => x.t), null);
  assert.strictEqual(normalizar('Ação!'), 'acao');
});
