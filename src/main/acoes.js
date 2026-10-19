// Executa as ações que o cérebro pediu e reconhece alguns comandos rápidos
// (mídia e volume) sem precisar esperar o cérebro.
const { normalizar } = require('./texto');

function acharPrograma(programas, alvo) {
  const q = normalizar(alvo);
  if (!q) return null;
  for (const [chave, p] of Object.entries(programas)) {
    const nomes = [chave, p.nome, ...(p.apelidos || [])].map(normalizar);
    if (nomes.includes(q)) return { chave, ...p };
  }
  for (const [chave, p] of Object.entries(programas)) {
    const nomes = [chave, p.nome, ...(p.apelidos || [])].map(normalizar).filter((n) => n.length > 3);
    if (nomes.some((n) => q.includes(n) || n.includes(q))) return { chave, ...p };
  }
  return null;
}

async function primeiroVideoYoutube(termo) {
  const resp = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(termo), {
    headers: { 'accept-language': 'pt-BR,pt;q=0.9', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' }
  });
  const html = await resp.text();
  const m = html.match(/"videoId":"([\w-]{11})"/);
  return m ? m[1] : null;
}

const NOMES_MIDIA = {
  tocar_pausar: 'tocar/pausar', proxima: 'próxima faixa', anterior: 'faixa anterior',
  volume_mais: 'volume +', volume_menos: 'volume -', mudo: 'mudo'
};

class Executor {
  constructor({ store, win, cfg, aoMudar }) {
    this.store = store;
    this.win = win;
    this.cfg = cfg;
    this.aoMudar = aoMudar || (() => {});
  }

  // Retorna o texto que vai pro LOG. Lança erro se não deu.
  async executar(a) {
    const s = this.store;
    switch (a.tipo) {
      case 'abrir_programa': {
        const p = acharPrograma(this.cfg.programas, a.alvo || a.nome || a.texto);
        if (!p) throw new Error(`"${a.alvo}" não tá na lista de programas`);
        await this.win.abrirPrograma(p.abrir);
        return `Abriu ${p.nome || p.chave}`;
      }
      case 'abrir_site': {
        let url = String(a.url || a.alvo || '').trim();
        if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:\/\//i.test(url)) throw new Error('só abro sites http/https');
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol)) throw new Error('só abro sites http/https');
        await this.win.abrirUrl(u.href);
        return `Abriu ${u.hostname}`;
      }
      case 'pesquisar': {
        const termo = String(a.termo || a.texto || '').trim();
        if (!termo) throw new Error('pesquisa vazia');
        const yt = /youtube/i.test(a.onde || '');
        const url = yt
          ? 'https://www.youtube.com/results?search_query=' + encodeURIComponent(termo)
          : 'https://www.google.com/search?q=' + encodeURIComponent(termo);
        await this.win.abrirUrl(url);
        return `Pesquisou "${termo}" no ${yt ? 'YouTube' : 'Google'}`;
      }
      case 'tocar_musica': {
        const termo = String(a.termo || a.texto || '').trim();
        if (!termo) throw new Error('qual música?');
        const ondeTocar = /spotify/i.test(a.onde || '') ? 'spotify' : /youtube/i.test(a.onde || '') ? 'youtube' : (this.cfg.musicaPadrao || 'youtube');
        if (ondeTocar === 'spotify') {
          await this.win.abrirUrl('spotify:search:' + encodeURIComponent(termo));
          return `Buscou "${termo}" no Spotify`;
        }
        let id = null;
        try { id = await primeiroVideoYoutube(termo); } catch { /* cai na busca */ }
        await this.win.abrirUrl(id
          ? `https://www.youtube.com/watch?v=${id}`
          : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(termo));
        return `Tocando "${termo}" no YouTube`;
      }
      case 'midia': {
        const vezes = /volume/.test(a.comando) ? 5 : 1;
        await this.win.midia(a.comando, vezes);
        return `Mídia: ${NOMES_MIDIA[a.comando] || a.comando}`;
      }
      case 'plano_adicionar': {
        const p = s.addPlano(a.texto || a.nome);
        this.aoMudar();
        return `Plano adicionado: ${p.texto}`;
      }
      case 'plano_concluir': {
        const p = s.marcarPlano(a.texto || a.nome, true);
        this.aoMudar();
        return `Plano feito: ${p.texto}`;
      }
      case 'plano_remover': {
        const p = s.removerPlano(a.texto || a.nome);
        this.aoMudar();
        return `Plano removido: ${p.texto}`;
      }
      case 'objetivo_criar': {
        const o = s.criarObjetivo(a.nome || a.texto, a.progresso || 0);
        this.aoMudar();
        return `Objetivo criado: ${o.nome}`;
      }
      case 'objetivo_progresso': {
        const o = s.progressoObjetivo(a.nome || a.texto, a.progresso);
        this.aoMudar();
        return `${o.nome}: ${o.progresso}%`;
      }
      case 'objetivo_concluir': {
        const o = s.concluirObjetivo(a.nome || a.texto);
        this.aoMudar();
        return `Objetivo concluído: ${o.nome}`;
      }
      case 'objetivo_remover': {
        const o = s.removerObjetivo(a.nome || a.texto);
        this.aoMudar();
        return `Objetivo removido: ${o.nome}`;
      }
      case 'lembrete': {
        const l = s.addLembrete(a.minutos, a.texto);
        this.aoMudar();
        const hora = new Date(l.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `Lembrete às ${hora}: ${l.texto}`;
      }
      case 'bloquear_pc':
        await this.win.bloquear();
        return 'Bloqueou o PC';
      default:
        throw new Error('ação desconhecida: ' + a.tipo);
    }
  }
}

// ---------------------------------------------------------------- comandos rápidos
const RAPIDOS = [
  { re: /^(aumenta|aumentar|sobe|subir|mais)( o| um pouco o)? (volume|som)( ai)?$|^volume (mais|pra cima)$/, comando: 'volume_mais', falas: ['Subindo o som.', 'Aumentei aí, mano.', 'Bora, mais alto.'] },
  { re: /^(abaixa|abaixar|diminui|diminuir|baixa|baixar|menos)( o| um pouco o)? (volume|som)( ai)?$|^volume (menos|pra baixo)$/, comando: 'volume_menos', falas: ['Abaixei.', 'Suave, baixando.', 'Pronto, mais baixinho.'] },
  { re: /^(pausa|pausar|para|parar|pause)( a| o)?( musica| video| som)?( ai)?$/, comando: 'tocar_pausar', falas: ['Pausado.', 'Parei aí.'] },
  { re: /^(despausa|continua|continuar|volta a tocar|play|solta o som|toca)( a musica| o video)?$/, comando: 'tocar_pausar', falas: ['Voltando.', 'Bora, solta o som.'] },
  { re: /^(proxima|passa|pula|avanca)( a| essa)?( musica| faixa)?( ai)?$|^proxima musica$/, comando: 'proxima', falas: ['Pulei.', 'Próxima, bora.', 'Essa tava ruim mesmo, kkk.'] },
  { re: /^(anterior|volta)( a| uma)?( musica| faixa)?( anterior)?$|^musica anterior$/, comando: 'anterior', falas: ['Voltei uma.', 'De novo essa? Suave.'] },
  { re: /^(muta|mutar|silencia|silenciar|desmuta|desmutar)( o)?( som| pc| computador)?$|^(tira|volta) o som$/, comando: 'mudo', falas: ['Feito.', 'Pronto.'] }
];

function comandoRapido(texto) {
  const t = normalizar(texto).replace(/^(por favor|pfv|pf) | (por favor|pfv|pf)$/g, '');
  for (const r of RAPIDOS) {
    if (r.re.test(t)) {
      return { fala: r.falas[Math.floor(Math.random() * r.falas.length)], acoes: [{ tipo: 'midia', comando: r.comando }] };
    }
  }
  return null;
}

module.exports = { Executor, comandoRapido, acharPrograma };
