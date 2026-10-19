// Clima via Open-Meteo (grátis e sem chave).
const CONDICOES = {
  0: ['Céu limpo', 'sol'], 1: ['Quase limpo', 'sol'], 2: ['Parcialmente nublado', 'parcial'], 3: ['Nublado', 'nuvem'],
  45: ['Neblina', 'neblina'], 48: ['Neblina', 'neblina'],
  51: ['Garoa fraca', 'chuva'], 53: ['Garoa', 'chuva'], 55: ['Garoa forte', 'chuva'], 56: ['Garoa gelada', 'chuva'], 57: ['Garoa gelada', 'chuva'],
  61: ['Chuva fraca', 'chuva'], 63: ['Chuva', 'chuva'], 65: ['Chuva forte', 'chuva'], 66: ['Chuva gelada', 'chuva'], 67: ['Chuva gelada', 'chuva'],
  71: ['Neve fraca', 'neve'], 73: ['Neve', 'neve'], 75: ['Neve forte', 'neve'], 77: ['Neve', 'neve'],
  80: ['Pancadas de chuva', 'chuva'], 81: ['Pancadas de chuva', 'chuva'], 82: ['Temporal', 'tempestade'],
  85: ['Neve', 'neve'], 86: ['Neve', 'neve'],
  95: ['Trovoadas', 'tempestade'], 96: ['Trovoadas com granizo', 'tempestade'], 99: ['Trovoadas com granizo', 'tempestade']
};

function condicao(codigo) {
  return CONDICOES[codigo] || ['—', 'nuvem'];
}

let cacheLocal = null;

async function obterJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

async function localizar(cidade) {
  if (cacheLocal && cacheLocal.cidade === cidade) return cacheLocal;
  const nome = cidade.split(',')[0].trim();
  const j = await obterJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nome)}&count=5&language=pt&format=json`);
  if (!j.results || !j.results.length) throw new Error(`cidade "${cidade}" não encontrada`);
  const r = j.results.find((x) => x.country_code === 'BR') || j.results[0];
  cacheLocal = { cidade, nome: r.name, lat: r.latitude, lon: r.longitude, uf: r.admin1 || '' };
  return cacheLocal;
}

async function buscarClima(cidade) {
  const loc = await localizar(cidade);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=6';
  const j = await obterJson(url);
  const [texto, icone] = condicao(j.current.weather_code);
  const dias = j.daily.time.map((d, i) => {
    const [t, ic] = condicao(j.daily.weather_code[i]);
    return {
      data: d,
      max: Math.round(j.daily.temperature_2m_max[i]),
      min: Math.round(j.daily.temperature_2m_min[i]),
      chuva: j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[i] : null,
      texto: t,
      icone: ic
    };
  });
  return {
    cidade: loc.nome,
    uf: loc.uf,
    temp: Math.round(j.current.temperature_2m),
    sensacao: Math.round(j.current.apparent_temperature),
    umidade: j.current.relative_humidity_2m,
    vento: Math.round(j.current.wind_speed_10m),
    dia: !!j.current.is_day,
    texto,
    icone: icone === 'sol' && !j.current.is_day ? 'lua' : icone,
    max: dias[0].max,
    min: dias[0].min,
    dias,
    atualizado: Date.now()
  };
}

function resumoClima(c) {
  if (!c) return '';
  const amanha = c.dias[1];
  return `${c.cidade}: ${c.temp}°C (sensação ${c.sensacao}°C), ${c.texto.toLowerCase()}, máx ${c.max}° mín ${c.min}°, umidade ${c.umidade}%` +
    (c.dias[0].chuva != null ? `, chance de chuva hoje ${c.dias[0].chuva}%` : '') +
    (amanha ? `. Amanhã: ${amanha.texto.toLowerCase()}, ${amanha.min}° a ${amanha.max}°` : '');
}

module.exports = { buscarClima, resumoClima, condicao };
