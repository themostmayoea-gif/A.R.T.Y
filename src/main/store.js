// Dados persistentes (planos, objetivos, log, lembretes e preferências).
const fs = require('fs');
const path = require('path');
const { normalizar, melhorItem } = require('./texto');

function hojeISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

class Store {
  constructor(dir) {
    this.arquivo = path.join(dir, 'dados.json');
    this.dados = { planos: {}, objetivos: [], log: [], lembretes: [], prefs: { mudo: false, escuta: true } };
    if (fs.existsSync(this.arquivo)) {
      try {
        Object.assign(this.dados, JSON.parse(fs.readFileSync(this.arquivo, 'utf8')));
      } catch {
        // arquivo corrompido: guarda uma cópia e começa do zero
        fs.copyFileSync(this.arquivo, this.arquivo + '.corrompido');
      }
    }
  }

  salvar() {
    const tmp = this.arquivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.dados, null, 2), 'utf8');
    fs.renameSync(tmp, this.arquivo);
  }

  // ---------- planos de hoje ----------
  planosHoje() {
    return this.dados.planos[hojeISO()] || [];
  }

  addPlano(texto) {
    texto = String(texto || '').trim();
    if (!texto) throw new Error('plano vazio');
    const dia = hojeISO();
    const lista = this.dados.planos[dia] || (this.dados.planos[dia] = []);
    const item = { id: novoId(), texto, feito: false };
    lista.push(item);
    this.salvar();
    return item;
  }

  acharPlano(ref) {
    const lista = this.planosHoje();
    return lista.find((p) => p.id === ref) || melhorItem(lista, ref, (p) => p.texto);
  }

  marcarPlano(ref, feito = true) {
    const p = this.acharPlano(ref);
    if (!p) throw new Error(`não achei o plano "${ref}"`);
    p.feito = feito;
    this.salvar();
    return p;
  }

  removerPlano(ref) {
    const p = this.acharPlano(ref);
    if (!p) throw new Error(`não achei o plano "${ref}"`);
    const dia = hojeISO();
    this.dados.planos[dia] = this.planosHoje().filter((x) => x !== p);
    this.salvar();
    return p;
  }

  // ---------- objetivos ----------
  objetivos() {
    return this.dados.objetivos;
  }

  acharObjetivo(ref) {
    return this.dados.objetivos.find((o) => o.id === ref) ||
      melhorItem(this.dados.objetivos.filter((o) => !o.concluido), ref, (o) => o.nome) ||
      melhorItem(this.dados.objetivos, ref, (o) => o.nome);
  }

  criarObjetivo(nome, progresso = 0) {
    nome = String(nome || '').trim();
    if (!nome) throw new Error('objetivo sem nome');
    const o = { id: novoId(), nome, progresso: limitar(progresso), concluido: false, criado: Date.now() };
    this.dados.objetivos.push(o);
    this.salvar();
    return o;
  }

  // atualiza a % ou cria o objetivo se ainda não existir
  progressoObjetivo(ref, progresso) {
    let o = this.acharObjetivo(ref);
    if (!o) return this.criarObjetivo(ref, progresso);
    o.progresso = limitar(progresso);
    o.concluido = o.progresso >= 100;
    this.salvar();
    return o;
  }

  concluirObjetivo(ref) {
    const o = this.acharObjetivo(ref);
    if (!o) throw new Error(`não achei o objetivo "${ref}"`);
    o.progresso = 100;
    o.concluido = true;
    this.salvar();
    return o;
  }

  removerObjetivo(ref) {
    const o = this.acharObjetivo(ref);
    if (!o) throw new Error(`não achei o objetivo "${ref}"`);
    this.dados.objetivos = this.dados.objetivos.filter((x) => x !== o);
    this.salvar();
    return o;
  }

  // ---------- log ----------
  registrar(texto) {
    this.dados.log.unshift({ t: Date.now(), texto });
    this.dados.log.length = Math.min(this.dados.log.length, 60);
    this.salvar();
  }

  // ---------- lembretes ----------
  addLembrete(minutos, texto) {
    const m = Number(minutos);
    if (!(m > 0) || m > 60 * 24 * 7) throw new Error('tempo do lembrete inválido');
    const l = { id: novoId(), quando: Date.now() + m * 60000, texto: String(texto || 'lembrete').trim() };
    this.dados.lembretes.push(l);
    this.salvar();
    return l;
  }

  lembretesVencidos(agora = Date.now()) {
    const vencidos = this.dados.lembretes.filter((l) => l.quando <= agora);
    if (vencidos.length) {
      this.dados.lembretes = this.dados.lembretes.filter((l) => l.quando > agora);
      this.salvar();
    }
    return vencidos;
  }

  // ---------- preferências ----------
  pref(k, v) {
    if (v === undefined) return this.dados.prefs[k];
    this.dados.prefs[k] = v;
    this.salvar();
    return v;
  }

  // limpa planos com mais de 30 dias
  faxina() {
    const limite = hojeISO(new Date(Date.now() - 30 * 86400000));
    for (const dia of Object.keys(this.dados.planos)) {
      if (dia < limite) delete this.dados.planos[dia];
    }
    this.salvar();
  }

  estado() {
    return {
      planos: this.planosHoje(),
      objetivos: this.dados.objetivos,
      log: this.dados.log.slice(0, 30),
      lembretes: this.dados.lembretes,
      prefs: this.dados.prefs
    };
  }
}

function limitar(n) {
  n = Math.round(Number(n) || 0);
  return Math.max(0, Math.min(100, n));
}

module.exports = { Store, hojeISO, normalizar };
