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
const doc = {
  gerado_em: new Date().toISOString(),
  conta: { username: conta.username, seguidores: conta.followers_count, publicacoes: conta.media_count },
  itens,
};

if (SECO) { console.log(JSON.stringify(doc, null, 2).slice(0, 1200)); process.exit(0); }
fs.writeFileSync(SAIDA, JSON.stringify(doc, null, 2) + '\n', 'utf8');

const comErro = itens.filter(i => i._erro).length;
console.log(`${itens.length} mídias gravadas em metricas.json${comErro ? ` · ${comErro} sem insights` : ''}`);
if (comErro) console.log('  1º erro: ' + itens.find(i => i._erro)._erro);
