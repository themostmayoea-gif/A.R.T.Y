// Dados reais do PC: CPU, RAM, disco, bateria, rede e tempo ligado.
const os = require('os');
const si = require('systeminformation');

let ultimoCpu = os.cpus();

function cpuPercent() {
  const agora = os.cpus();
  let ocioso = 0;
  let total = 0;
  agora.forEach((c, i) => {
    const a = ultimoCpu[i] ? ultimoCpu[i].times : { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
    const t = c.times;
    const dt = (t.user - a.user) + (t.nice - a.nice) + (t.sys - a.sys) + (t.idle - a.idle) + (t.irq - a.irq);
    total += dt;
    ocioso += t.idle - a.idle;
  });
  ultimoCpu = agora;
  return total > 0 ? Math.round(100 * (1 - ocioso / total)) : 0;
}

let lento = { disco: null, bateria: null, t: 0 };

async function atualizarLento() {
  try {
    const discos = await si.fsSize();
    const principal = discos.find((d) => /^c:?$/i.test(d.mount) || d.mount === '/') || discos[0];
    lento.disco = principal ? { usado: Math.round(principal.use), livreGB: Math.round((principal.size - principal.used) / 1e9), totalGB: Math.round(principal.size / 1e9), nome: principal.mount } : null;
  } catch { lento.disco = null; }
  try {
    const b = await si.battery();
    lento.bateria = b && b.hasBattery ? { pct: Math.round(b.percent), carregando: b.isCharging || b.acConnected } : null;
  } catch { lento.bateria = null; }
  lento.t = Date.now();
}

async function rede() {
  try {
    const st = await si.networkStats();
    const r = st.reduce((acc, x) => ({ down: acc.down + Math.max(0, x.rx_sec || 0), up: acc.up + Math.max(0, x.tx_sec || 0) }), { down: 0, up: 0 });
    return r;
  } catch {
    return { down: 0, up: 0 };
  }
}

async function ler() {
  if (Date.now() - lento.t > 30000) await atualizarLento();
  const total = os.totalmem();
  const livre = os.freemem();
  return {
    cpu: cpuPercent(),
    ram: Math.round(100 * (1 - livre / total)),
    ramUsadaGB: +((total - livre) / 1e9).toFixed(1),
    ramTotalGB: +(total / 1e9).toFixed(1),
    disco: lento.disco,
    bateria: lento.bateria,
    rede: await rede(),
    uptime: os.uptime(),
    nomePc: os.hostname()
  };
}

function formatarUptime(seg) {
  const d = Math.floor(seg / 86400);
  const h = Math.floor((seg % 86400) / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return (d ? `${d}d ` : '') + `${h}h ${String(m).padStart(2, '0')}min`;
}

function resumoSistema(s) {
  if (!s) return '';
  return `CPU ${s.cpu}%, RAM ${s.ram}% (${s.ramUsadaGB} de ${s.ramTotalGB} GB)` +
    (s.disco ? `, disco ${s.disco.nome} ${s.disco.usado}% usado (${s.disco.livreGB} GB livres)` : '') +
    (s.bateria ? `, bateria ${s.bateria.pct}%${s.bateria.carregando ? ' carregando' : ''}` : ', sem bateria (na tomada)') +
    `, ligado há ${formatarUptime(s.uptime)}`;
}

module.exports = { ler, resumoSistema, formatarUptime };
