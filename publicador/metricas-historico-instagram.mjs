// metricas-historico-instagram.mjs — puxa o HISTÓRICO INTEIRO do @neuralupdate (todas as
// publicações, não só as 50 mais recentes) e, nos Reels, o TEMPO MÉDIO ASSISTIDO.
//
// POR QUE EXISTE (23/09/2026): o metricas-instagram.mjs lê uma página só (50 de 864 posts)
// e não pede tempo assistido. Isso deixou 814 publicações e toda a retenção do Insta fora do
// sistema de análise (analytics/jev). Este script é SÓ LEITURA, roda sob demanda e grava em
// publicador/metricas-historico.json. Não toca na fila nem no publicador.
//
//   node publicador/metricas-historico-instagram.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'metricas-historico.json');
const API = 'https://graph.facebook.com/v21.0';
const TETO_PAGINAS = 40;           // 40 x 50 = 2.000 publicações — trava contra loop infinito

const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
if (!IG_USER_ID || !IG_TOKEN) { console.error('faltam IG_USER_ID / IG_TOKEN'); process.exit(1); }

const espera = ms => new Promise(r => setTimeout(r, ms));
async function get(caminho, params = {}) {
  const u = new URL(caminho.startsWith('http') ? caminho : API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (!u.searchParams.has('access_token')) u.searchParams.set('access_token', IG_TOKEN);
  for (let t = 1; t <= 4; t++) {
    const r = await fetch(u);
    const j = await r.json();
    const cod = j.error?.code;
    if (cod === 4 || cod === 17 || cod === 32 || cod === 613) { await espera(15000 * t); continue; } // limite de taxa
    return j;
  }
  return { error: { message: 'limite de taxa persistente' } };
}

// Reels têm métricas de tempo assistido; post/carrossel não. Tenta do mais completo pro mais simples.
const CONJUNTOS_REELS = [
  // 23/09: + reels_skip_rate (% que pulou nos 3 primeiros segundos) e reposts
  'views,reach,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate,reposts',
  'views,reach,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate',
  'views,reach,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time',
  'views,reach,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time',
  'views,reach,likes,comments,shares,saved,total_interactions',
  'plays,reach,likes,comments,shares,saved,total_interactions',
];
const CONJUNTOS_OUTROS = [
  'views,reach,likes,comments,shares,saved,total_interactions,reposts',
  'views,reach,likes,comments,shares,saved,total_interactions',
  'reach,likes,comments,saved',
];
async function insights(m) {
  const lista = m.media_product_type === 'REELS' ? CONJUNTOS_REELS : CONJUNTOS_OUTROS;
  let ultimo = '';
  // tenta do conjunto mais completo pro mais simples; se a API recusar uma métrica, cai pro próximo
  for (const metric of lista) {
    const r = await get(`/${m.id}/insights`, { metric });
    if (r.data) {
      const out = { _metricas: metric };
      for (const x of r.data) out[x.name] = x.values?.[0]?.value ?? x.total_value?.value ?? null;
      return out;
    }
    ultimo = r.error?.message || '';
    if (!/metric|invalid|does not support|not available/i.test(ultimo)) break;
  }
  return { _erro: ultimo.slice(0, 160) };
}

const conta = await get(`/${IG_USER_ID}`, { fields: 'username,followers_count,media_count' });
if (conta.error) { console.error('conta: ' + JSON.stringify(conta.error).slice(0, 300)); process.exit(1); }
console.log(`@${conta.username} · ${conta.followers_count} seguidores · ${conta.media_count} publicações`);

// ---- lista TODAS as mídias, paginando com trava
const midias = [];
let url = `/${IG_USER_ID}/media`;
let params = { fields: 'id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,like_count,comments_count', limit: '50' };
for (let p = 0; p < TETO_PAGINAS && url; p++) {
  const r = await get(url, params);
  if (r.error) { console.error('mídias: ' + JSON.stringify(r.error).slice(0, 300)); break; }
  midias.push(...(r.data || []));
  const prox = r.paging?.next;
  if (!prox || !(r.data || []).length) break;    // trava: sem próxima página ou página vazia, acabou
  url = prox; params = {};
}
console.log(`${midias.length} mídias listadas`);

// ---- insights de cada uma (em série, com pausa curta, pra não bater no limite de taxa)
const itens = [];
let comErro = 0, comTempo = 0;
for (const [i, m] of midias.entries()) {
  const n = await insights(m);
  if (n._erro) comErro++;
  if (n.ig_reels_avg_watch_time != null) comTempo++;
  itens.push({
    id: m.id, quando: m.timestamp, tipo: m.media_product_type || m.media_type, link: m.permalink,
    titulo: (m.caption || '').split('\n')[0].slice(0, 140),
    legenda: (m.caption || '').slice(0, 2200),
    curtidas_campo: m.like_count ?? null, comentarios_campo: m.comments_count ?? null,
    ...n,
  });
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${midias.length}...`);
  await espera(250);
}

fs.writeFileSync(SAIDA, JSON.stringify({
  gerado_em: new Date().toISOString(),
  conta: { username: conta.username, seguidores: conta.followers_count, publicacoes: conta.media_count },
  total_listado: midias.length, com_tempo_assistido: comTempo, sem_insights: comErro,
  nota: 'ig_reels_avg_watch_time vem em milissegundos. Dividir pela duração do Reel dá a retenção média.',
  itens,
}, null, 1));
console.log(`${itens.length} mídias gravadas · ${comTempo} com tempo assistido · ${comErro} sem insights`);
