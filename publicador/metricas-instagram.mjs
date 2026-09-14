// metricas-instagram.mjs — puxa os números reais do @neuralupdate e grava em metricas.json.
//
// POR QUE EXISTE (20/08/2026): todo o conhecimento de formato da operação vem do
// YouTube. A gente escolhe tema, duração e gancho com a régua de uma rede só — e aí
// a AULA, que é o PIOR formato no YouTube (56% de retenção contra 71% da notícia),
// foi justamente a que viralizou no Instagram e trouxe +40 seguidores num dia.
// Ou seja: pode existir um formato campeão no Insta que a gente nunca viu.
//
// POR QUE RODA NO ACTIONS: o IG_TOKEN é secret do GitHub e não desce pra máquina do
// Marcelo. O robô roda ONDE o token vive e grava o resultado num arquivo versionado,
// que qualquer um (inclusive o agente) lê depois sem precisar de credencial nenhuma.
//
//   node publicador/metricas-instagram.mjs [--seco]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.join(AQUI, 'metricas.json');
const API = 'https://graph.facebook.com/v21.0';
const SECO = process.argv.includes('--seco');

const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
if (!IG_USER_ID || !IG_TOKEN) { console.error('faltam IG_USER_ID / IG_TOKEN'); process.exit(1); }

const get = async (caminho, params = {}) => {
  const u = new URL(API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', IG_TOKEN);
  const r = await fetch(u);
  return r.json();
};

// O nome das métricas mudou entre versões da API (plays virou views). Em vez de
// apostar numa, tenta na ordem e fica com a que responder — e registra qual foi.
async function insights(idMidia) {
  const conjuntos = [
    'views,reach,likes,comments,shares,saved,total_interactions',
    'plays,reach,likes,comments,shares,saved,total_interactions',
    'reach,likes,comments,saved',
  ];
  for (const metric of conjuntos) {
    const r = await get(`/${idMidia}/insights`, { metric });
    if (r.data) {
      const out = {};
      for (const m of r.data) out[m.name] = m.values?.[0]?.value ?? null;
      return out;
    }
    // se o erro não for de métrica inválida, não adianta tentar os outros conjuntos
    const msg = r.error?.message || '';
    if (!/metric|invalid|does not support/i.test(msg)) return { _erro: msg.slice(0, 160) };
  }
  return { _erro: 'nenhum conjunto de métricas aceito' };
}

const conta = await get(`/${IG_USER_ID}`, { fields: 'username,followers_count,media_count' });
if (conta.error) { console.error('conta: ' + JSON.stringify(conta.error).slice(0, 300)); process.exit(1); }
console.log(`@${conta.username} · ${conta.followers_count} seguidores · ${conta.media_count} publicações`);

const midias = await get(`/${IG_USER_ID}/media`, {
  fields: 'id,caption,media_type,media_product_type,timestamp,permalink',
  limit: '50',
});
if (midias.error) { console.error('mídias: ' + JSON.stringify(midias.error).slice(0, 300)); process.exit(1); }

// 12/09/2026: funil por direct. A automação do Business Suite responde a quem comenta
// QUERO/CÉU com o link do projetor. Pra melhorar a mensagem com DADO, e não com opinião,
// cada reel dos últimos 14 dias ganha a contagem de comentários com a palavra-chave
// (= quantos directs de venda saíram). Cliques e vendas vêm do painel da Shopee.
const PALAVRA = /(^|[^\p{L}])(quero|c[ée]u|cosmos)([^\p{L}]|$)/iu;
const JANELA_DM = 14 * 24 * 3600 * 1000;
async function pedidosDm(idMidia) {
  let n = 0, pagina = await get(`/${idMidia}/comments`, { fields: 'text', limit: '100' });
  for (let i = 0; i < 5; i++) {
    if (pagina.error) return { _erro_comentarios: (pagina.error.message || '').slice(0, 160) };
    n += (pagina.data || []).filter(c => PALAVRA.test(c.text || '')).length;
    if (!pagina.paging?.next) break;
    pagina = await (await fetch(pagina.paging.next)).json();
  }
  return { pedidos_dm: n };
}

const itens = [];
for (const m of (midias.data || [])) {
  const n = SECO ? {} : await insights(m.id);
  const recente = Date.now() - new Date(m.timestamp).getTime() < JANELA_DM;
  const dm = SECO || !recente ? {} : await pedidosDm(m.id);
  itens.push({
    id: m.id,
    quando: m.timestamp,
    tipo: m.media_product_type || m.media_type,
    link: m.permalink,
    // a legenda inteira polui o arquivo; a primeira linha basta pra reconhecer o vídeo
    titulo: (m.caption || '').split('\n')[0].slice(0, 110),
    pede_quero: /comenta quero/i.test(m.caption || ''),
    ...n,
    ...dm,
  });
  if (SECO) continue;
}

itens.sort((a, b) => new Date(b.quando) - new Date(a.quando));

// ── Views da CONTA por dia (14/09/2026) ──────────────────────────────────────
// Os 50 posts mais novos não dizem "quantas views tivemos nos últimos 60 dias": post que sai
// da janela congela. O Insights da conta dá o número real por dia. Guarda o histórico no
// próprio arquivo e completa o que falta dos últimos 60 dias a cada rodada.
async function contaDiaria() {
  let anterior = [];
  try { anterior = JSON.parse(fs.readFileSync(SAIDA, 'utf8')).conta_diaria || []; } catch {}
  const mapa = new Map(anterior.map(p => [p.d, p.views]));
  const dia = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const ts = d => String(Math.floor(Date.parse(d + 'T00:00:00Z') / 1000));
  let modo = null, erro = null;
  // 1) série diária em blocos de 30 dias (2 chamadas)
  for (const [a, b] of [[61, 31], [31, 1]]) {
    const r = await get(`/${IG_USER_ID}/insights`, { metric: 'views', period: 'day', since: ts(dia(a)), until: ts(dia(b)) });
    const vals = r.data?.[0]?.values;
    if (!vals) { erro = (r.error?.message || 'sem valores').slice(0, 160); modo = null; break; }
    for (const v of vals) mapa.set(new Date(Date.parse(v.end_time) - 864e5).toISOString().slice(0, 10), v.value ?? 0);
    modo = 'série diária';
  }
  // 2) se a API só aceitar total do período, pede dia a dia o que falta (no máx. 35 por rodada)
  if (!modo) {
    let feitos = 0;
    // 120 dias (14/09): com 60, o filtro de 90 dias do placar ficava 39 mil abaixo do app.
    for (let n = 120; n >= 1 && feitos < 35; n--) {
      const d = dia(n); if (mapa.has(d)) continue;
      const r = await get(`/${IG_USER_ID}/insights`, { metric: 'views', period: 'day', metric_type: 'total_value', since: ts(d), until: ts(dia(n - 1)) });
      feitos++;
      const v = r.data?.[0]?.total_value?.value;
      if (v == null) { erro = (r.error?.message || 'sem total_value').slice(0, 160); break; }
      mapa.set(d, v); modo = 'total por dia';
    }
  }
  const lista = [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-400).map(([d, views]) => ({ d, views }));
  console.log(`conta por dia: ${lista.length} dias (${modo || 'falhou'})${erro ? ' · ' + erro : ''}`);
  return { lista, modo, erro };
}
const cd = SECO ? { lista: [], modo: null, erro: null } : await contaDiaria();

// ── Acervo desde a virada pra astronomia (14/09/2026) ─────────────────────────
// O Marcelo quer comparar as redes "desde que viramos astronomia" (17/06/2026), vídeo a vídeo.
// A janela de 50 posts não chega lá: o acervo guarda TODOS os posts desde 17/06 e atualiza os
// números aos poucos — no máx. 40 por rodada, pra caber no limite de ~200 chamadas/hora.
const INICIO_ASTRONOMIA = '2026-06-17';
async function acervo(recentes) {
  let ant = [];
  try { ant = JSON.parse(fs.readFileSync(SAIDA, 'utf8')).acervo || []; } catch {}
  const mapa = new Map(ant.map(a => [a.id, a]));
  const agora = new Date().toISOString();
  for (const i of recentes) {
    mapa.set(i.id, { id: i.id, quando: i.quando, tipo: i.tipo, link: i.link, titulo: i.titulo,
      views: i.views ?? i.plays ?? null, reach: i.reach ?? null, shares: i.shares ?? null, likes: i.likes ?? null,
      saved: i.saved ?? null, comments: i.comments ?? null, atualizado: agora });
  }
  let pag = midias, paginas = 0;   // continua a lista além das 50, até passar de 17/06
  while (pag?.paging?.next && paginas < 12) {
    const ult = pag.data?.at(-1);
    if (ult && ult.timestamp < INICIO_ASTRONOMIA) break;
    pag = await (await fetch(pag.paging.next)).json(); paginas++;
    for (const m of pag.data || []) {
      if (m.timestamp < INICIO_ASTRONOMIA || mapa.has(m.id)) continue;
      mapa.set(m.id, { id: m.id, quando: m.timestamp, tipo: m.media_product_type || m.media_type, link: m.permalink,
        titulo: (m.caption || '').split('\n')[0].slice(0, 110), views: null, atualizado: null });
    }
  }
  const idsRecentes = new Set(recentes.map(r => r.id));
  const vez = [...mapa.values()].filter(a => !idsRecentes.has(a.id))
    .sort((a, b) => String(a.atualizado || '').localeCompare(String(b.atualizado || ''))).slice(0, 40);
  for (const a of vez) {
    const n = await insights(a.id);
    if (!n._erro) Object.assign(a, { views: n.views ?? n.plays ?? a.views, reach: n.reach ?? a.reach, shares: n.shares ?? a.shares, likes: n.likes ?? a.likes ?? null,
      saved: n.saved ?? a.saved, comments: n.comments ?? a.comments, atualizado: agora });
  }
  const lista = [...mapa.values()].filter(a => String(a.quando) >= INICIO_ASTRONOMIA).sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  console.log(`acervo desde ${INICIO_ASTRONOMIA}: ${lista.length} posts · ${lista.filter(a => a.views != null).length} com números · ${vez.length} atualizados agora`);
  return lista;
}
const listaAcervo = SECO ? [] : await acervo(itens);

const doc = {
  gerado_em: new Date().toISOString(),
  conta: { username: conta.username, seguidores: conta.followers_count, publicacoes: conta.media_count },
  conta_diaria: cd.lista,
  conta_diaria_modo: cd.modo,
  ...(cd.erro ? { conta_diaria_erro: cd.erro } : {}),
  itens,
  acervo: listaAcervo,
};

if (SECO) { console.log(JSON.stringify(doc, null, 2).slice(0, 1200)); process.exit(0); }
fs.writeFileSync(SAIDA, JSON.stringify(doc, null, 2) + '\n', 'utf8');

const comErro = itens.filter(i => i._erro).length;
console.log(`${itens.length} mídias gravadas em metricas.json${comErro ? ` · ${comErro} sem insights` : ''}`);
if (comErro) console.log('  1º erro: ' + itens.find(i => i._erro)._erro);
