// metricas-stories.mjs — guarda as métricas de cada Story ANTES de ele expirar.
//
// POR QUE EXISTE (23/09/2026): a API do Instagram só entrega métricas de Story enquanto ele está
// no ar (24h). Todo Story publicado até hoje perdeu os números pra sempre. Este robô roda a cada
// 6h, lê os Stories ativos e ACUMULA o último retrato de cada um em publicador/stories-historico.json.
// SÓ LEITURA: não publica nem mexe na fila.
//
//   node publicador/metricas-stories.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'stories-historico.json');
const API = 'https://graph.facebook.com/v21.0';
const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
if (!IG_USER_ID || !IG_TOKEN) { console.error('faltam IG_USER_ID / IG_TOKEN'); process.exit(1); }

const get = async (caminho, params = {}) => {
  const u = new URL(API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', IG_TOKEN);
  return (await fetch(u)).json();
};

// do mais completo pro mais simples — a Meta muda nomes de métrica entre versões
const CONJUNTOS = [
  'views,reach,replies,shares,follows,profile_visits,total_interactions,navigation',
  'views,reach,replies,shares,total_interactions,navigation',
  'reach,replies,navigation',
  'reach,replies',
];

const base = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')) : { stories: {} };
const r = await get(`/${IG_USER_ID}/stories`, { fields: 'id,media_type,media_url,permalink,timestamp,caption' });
if (r.error) { console.error('stories: ' + JSON.stringify(r.error).slice(0, 300)); process.exit(1); }
const ativos = r.data || [];
let ok = 0;
for (const s of ativos) {
  let dados = null, usado = null, ultimoErro = '';
  for (const metric of CONJUNTOS) {
    const params = { metric };
    if (metric.includes('navigation')) params.breakdown = 'story_navigation_action_type';
    const ins = await get(`/${s.id}/insights`, params);
    if (ins.data) { dados = ins.data; usado = metric; break; }
    ultimoErro = ins.error?.message || '';
    if (!/metric|invalid|does not support|breakdown/i.test(ultimoErro)) break;
  }
  const metricas = {};
  for (const m of dados || []) {
    if (m.name === 'navigation') {
      for (const b of m.total_value?.breakdowns?.[0]?.results || []) metricas[`nav_${b.dimension_values?.[0]}`] = b.value;
      metricas.navigation = m.total_value?.value ?? m.values?.[0]?.value ?? null;
    } else metricas[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
  }
  base.stories[s.id] = { id: s.id, quando: s.timestamp, tipo: s.media_type, legenda: s.caption || '',
    ultimo_retrato: new Date().toISOString(), _metricas: usado, ...(dados ? metricas : { _erro: ultimoErro.slice(0, 160) }) };
  ok++;
}
base.gerado_em = new Date().toISOString();
fs.writeFileSync(SAIDA, JSON.stringify(base, null, 1));
console.log(`${ativos.length} Stories ativos · ${ok} retratados · ${Object.keys(base.stories).length} no histórico`);
