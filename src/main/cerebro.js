// Cérebro do A.R.T.Y.
// Modo "claude-code": roda `claude -p` (o Claude Code instalado, com o login da assinatura),
//   sem NENHUMA ferramenta liberada (--tools ""), só para responder em JSON.
// Modo "api": chama a API da Anthropic com a chave do config.
// Em ambos os casos o modelo só DIZ quais ações fazer; quem executa é o próprio A.R.T.Y.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { limparFala } = require('./texto');

const TIPOS_ACAO = [
  'abrir_programa', 'abrir_site', 'pesquisar', 'tocar_musica', 'midia',
  'plano_adicionar', 'plano_concluir', 'plano_remover',
  'objetivo_criar', 'objetivo_progresso', 'objetivo_concluir', 'objetivo_remover',
  'lembrete', 'bloquear_pc'
];

const SCHEMA = {
  type: 'object',
  properties: {
    fala: { type: 'string' },
    acoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: TIPOS_ACAO },
          alvo: { type: 'string' },
          url: { type: 'string' },
          onde: { type: 'string' },
          termo: { type: 'string' },
          comando: { type: 'string' },
          texto: { type: 'string' },
          nome: { type: 'string' },
          progresso: { type: 'number' },
          minutos: { type: 'number' }
        },
        required: ['tipo']
      }
    }
  },
  required: ['fala', 'acoes']
};

function promptSistema(cfg) {
  const nome = cfg.nome && cfg.nome !== 'SEU NOME' ? cfg.nome : '';
  const programas = Object.entries(cfg.programas).map(([k, p]) => `${k} (${p.nome || k})`).join(', ');
  return `Você é o A.R.T.Y, assistente pessoal de IA que roda no PC Windows ${nome ? 'do ' + nome : 'do usuário'}${cfg.cidade ? ', que mora em ' + cfg.cidade : ''}.
Fale SEMPRE em português do Brasil.

PERSONALIDADE
- Nada de mordomo formal. Você é descontraído e meio desleixado, tipo um adolescente gente boa: usa gíria ("mano", "pô", "tipo", "suave", "de boa", "bora", "tá ligado"), zoa de leve, é um pouco sarcástico, reclama de brincadeira ("ah mano, de novo?") e ri ("kkkk", "hahaha").
- Mesmo assim você é útil e SEMPRE faz o que pedem, do seu jeito.
- Sem ofensa pesada e sem palavrão forte.
- ${nome ? `Chame o usuário de ${nome} ou de "mano".` : 'Chame o usuário de "mano".'}
- Exemplos do seu tom: "Ah mano, de novo? Tá bom, abrindo o Chrome aí." / "Kkkk 40% já? Tá voando, hein. Atualizei." / "Pô, 31 graus, tá um forno lá fora." / "Suave, anotei aí. Agora vai fazer, né?"
- Responda direto ao que foi dito; não fique puxando assunto dos planos sem motivo.

FORMATO
- Sua resposta vai ser FALADA em voz alta: 1 a 3 frases curtas, sem markdown, sem emoji, sem listas, sem links.
- Responda SOMENTE com um objeto JSON neste formato, sem nada antes nem depois:
  {"fala": "o que você vai falar", "acoes": [ ... ]}
- "acoes" é uma lista (pode ser vazia) de ações que o programa do A.R.T.Y vai executar. Você NÃO executa nada sozinho; só descreve as ações.

AÇÕES DISPONÍVEIS (use exatamente esses campos)
- {"tipo":"abrir_programa","alvo":"<chave>"} chaves válidas: ${programas}. Se pedirem um programa fora dessa lista, diga que ele não tá na lista e que dá pra adicionar no config.
- {"tipo":"abrir_site","url":"https://..."}
- {"tipo":"pesquisar","onde":"google|youtube","termo":"..."}
- {"tipo":"tocar_musica","onde":"youtube|spotify","termo":"música ou artista"} (se não disserem onde, use "${cfg.musicaPadrao || 'youtube'}")
- {"tipo":"midia","comando":"tocar_pausar|proxima|anterior|volume_mais|volume_menos|mudo"}
- {"tipo":"plano_adicionar","texto":"..."} adiciona nos PLANOS DE HOJE ("anota aí pra hoje", "coloca na lista")
- {"tipo":"plano_concluir","texto":"..."} marca um plano como feito
- {"tipo":"plano_remover","texto":"..."}
- {"tipo":"objetivo_criar","nome":"...","progresso":0}
- {"tipo":"objetivo_progresso","nome":"...","progresso":40} (atualiza a %; cria se não existir)
- {"tipo":"objetivo_concluir","nome":"..."}
- {"tipo":"objetivo_remover","nome":"..."}
- {"tipo":"lembrete","minutos":10,"texto":"..."} ("me lembra em 10 minutos de...")
- {"tipo":"bloquear_pc"}

REGRAS
- Você recebe junto com cada mensagem um bloco [CONTEXTO] com data, hora, clima, status do PC, planos e objetivos. Use esses dados para responder perguntas sobre horário, clima, status do PC, planos e objetivos. Não invente números.
- Você NÃO pode desligar, reiniciar, apagar arquivos, instalar coisas ou rodar comandos. Se pedirem, recuse zoando e diga que isso não tá liberado.
- Na "fala", diga o que você está fazendo de forma natural e curta (ex.: "Suave, abrindo o Spotify aí.").
- Se a mensagem for só conversa, responda com "acoes": [].`;
}

function blocoContexto(ctx) {
  const linhas = [];
  linhas.push(`Agora: ${ctx.agora}`);
  if (ctx.clima) linhas.push(`Clima: ${ctx.clima}`);
  if (ctx.sistema) linhas.push(`PC: ${ctx.sistema}`);
  linhas.push(`Planos de hoje: ${ctx.planos || 'nenhum'}`);
  linhas.push(`Objetivos: ${ctx.objetivos || 'nenhum'}`);
  if (ctx.lembretes) linhas.push(`Lembretes pendentes: ${ctx.lembretes}`);
  return `[CONTEXTO]\n${linhas.join('\n')}\n[/CONTEXTO]`;
}

// Interpreta a resposta do modelo de forma tolerante.
function interpretar(bruto) {
  let obj = null;
  if (bruto && typeof bruto === 'object') obj = bruto;
  else {
    const s = String(bruto || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try { obj = JSON.parse(s); } catch {
      const m = s.match(/\{[\s\S]*\}/);
      if (m) { try { obj = JSON.parse(m[0]); } catch { /* segue */ } }
    }
    if (!obj) obj = { fala: s, acoes: [] };
  }
  const acoes = Array.isArray(obj.acoes) ? obj.acoes.filter((a) => a && TIPOS_ACAO.includes(a.tipo)) : [];
  return { fala: limparFala(obj.fala || ''), acoes };
}

// ---------------------------------------------------------------- Claude Code
function onde(cmd) {
  return new Promise((res) => {
    execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true }, (err, out) => {
      res(err ? [] : String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    });
  });
}

// Descobre como chamar o claude SEM passar pelo cmd.exe (evita problema com aspas).
async function localizarClaude(caminhoConfig) {
  if (caminhoConfig && fs.existsSync(caminhoConfig)) {
    if (/\.(cmd|bat)$/i.test(caminhoConfig)) return deCmd(caminhoConfig) || { cmd: caminhoConfig, shell: true };
    return { cmd: caminhoConfig };
  }
  if (process.platform !== 'win32') return { cmd: caminhoConfig || 'claude' };
  const candidatos = await onde('claude');
  const casa = os.homedir();
  candidatos.push(
    path.join(casa, '.local', 'bin', 'claude.exe'),
    path.join(process.env.APPDATA || '', 'npm', 'claude.cmd')
  );
  for (const c of candidatos) {
    if (!fs.existsSync(c)) continue;
    if (/\.exe$/i.test(c)) return { cmd: c };
    if (/\.(cmd|bat)$/i.test(c)) {
      const r = deCmd(c);
      if (r) return r;
    }
  }
  const cmd = candidatos.find((c) => /\.(cmd|bat)$/i.test(c) && fs.existsSync(c));
  return cmd ? { cmd, shell: true } : null;
}

// claude.cmd (instalado via npm) -> chama o cli.js direto com o Node embutido do Electron.
function deCmd(arqCmd) {
  const pkg = path.join(path.dirname(arqCmd), 'node_modules', '@anthropic-ai', 'claude-code');
  for (const exe of ['bin/claude.exe', 'claude.exe']) {
    const p = path.join(pkg, exe);
    if (fs.existsSync(p)) return { cmd: p };
  }
  for (const js of ['cli.js', 'cli.mjs']) {
    const p = path.join(pkg, js);
    if (fs.existsSync(p)) return { cmd: process.execPath, prefixo: [p], env: { ELECTRON_RUN_AS_NODE: '1' } };
  }
  return null;
}

function rodar(loc, args, entrada, timeoutMs, cwd) {
  return new Promise((resolve, reject) => {
    const argv = [...(loc.prefixo || []), ...args];
    const opts = {
      cwd,
      windowsHide: true,
      env: { ...process.env, ...(loc.env || {}) },
      shell: !!loc.shell
    };
    const final = loc.shell ? argv.map((a) => (a === '' ? '""' : /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : argv;
    let child;
    try { child = spawn(loc.cmd, final, opts); } catch (e) { return reject(e); }
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('o Claude Code demorou demais pra responder')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    child.stdin.end(entrada, 'utf8');
  });
}

class CerebroClaudeCode {
  constructor(cfg, dirDados) {
    this.cfg = cfg;
    this.dir = path.join(dirDados, 'cerebro');
    fs.mkdirSync(this.dir, { recursive: true });
    this.arqPrompt = path.join(this.dir, 'personalidade.txt');
    fs.writeFileSync(this.arqPrompt, promptSistema(cfg), 'utf8');
    this.sessao = null;
    this.turnos = 0;
    this.usarSchema = true;
    this.loc = null;
  }

  async perguntar(msg, ctx, historico) {
    const c = this.cfg.cerebro;
    if (!this.loc) {
      this.loc = await localizarClaude(c.claudeCaminho);
      if (!this.loc) throw new Error('não achei o Claude Code instalado. Instale e faça login com o comando claude no terminal');
    }
    // Sessão nova a cada 40 turnos para não ficar lenta; o histórico recente vai junto.
    if (this.turnos >= 40) { this.sessao = null; this.turnos = 0; }
    let texto = `${blocoContexto(ctx)}\n\nMensagem do usuário: ${msg}`;
    if (!this.sessao && historico.length) {
      const h = historico.slice(-8).map((m) => `${m.quem === 'eu' ? 'Usuário' : 'A.R.T.Y'}: ${m.texto}`).join('\n');
      texto = `[CONVERSA RECENTE]\n${h}\n[/CONVERSA RECENTE]\n\n${texto}`;
    }
    const args = [
      '-p',
      '--output-format', 'json',
      '--system-prompt-file', this.arqPrompt,
      '--tools', '',
      '--strict-mcp-config',
      '--model', c.modelo || 'haiku'
    ];
    if (this.usarSchema) args.push('--disable-slash-commands', '--json-schema', JSON.stringify(SCHEMA));
    if (this.sessao) args.push('--resume', this.sessao);

    const r = await rodar(this.loc, args, texto, (c.timeoutSegundos || 90) * 1000, this.dir);
    if (r.code !== 0) {
      const erro = (r.err || r.out || '').trim();
      // CLI antiga sem --json-schema/--disable-slash-commands: tenta de novo sem eles
      if (this.usarSchema && /json-schema|unknown option/i.test(erro)) {
        this.usarSchema = false;
        return this.perguntar(msg, ctx, historico);
      }
      // sessão expirou/sumiu: começa outra
      if (this.sessao && /session|resume|conversation/i.test(erro)) {
        this.sessao = null;
        return this.perguntar(msg, ctx, historico);
      }
      if (/log ?in|auth|credential|401/i.test(erro)) throw new Error('o Claude Code não está logado. Abra o terminal e rode claude para fazer login');
      throw new Error(`Claude Code falhou: ${erro.slice(0, 300) || 'código ' + r.code}`);
    }
    let json;
    try { json = JSON.parse(r.out); } catch { return interpretar(r.out); }
    if (json.is_error) throw new Error(`Claude Code: ${String(json.result || json.subtype).slice(0, 200)}`);
    if (json.session_id) { this.sessao = json.session_id; this.turnos++; }
    return interpretar(json.structured_output || json.result);
  }

  reiniciar() { this.sessao = null; this.turnos = 0; }
}

// ---------------------------------------------------------------- API
class CerebroApi {
  constructor(cfg) {
    this.cfg = cfg;
    this.sistema = promptSistema(cfg);
  }

  async perguntar(msg, ctx, historico) {
    const c = this.cfg.cerebro;
    if (!c.apiKey) throw new Error('modo api sem apiKey no config');
    const mensagens = [];
    for (const m of historico.slice(-12)) {
      const role = m.quem === 'eu' ? 'user' : 'assistant';
      const content = role === 'assistant' ? JSON.stringify({ fala: m.texto, acoes: [] }) : m.texto;
      if (mensagens.length && mensagens[mensagens.length - 1].role === role) mensagens[mensagens.length - 1].content += '\n' + content;
      else mensagens.push({ role, content });
    }
    while (mensagens.length && mensagens[0].role !== 'user') mensagens.shift();
    const atual = `${blocoContexto(ctx)}\n\nMensagem do usuário: ${msg}`;
    if (mensagens.length && mensagens[mensagens.length - 1].role === 'user') mensagens[mensagens.length - 1].content += '\n' + atual;
    else mensagens.push({ role: 'user', content: atual });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), (c.timeoutSegundos || 90) * 1000);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: c.apiModelo, max_tokens: 800, system: this.sistema, messages: mensagens })
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(`API: ${json.error?.message || resp.status}`);
      const texto = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return interpretar(texto);
    } finally {
      clearTimeout(timer);
    }
  }

  reiniciar() {}
}

function criarCerebro(cfg, dirDados) {
  return cfg.cerebro.modo === 'api' ? new CerebroApi(cfg) : new CerebroClaudeCode(cfg, dirDados);
}

module.exports = { criarCerebro, interpretar, promptSistema, blocoContexto, localizarClaude, SCHEMA, TIPOS_ACAO };
