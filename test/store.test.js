const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/main/store');

function novoDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'arty-')); }

test('planos e objetivos ficam salvos', () => {
  const dir = novoDir();
  const s = new Store(dir);
  s.addPlano('estudar matemática');
  s.addPlano('treino');
  s.marcarPlano('matematica');
  s.criarObjetivo('Jogo do Roblox');
  s.progressoObjetivo('jogo do roblox', 40);
  s.progressoObjetivo('Arkham City', 72); // cria se não existe

  const s2 = new Store(dir);
  assert.strictEqual(s2.planosHoje().length, 2);
  assert.strictEqual(s2.planosHoje()[0].feito, true);
  assert.deepStrictEqual(s2.objetivos().map((o) => [o.nome, o.progresso]), [['Jogo do Roblox', 40], ['Arkham City', 72]]);
  s2.concluirObjetivo('roblox');
  assert.strictEqual(s2.acharObjetivo('roblox').concluido, true);
  assert.throws(() => s2.marcarPlano('lavar a louça'));
});

test('lembretes vencem', () => {
  const s = new Store(novoDir());
  s.addLembrete(10, 'tirar a pizza');
  assert.strictEqual(s.lembretesVencidos().length, 0);
  assert.strictEqual(s.lembretesVencidos(Date.now() + 11 * 60000)[0].texto, 'tirar a pizza');
  assert.strictEqual(s.dados.lembretes.length, 0);
  assert.throws(() => s.addLembrete(-1, 'x'));
});
