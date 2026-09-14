// metricas-facebook.mjs — números da Página do Facebook (Reels) em metricas-facebook.json.
//
// POR QUE EXISTE (13/09/2026): desde 13/09 todo Reel do Insta sai também na Página
// (publicar.mjs). Sem medir, "vale a pena postar lá?" vira opinião. Régua combinada com o
// Marcelo: se em 2 semanas a média por Reel ficar abaixo de ~50 views, não investir mais lá.
//
// Roda no Actions (o token só existe lá). O IG_TOKEN é token de USUÁRIO com
// pages_read_engagement; dele sai o token da Página. Nomes de métrica de vídeo mudam entre
// versões da API — tenta conjuntos em ordem e registra qual respondeu. Nunca derruba o job:
// erro vira campo no arquivo.
//
//   node publicador/metricas-facebook.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'metricas-facebook.json');
const API = 'https://graph.facebook.com/v21.0';
// FB_TOKEN (14/09/2026): chave SÓ DE LEITURA (read_insights + pages_read_engagement), separada
// da que publica — trocar a IG_TOKEN pra ganhar read_insights arriscava parar a publicação.
// Pode ser token de Página (não vence) ou de usuário; sem ela, cai na IG_TOKEN (lê a lista de
// Reels, mas não as views).
const { IG_TOKEN, FB_TOKEN, FB_PAGE_ID } = process.env;
const TOKEN_LEITURA = FB_TOKEN || IG_TOKEN;
if (!TOKEN_LEITURA || !FB_PAGE_ID) { console.error('faltam FB_TOKEN/IG_TOKEN ou FB_PAGE_ID'); process.exit(0); }

const get = async (caminho, params, token) => {
  const u = new URL(API + caminho);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  u.searchParams.set('access_token', token);
  return (await fetch(u)).json();
};
const erros = [];

const pag = await get(`/${FB_PAGE_ID}`, { fields: 'access_token,name,followers_count,fan_count' }, TOKEN_LEITURA);
// Token de Página não devolve access_token de si mesmo: nesse caso ele já É o token da Página.
if (!pag.access_token && FB_TOKEN && !pag.error) pag.access_token = FB_TOKEN;
console.log(`chave usada: ${FB_TOKEN ? 'FB_TOKEN (só leitura)' : 'IG_TOKEN'}`);
if (!pag.access_token) {
  erros.push(`token da Página: ${pag.error?.message || 'não veio'}`);
  fs.writeFileSync(SAIDA, JSON.stringify({ gerado_em: new Date().toISOString(), erros }, null, 2) + '\n');
  console.error(erros[0]); process.exit(0);
}
const TK = pag.access_token;

// Reels da Página (os antigos também — servem de base de comparação).
const reels = [];
let r = await get(`/${FB_PAGE_ID}/video_reels`, { fields: 'id,description,created_time,permalink_url,length', limit: '50' }, TK);
for (let i = 0; i < 4; i++) {
  if (r.error) { erros.push(`video_reels: ${r.error.message}`); break; }
  reels.push(...(r.data || []));
  if (!r.paging?.next) break;
  r = await (await fetch(r.paging.next)).json();
}

const CONJUNTOS = [
  'fb_reels_total_plays,blue_reels_play_count,post_impressions_unique,post_video_avg_time_watched,post_video_social_actions',
  'blue_reels_play_count,post_impressions_unique,post_video_avg_time_watched',
  'blue_reels_play_count',
];
let conjuntoOk = null;
async function insights(id) {
  for (const metric of (conjuntoOk ? [conjuntoOk] : CONJUNTOS)) {
    const x = await get(`/${id}/video_insights`, { metric }, TK);
    if (x.data) {
      conjuntoOk = metric;
      const o = {};
      for (const m of x.data) {
        const v = m.values?.[0]?.value;
        o[m.name] = (v && typeof v === 'object') ? Object.values(v).reduce((a, b) => a + (+b || 0), 0) : v ?? null;
      }
      return o;
    }
    if (!/metric|invalid|does not support|valid insights/i.test(x.error?.message || '')) return { _erro: (x.error?.message || '').slice(0, 160) };
  }
  return { _erro: 'nenhum conjunto de métricas aceito' };
}

const itens = [];
for (const v of reels) {
  const n = await insights(v.id);
  itens.push({
    id: v.id,
    quando: v.created_time,
    titulo: (v.description || '').split('\n')[0].slice(0, 110),
    link: v.permalink_url ? (v.permalink_url.startsWith('http') ? v.permalink_url : `https://www.facebook.com${v.permalink_url}`) : `https://www.facebook.com/reel/${v.id}`,
    segundos: v.length ?? null,
    views: n.fb_reels_total_plays ?? n.blue_reels_play_count ?? null,
    alcance: n.post_impressions_unique ?? null,
    tempo_medio_ms: n.post_video_avg_time_watched ?? null,
    interacoes: n.post_video_social_actions ?? null,
    ...(n._erro ? { _erro: n._erro } : {}),
  });
}
itens.sort((a, b) => new Date(b.quando) - new Date(a.quando));

// ── Views da Página por dia (14/09/2026) ──────────────────────────────────────
// Pro placar mostrar "quanto cada dia teve" no Facebook, como já faz no YouTube e no Insta.
// A Meta aposentou métricas de Página em 2025; tenta os nomes em ordem e guarda o histórico.
async function paginaDiaria() {
  let anterior = [];
  try { anterior = JSON.parse(fs.readFileSync(SAIDA, 'utf8')).pagina_diaria || []; } catch {}
  const mapa = new Map(anterior.map(p => [p.d, p.views]));
  const ts = n => String(Math.floor((Date.now() - n * 864e5) / 1000));
  const falhas = [];
  for (const metric of ['page_media_view', 'page_video_views', 'page_impressions']) {
    const novos = []; let ok = true;
    for (const [a, b] of [[90, 60], [60, 30], [30, 0]]) {
      const r = await get(`/${FB_PAGE_ID}/insights`, { metric, period: 'day', since: ts(a), until: ts(b) }, TK);
      const vals = r.data?.[0]?.values;
      if (!vals) { ok = false; falhas.push(`${metric}: ${(r.error?.message || 'sem valores').slice(0, 100)}`); break; }
      for (const v of vals) {
        const val = (v.value && typeof v.value === 'object') ? Object.values(v.value).reduce((x, y) => x + (+y || 0), 0) : (v.value ?? 0);
        novos.push([new Date(Date.parse(v.end_time) - 864e5).toISOString().slice(0, 10), val]);
      }
    }
    if (ok) {
      for (const [d, v] of novos) mapa.set(d, v);
      return { metric, lista: [...mapa.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([d, views]) => ({ d, views })) };
    }
  }
  erros.push('pagina_diaria: ' + falhas.join(' | '));
  return { metric: null, lista: [...mapa.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([d, views]) => ({ d, views })) };
}
const pd = await paginaDiaria();
console.log(`Página por dia: ${pd.lista.length} dias (${pd.metric || 'nenhuma métrica aceita'})`);

const doc = {
  gerado_em: new Date().toISOString(),
  pagina: { id: FB_PAGE_ID, nome: pag.name, seguidores: pag.followers_count ?? null, curtidas: pag.fan_count ?? null },
  pagina_diaria: pd.lista,
  pagina_diaria_metrica: pd.metric,
  metricas_usadas: conjuntoOk,
  itens,
  erros,
};
fs.writeFileSync(SAIDA, JSON.stringify(doc, null, 2) + '\n', 'utf8');
const soma = itens.reduce((a, i) => a + (i.views || 0), 0);
console.log(`Página ${pag.name}: ${pag.followers_count ?? '?'} seguidores · ${itens.length} Reels · ${soma} views somadas · métricas: ${conjuntoOk || 'nenhuma'}`);
if (erros.length) console.log('erros: ' + erros.join(' | '));
const semView = itens.filter(i => i._erro).length;
if (semView) console.log(`${semView} Reels sem insights — 1º erro: ${itens.find(i => i._erro)._erro}`);
