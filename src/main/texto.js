// Utilitários de texto (sem dependências do Electron, para dar pra testar).

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Acha o item cujo texto mais se parece com a referência.
function melhorItem(lista, ref, campo) {
  const q = normalizar(ref);
  if (!q) return null;
  let melhor = null;
  let nota = 0;
  const palavrasQ = q.split(' ').filter((w) => w.length > 2);
  for (const item of lista) {
    const t = normalizar(campo(item));
    let n = 0;
    if (t === q) n = 100;
    else if (t.includes(q) || q.includes(t)) n = 60;
    else if (palavrasQ.length) {
      const palavrasT = new Set(t.split(' '));
      const comuns = palavrasQ.filter((w) => palavrasT.has(w) || [...palavrasT].some((x) => x.length > 3 && (x.startsWith(w) || w.startsWith(x))));
      n = (comuns.length / palavrasQ.length) * 50;
    }
    if (n > nota) { nota = n; melhor = item; }
  }
  return nota >= 25 ? melhor : null;
}

// Tira emoji, markdown e espaços sobrando do que vai ser falado.
function limparFala(s) {
  return String(s || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[*_`#>~]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Detecta a palavra de ativação no começo da frase.
// Retorna null se não chamou o Arty, ou { comando } (comando pode ser "").
const PREFIXOS = ['o', 'oi', 'oh', 'ei', 'hey', 'e ai', 'fala', 'ola', 'ok', 'opa', 'eai', 'salve', 'bom dia', 'boa tarde', 'boa noite'];

function detectarAtivacao(frase, palavras) {
  let t = normalizar(frase);
  if (!t) return null;
  const ativ = palavras.map(normalizar).sort((a, b) => b.length - a.length);
  for (let i = 0; i < 2; i++) {
    for (const a of ativ) {
      if (t === a) return { comando: '' };
      if (t.startsWith(a + ' ')) return { comando: t.slice(a.length + 1).trim() };
    }
    const pre = PREFIXOS.slice().sort((a, b) => b.length - a.length).find((p) => t.startsWith(p + ' '));
    if (!pre) break;
    t = t.slice(pre.length + 1);
  }
  return null;
}

// Mantém a capitalização original do comando, cortando só o começo ("Arty, ...").
function comandoOriginal(frase, palavras) {
  const det = detectarAtivacao(frase, palavras);
  if (!det) return null;
  if (!det.comando) return '';
  const orig = String(frase).trim().split(/\s+/);
  const total = orig.reduce((n, w) => n + (normalizar(w) ? normalizar(w).split(' ').length : 0), 0);
  let sobrar = total - det.comando.split(' ').length;
  let i = 0;
  while (i < orig.length && sobrar > 0) {
    const n = normalizar(orig[i]);
    sobrar -= n ? n.split(' ').length : 0;
    i++;
  }
  return orig.slice(i).join(' ').replace(/^[,.!?\s]+/, '');
}

module.exports = { normalizar, melhorItem, limparFala, detectarAtivacao, comandoOriginal };
