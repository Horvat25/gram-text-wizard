// comenta-youtube.mjs — põe o primeiro comentário nos Shorts que acabaram de ficar públicos.
//
// POR QUE EXISTE (20/08/2026): o Kindle saiu de dentro do vídeo — a medição de 19/08
// mostrou o cartaz de CTA derrubando a retenção de 100%+ pra 48%, e quase ninguém
// chegava a vê-lo. A oferta passou a viver no COMENTÁRIO FIXADO.
//
// POR QUE RODA AQUI, no repositório do Instagram: este é o único motor da operação
// que roda sozinho, no GitHub Actions, com o PC do Marcelo desligado. O estúdio do
// YouTube roda na máquina dele, sob demanda. Pendurar isto no workflow que já existe
// não gasta minuto novo do plano grátis.
//
// ⚠️ FIXAR NÃO TEM ENDPOINT na API do YouTube. O robô garante que o comentário
// EXISTA e seja o primeiro; quem fixa é o Marcelo, na mão (ele já faz isso todo dia).
//
// ⚠️ NUNCA comenta duas vezes: antes de escrever, pergunta ao YouTube se o nosso
// próprio canal já comentou naquele vídeo. Checar a fonte é mais confiável que
// guardar estado em arquivo — arquivo se perde, e comentário repetido é vexame.
//
//   node publicador/comenta-youtube.mjs [--seco]

const SECO = process.argv.includes('--seco');
const API = 'https://www.googleapis.com/youtube/v3';

const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
  console.error('faltam os secrets YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN');
  process.exit(0); // sair 0 de propósito: não é pra derrubar a rodada do Instagram
}

// Só comenta em vídeo que ficou público nas últimas HORAS. Janela generosa porque
// o cron do GitHub atrasa de 42 a 57 min (medido em 13/08), e porque um vídeo que
// saiu ontem não precisa mais do comentário — se não pegou, não pega.
const JANELA_HORAS = 30;

// ⚠️ Dizer só "de graça" promete mais do que é. Correção do Marcelo em 20/08 (ele viu
// isso no Instagram primeiro): tem que ficar claro que o GRÁTIS é o primeiro mês, que
// depois vira assinatura paga, e que dá pra cancelar antes. Protege a conta também —
// prometer "grátis" sem qualificar é o que vira reclamação.
//
//
// ⚠️ DUAS SUPERFÍCIES, DOIS TEXTOS (21/08/2026, correção do Marcelo).
//
// No player de SHORTS o link do comentário NÃO é clicável — no celular ele aparece
// como texto morto. (Eu tinha "verificado" na página de computador, onde ele vira
// <a href> de verdade, e concluí errado. Conferir na superfície onde a pessoa está.)
// Então no Short o comentário manda pra BIO DO CANAL, igual ao "link na bio" do
// Instagram — e o link do canal já existe e já aponta pra /links?o=yt.
//
// No vídeo LONGO o link é clicável de verdade, então lá vai a URL inteira.
//
// ⚠️ O aviso de afiliado só aparece onde o LINK aparece (contrato dos Associados,
// cláusula 5). No texto do Short não há link, então ele não vai — igual à legenda
// do Instagram.
const TEXTO_CURTO = [
  '📚 O primeiro mês do Kindle Unlimited é grátis.',
  'O link está na bio do canal: toca em Neural Update aqui em cima → Links → Kindle.',
  '',
  'Depois vira assinatura paga — se não quiser continuar, cancela antes de o mês acabar e não paga nada.',
  '(Link de afiliado: o canal pode receber comissão se você assinar, sem custo extra.)',
].join('\n');

const TEXTO_LONGO = [
  '📚 O primeiro mês do Kindle Unlimited é grátis:',
  'https://neural-update.com.br/kindle/?o=yt',
  '',
  'Depois vira assinatura paga — se não quiser continuar, cancela antes de o mês acabar e não paga nada.',
  // no LONGO o link aparece de verdade: manter a frase do Programa de Associados (mais forte que a dos Shorts)
  '(Link de afiliado — como associado da Amazon, o Neural Update recebe por compras qualificadas, sem custo a mais pra você.)',
].join('\n');

// Texto POR VÍDEO (campo `comentario` do lote). O `sobe-lote.js` do estúdio grava videoId → texto em
// data/comentarios-yt.json; esse arquivo é copiado pra cá como publicador/comentarios-yt.json.
// Vídeo sem entrada no mapa → o genérico acima. (Mudança de 14/10/2026, ordem da Direção.)
import { readFileSync, existsSync } from 'node:fs';
// JSON quebrado não pode derrubar o robô: cai no texto genérico e avisa no log.
let MAPA = {};
try {
  if (existsSync('publicador/comentarios-yt.json')) MAPA = JSON.parse(readFileSync('publicador/comentarios-yt.json', 'utf8'));
} catch (e) { console.error('comentarios-yt.json ilegível, usando o texto genérico: ' + e.message); }
const textoDe = v => MAPA[v.id]?.texto || (ehShort(v) ? TEXTO_CURTO : TEXTO_LONGO);

// Short vai até 3 min em 2026. Acima disso é vídeo comum, onde o link funciona.
const ehShort = v => {
  const m = (v.contentDetails?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
  const seg = (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return seg > 0 && seg <= 185;
};

async function token() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET,
      refresh_token: YT_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('refresh falhou: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

const get = async (tk, caminho, params) => {
  const u = new URL(API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { authorization: `Bearer ${tk}` } });
  return r.json();
};

async function main() {
  const tk = await token();

  const canal = await get(tk, '/channels', { part: 'contentDetails,id', mine: 'true' });
  const meuId = canal.items?.[0]?.id;
  const uploads = canal.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('não achei a playlist de uploads: ' + JSON.stringify(canal).slice(0, 200));

  const lista = await get(tk, '/playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '15' });
  const ids = (lista.items || []).map(i => i.contentDetails.videoId);
  if (!ids.length) { console.log('nenhum vídeo no canal'); return; }

  const detalhes = await get(tk, '/videos', { part: 'status,snippet,contentDetails', id: ids.join(',') });
  const corte = Date.now() - JANELA_HORAS * 3600 * 1000;

  const candidatos = (detalhes.items || []).filter(v =>
    v.status.privacyStatus === 'public' && new Date(v.snippet.publishedAt).getTime() >= corte);

  console.log(`${ids.length} vídeos recentes · ${candidatos.length} público(s) nas últimas ${JANELA_HORAS}h`);

  for (const v of candidatos) {
    const titulo = v.snippet.title.slice(0, 50);

    const fios = await get(tk, '/commentThreads', {
      part: 'snippet', videoId: v.id, maxResults: '100', textFormat: 'plainText',
    });
    if (fios.error) {
      // comentário desativado, ou vídeo sem seção de comentários
      console.log(`· ${titulo} — não deu pra ler comentários (${fios.error.errors?.[0]?.reason || '?'})`);
      continue;
    }
    const jaComentei = (fios.items || []).some(f =>
      f.snippet?.topLevelComment?.snippet?.authorChannelId?.value === meuId);
    if (jaComentei) { console.log(`· ${titulo} — já comentado`); continue; }

    if (SECO) { console.log(`[seco] comentaria em ${titulo}:
${textoDe(v)}
`); continue; }

    const r = await fetch(`${API}/commentThreads?part=snippet`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tk}`, 'content-type': 'application/json' },
      body: JSON.stringify({ snippet: { videoId: v.id, topLevelComment: { snippet: { textOriginal: textoDe(v) } } } }),
    });
    const j = await r.json();
    if (j.id) console.log(`✓ ${titulo} — comentado`);
    else console.error(`✗ ${titulo} — ${JSON.stringify(j).slice(0, 200)}`);
  }
}

// Falha aqui não pode derrubar a rodada do Instagram: o publicador é o que não
// pode parar. Loga e sai limpo.
main().catch(e => { console.error('ERRO no comentário do YouTube: ' + (e.message || e)); });
