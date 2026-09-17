// publicar.mjs — publicador do Instagram do @neuralupdate.
//
// POR QUE ELE EXISTE: até 10/ago/2026 a fila morava numa tabela do Supabase e
// quem publicava era um pg_cron dentro do mesmo banco. Quando o banco saiu do
// ar, foram juntos a fila E o carteiro, e o canal parou no meio do dia sem
// ninguém perceber. Agora a fila é um arquivo versionado e quem publica é o
// GitHub Actions: se um cair, o outro não vai junto.
//
// Roda sem dependência nenhuma (fetch nativo do Node 20+).
//   node publicar.mjs           # publica o que venceu
//   node publicar.mjs --seco    # só mostra o que faria

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { legendaFacebook } from './legenda-facebook.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FILA = path.join(AQUI, 'fila.json');
const API = 'https://graph.facebook.com/v21.0';
const SECO = process.argv.includes('--seco');

const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
const CONTA = process.env.IG_CONTA || 'neuralupdate';

if (!SECO && (!IG_USER_ID || !IG_TOKEN)) {
  console.error('faltam os secrets IG_USER_ID / IG_TOKEN');
  process.exit(1);
}

const dorme = ms => new Promise(r => setTimeout(r, ms));

// O terceiro Story diário deixou de divulgar o Kindle Unlimited. Qualquer lote
// novo que ainda chegue com o slug legado `story-kindle-AAAA-MM-DD` é convertido
// aqui, antes da seleção dos vencidos, em uma das três peças do Projetor
// Astronauta. A data decide a variação, então a rotação 1 -> 2 -> 3 continua
// determinística entre execuções e não depende de estado externo.
const STORY_PROJETOR_BASE = 'https://neural-update.com.br/stories/projetor-astronauta';
const STORY_PROJETOR_VARIACOES = [
  { arquivo: '01-transformacao-quarto.png', nome: 'transformacao-quarto' },
  { arquivo: '02-presente-universo.png', nome: 'presente-universo' },
  { arquivo: '03-atmosfera-noturna.png', nome: 'atmosfera-noturna' },
];
const DIA_INICIAL_ROTACAO = Date.UTC(2026, 8, 8); // 08/09/2026 = variação 1

// ⚠️ 12/09/2026: esta conversão fez o MESMO story do projetor sair 4 vezes na noite de
// 11/09 (00:10Z duas, 00:38Z e 00:50Z). Eram dois defeitos juntos:
//  1) a fila tinha story-kindle E story do projetor às 20h — o kindle convertido virava
//     uma segunda cópia do projetor no mesmo horário;
//  2) a conversão TROCAVA o slug. O funde-fila.mjs casa item por slug+horário, então o
//     item "publicado" (slug novo) nunca batia com o story-kindle "agendado" que estava
//     no GitHub — ele voltava vivo a cada rodada e saía de novo.
// Agora o slug NUNCA muda (a fusão reconhece o item), e se o horário já tem outro story
// o kindle é CANCELADO em vez de convertido.
function substituiKindlePorProjetor(fila) {
  let total = 0;
  for (const item of fila) {
    if (item.tipo !== 'story' || !/^story-kindle-\d{4}-\d{2}-\d{2}/u.test(item.slug || '')) continue;
    if (!['agendado', 'pausado'].includes(item.status)) continue;

    const data = item.slug.match(/\d{4}-\d{2}-\d{2}/u)?.[0] || item.quando.slice(0, 10);
    if (Date.parse(`${data}T00:00:00.000Z`) < DIA_INICIAL_ROTACAO) continue;

    const ocupante = fila.find(i => i !== item && i.tipo === 'story' && i.quando === item.quando
      && !['perdido', 'cancelado'].includes(i.status));
    if (ocupante) {
      item.status = 'cancelado';
      item.motivo_cancelamento = `o horario ja tem o story ${ocupante.slug}`;
      total++;
      continue;
    }

    const numeroDoDia = Math.floor((Date.parse(`${data}T00:00:00.000Z`) - DIA_INICIAL_ROTACAO) / 86400000);
    const indice = ((numeroDoDia % STORY_PROJETOR_VARIACOES.length) + STORY_PROJETOR_VARIACOES.length) % STORY_PROJETOR_VARIACOES.length;
    const variacao = STORY_PROJETOR_VARIACOES[indice];

    item.midia = `${STORY_PROJETOR_BASE}/${variacao.arquivo}`;
    item.status = 'agendado';
    item.campanha = 'projetor-astronauta';
    item.variacao = variacao.nome;
    delete item.motivo_pausa;
    total++;
  }
  return total;
}

// ── Primeiro comentário (20/08/2026, pedido do Marcelo) ────────────────────────
// O Kindle SAIU de dentro do vídeo (a medição de 19/08 mostrou que o cartaz de CTA
// derrubava a retenção de 100%+ pra 48% e quase ninguém chegava a vê-lo). A oferta
// passou a viver na legenda e no PRIMEIRO COMENTÁRIO.
//
// Fixar não tem endpoint na API — quem fixa é o Marcelo, na mão, todo dia. Aqui a
// gente só garante que o comentário exista, e exista PRIMEIRO (postado segundos
// depois da publicação, antes de qualquer outro).
//
// ⚠️ Falhar aqui NUNCA pode marcar o post como falho: o vídeo já está no ar. O erro
// fica registrado no item pra aparecer no log e no saude.yml.
const COMENTARIO = '📚 Curtiu? Isso aqui vira livro: o primeiro mês do Kindle Unlimited é grátis. Depois vira assinatura paga — se não quiser continuar, é só cancelar antes de o mês acabar e você não paga nada. Link na bio.';

async function comenta(idMidia) {
  const r = await post(`${API}/${idMidia}/comments`, { message: COMENTARIO, access_token: IG_TOKEN });
  if (!r.id) throw new Error(JSON.stringify(r).slice(0, 300));
  return r.id;
}

async function post(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { method: 'POST' });
  return r.json();
}

// Confere de quem é o token ANTES de publicar. Vale o round-trip: é o que
// impede postar o conteúdo do canal na conta errada.
async function confereConta() {
  const u = new URL(`${API}/${IG_USER_ID}`);
  u.searchParams.set('fields', 'username');
  u.searchParams.set('access_token', IG_TOKEN);
  const d = await (await fetch(u)).json();
  if (d.error) throw new Error(`token inválido: ${d.error.message}`);
  if (d.username !== CONTA) {
    throw new Error(`ABORTADO: o token é da conta @${d.username}, mas esperávamos @${CONTA}.`);
  }
  console.log(`token confere: @${d.username}`);
}

// ── Carrossel (12/09/2026) ─────────────────────────────────────────────────────
// O feed era 100% Reels: alcance sem autoridade (3,4 salvamentos por post). Carrossel é o
// formato que mais gera salvamento, então entra na grade às 12h. O código é o mesmo caminho
// que JÁ publicou carrossel de verdade no reparum-feed.mjs: cada filho leva
// is_carousel_item como TEXTO 'true' — com booleano a Meta responde 9004 "Only photo or
// video can be accepted as media type" (foi o que derrubou o carrossel de 08/08/2026).
// A API aceita de 2 a 10 imagens, todas JPEG e na mesma proporção (usamos 1080x1350).
async function criaCarrossel(item) {
  const urls = [].concat(item.midia);
  if (urls.length < 2 || urls.length > 10) throw new Error(`carrossel precisa de 2 a 10 imagens (tem ${urls.length})`);
  const filhos = [];
  for (const url of urls) {
    const f = await post(`${API}/${IG_USER_ID}/media`, { image_url: url, is_carousel_item: 'true', access_token: IG_TOKEN });
    if (f.error) throw new Error(`imagem ${filhos.length + 1} do carrossel: ${f.error.message}`);
    filhos.push(f.id);
  }
  const c = await post(`${API}/${IG_USER_ID}/media`, {
    media_type: 'CAROUSEL', children: filhos.join(','), caption: item.legenda || '', access_token: IG_TOKEN,
  });
  if (c.error) throw new Error(`container do carrossel: ${c.error.message}`);
  // Foto indexa rápido, mas o container do carrossel só publica depois de FINISHED.
  for (let i = 0; i < 12; i++) {
    const u = new URL(`${API}/${c.id}`);
    u.searchParams.set('fields', 'status_code');
    u.searchParams.set('access_token', IG_TOKEN);
    const s = await (await fetch(u)).json();
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('processamento do carrossel falhou');
    await dorme(5000);
  }
  return c.id;
}

async function publicaCriacao(creation) {
  let pub = await post(`${API}/${IG_USER_ID}/media_publish`, { creation_id: creation, access_token: IG_TOKEN });
  // "Media ID is not available" é transitório: o Instagram ainda está indexando.
  for (let i = 0; i < 2 && !pub.id && JSON.stringify(pub).includes('not available'); i++) {
    await dorme(8000);
    pub = await post(`${API}/${IG_USER_ID}/media_publish`, { creation_id: creation, access_token: IG_TOKEN });
  }
  if (!pub.id) throw new Error(`publish: ${JSON.stringify(pub)}`);
  return pub.id;
}

async function publica(item) {
  const ehVideo = item.tipo === 'reels' || item.tipo === 'video';
  const cria = { access_token: IG_TOKEN };
  if (item.tipo === 'carrossel') return publicaCriacao(await criaCarrossel(item));
  if (ehVideo) {
    cria.video_url = item.midia;
    cria.media_type = 'REELS';
    cria.caption = item.legenda || '';
  } else if (item.tipo === 'story') {
    cria.image_url = item.midia;
    cria.media_type = 'STORIES';   // story por API não aceita caption nem sticker
  } else {
    cria.image_url = item.midia;
    cria.caption = item.legenda || '';
  }

  const criado = await post(`${API}/${IG_USER_ID}/media`, cria);
  if (criado.error) throw new Error(`container: ${criado.error.message}`);
  const creation = criado.id;

  // Reels precisa terminar de processar antes do publish. Aqui a espera é
  // barata: segura só este job do Actions, não um banco de dados.
  if (ehVideo) {
    for (let i = 0; i < 60; i++) {
      await dorme(5000);
      const u = new URL(`${API}/${creation}`);
      u.searchParams.set('fields', 'status_code');
      u.searchParams.set('access_token', IG_TOKEN);
      const s = await (await fetch(u)).json();
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR') throw new Error('processamento do vídeo falhou');
      if (i === 59) throw new Error('tempo esgotado esperando o vídeo processar');
    }
  }

  let pub = await post(`${API}/${IG_USER_ID}/media_publish`, { creation_id: creation, access_token: IG_TOKEN });
  // "Media ID is not available" é transitório: o Instagram ainda está indexando.
  if (!pub.id && JSON.stringify(pub).includes('not available')) {
    await dorme(8000);
    pub = await post(`${API}/${IG_USER_ID}/media_publish`, { creation_id: creation, access_token: IG_TOKEN });
  }
  if (!pub.id) throw new Error(`publish: ${JSON.stringify(pub)}`);
  return pub.id;
}

// ── Facebook Reels (13/09/2026, pedido do Marcelo) ────────────────────────────
// A Página do Facebook existia com 0 seguidores e nada postado. No Facebook, Reels é o
// formato que o algoritmo entrega pra quem NÃO segue — então cada Reel do Insta sai também
// lá. A opção "compartilhar no Facebook" do app NÃO vale pra post feito por API; por isso
// é feito aqui, pela API de Reels da Página (start → upload por file_url → finish).
// O IG_TOKEN é token de USUÁRIO com pages_manage_posts (medido no saude.yml em 13/09);
// dele sai o token da Página. ⚠️ Falha aqui NUNCA marca o post como falho: o Reel do
// Insta já está no ar. O erro fica no item (erro_facebook).
const PAGINA_FB = process.env.FB_PAGE_ID;   // só o instagram.yml define → outra conta nunca posta aqui
let tokenPagina = null;

async function tokenDaPagina() {
  if (tokenPagina) return tokenPagina;
  const u = new URL(`${API}/${PAGINA_FB}`);
  u.searchParams.set('fields', 'access_token');
  u.searchParams.set('access_token', IG_TOKEN);
  const d = await (await fetch(u)).json();
  if (!d.access_token) throw new Error(`token da Página: ${d.error?.message || 'não veio'}`);
  tokenPagina = d.access_token;
  return tokenPagina;
}

// Só Reels publicados a partir do das 18h de 13/09 (o primeiro teste). Sem esse corte o
// robô repostaria o acervo inteiro do Insta de uma vez.
const FB_DESDE = '2026-09-13T20:00:00.000Z';
// Uma tentativa por Reel: se falhou, o erro fica no item e ele não é tentado de novo sozinho.
const pendenteFb = i => Boolean(PAGINA_FB) && (i.tipo === 'reels' || i.tipo === 'video')
  && i.status === 'publicado' && !i.id_facebook && !i.erro_facebook && (i.publicado_em || '') >= FB_DESDE;

// 17/09/2026: os 11 primeiros Reels publicaram com success:true e ficaram TODOS em 0
// visualizacoes (nem 1 de 3s) mesmo com a Pagina "Recomendavel". A colecao oficial da Meta
// (fbsamples/Facebook-Reels-Publishing-API-Postman-Collection) tem 5 passos - Create, Upload,
// **Get upload session status**, Publish - e o nosso codigo pulava direto do upload pro
// finish, sem nunca esperar o processing_phase terminar. Ver memoria `facebook-reels-automatico`.
async function statusDoVideo(videoId, tk) {
  const u = new URL(`${API}/${videoId}`);
  u.searchParams.set('fields', 'status');
  u.searchParams.set('access_token', tk);
  return (await (await fetch(u)).json()).status || {};
}

async function esperaProcessar(videoId, tk) {
  for (let t = 0; t < 30; t++) {           // ate ~5min (30 x 10s) - Reel de 40-50s costuma levar segundos
    const st = await statusDoVideo(videoId, tk);
    const fase = st.processing_phase?.status;
    if (fase === 'complete' || fase === 'error' || st.video_status === 'ready') {
      if (fase === 'error') throw new Error(`processamento falhou: ${JSON.stringify(st).slice(0, 200)}`);
      return st;
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error('processamento nao terminou em 5min - nao publicando incompleto');
}

// 17/09/2026: nunca mandar pro Facebook o MESMO arquivo (bytes identicos) que acabou de sair
// no Insta minutos antes - conteudo repostado identico entre redes e fator que reduz
// distribuicao organica (doc oficial da Meta + guias de crescimento). O lote semanal gera uma
// variante com zoom/crop sutil (_variante-facebook.js, 0cr) e a URL fica em midia_facebook;
// sem ela (item antigo, ou slug fora do lote), cai no arquivo original mesmo.
async function publicaNoFacebook(item) {
  const tk = await tokenDaPagina();
  const ini = await post(`${API}/${PAGINA_FB}/video_reels`, { upload_phase: 'start', access_token: tk });
  if (!ini.video_id) throw new Error(`start: ${JSON.stringify(ini).slice(0, 200)}`);
  const midiaFb = item.midia_facebook || item.midia;
  const up = await (await fetch(`https://rupload.facebook.com/video-upload/v21.0/${ini.video_id}`, {
    method: 'POST', headers: { Authorization: `OAuth ${tk}`, file_url: midiaFb },
  })).json();
  if (!up.success) throw new Error(`upload: ${JSON.stringify(up).slice(0, 200)}`);
  await esperaProcessar(ini.video_id, tk);   // NUNCA publicar antes disso - e a causa dos 0 views
  const fim = await post(`${API}/${PAGINA_FB}/video_reels`, {
    upload_phase: 'finish', video_id: ini.video_id, video_state: 'PUBLISHED',
    description: legendaFacebook(item.legenda), access_token: tk,
  });
  if (!fim.success) throw new Error(`finish: ${JSON.stringify(fim).slice(0, 200)}`);
  return ini.video_id;
}

// Os horários da grade, em UTC: 08h, 14h, 18h e 21h BRT.
// É para cá que vai um post que perdeu a hora — nunca para um horário fora da grade.
const SLOTS_UTC = [11, 17, 21, 0];

// Primeiro horário da grade, depois de `apartir`, que ainda não tem nada marcado.
// Procura por 7 dias; se não achar (fila cheia), aí sim o item é dado como perdido.
function proximoSlotLivre(fila, apartir) {
  const ocupado = new Set(fila.filter(i => i.status !== 'perdido').map(i => i.quando));
  for (let d = 0; d <= 7; d++) {
    for (const h of SLOTS_UTC) {
      const t = new Date(apartir);
      t.setUTCHours(0, 0, 0, 0);
      t.setUTCDate(t.getUTCDate() + d);
      t.setUTCHours(h, 0, 0, 0);
      const iso = t.toISOString();
      // margem de 20 min: não adianta marcar para daqui a 1 minuto e perder de novo
      if (t.getTime() < apartir + 20 * 60 * 1000) continue;
      if (!ocupado.has(iso)) return iso;
    }
  }
  return null;
}

const fila = JSON.parse(fs.readFileSync(FILA, 'utf8'));
const substituicoesProjetor = substituiKindlePorProjetor(fila);
const agora = Date.now();
const vencidos = fila.filter(i => i.status === 'agendado' && new Date(i.quando).getTime() <= agora);

// ── BATIMENTO (28/08/2026) ───────────────────────────────────────────────────
// O `saude.yml` deveria avisar quando post fica para trás, mas ele roda pelo MESMO
// cron do GitHub que às vezes engasga — quando o publicador para, o vigia para junto
// e ninguém é avisado. Foi o que houve em 27 e 28/08: 4 posts perdidos em silêncio.
// Aqui o próprio publicador registra quando rodou e grita no retorno se ficou tempo
// demais fora do ar. Não previne a falha do GitHub, mas garante que ela seja VISTA.
const BATIMENTO = new URL('./ultima-rodada.json', import.meta.url);
const MAX_GAP_H = 4;   // o cron dispara de 20 em 20 min nas horas ativas
let gapAviso = null;
try {
  const ant = JSON.parse(fs.readFileSync(BATIMENTO, 'utf8'));
  const gapH = (agora - new Date(ant.em).getTime()) / 3600000;
  if (gapH > MAX_GAP_H) {
    gapAviso = `⚠️ O publicador ficou ${gapH.toFixed(1)}h sem rodar (última: ${ant.em}). ` +
      `O cron do GitHub não disparou nesse intervalo — confira se algum post foi reagendado.`;
    console.error(gapAviso);
  }
} catch { /* primeira execução: não há batimento anterior */ }
// ⚠️ NUNCA gravar o batimento em ensaio a seco (29/08/2026): rodar `--seco` na máquina
// carimbaria "o publicador rodou agora" e APAGARIA a prova de um buraco real no cron —
// o alarme mentiria justamente no dia em que ele importa. Teste não altera evidência.
if (!SECO) {
  try {
    fs.writeFileSync(BATIMENTO, JSON.stringify({ em: new Date(agora).toISOString() }, null, 2) + '\n', 'utf8');
  } catch (e) { console.error('não deu para gravar o batimento:', e.message); }
}

console.log(`fila: ${fila.length} · vencidos agora: ${vencidos.length}`);
// Sai cedo quando não há nada vencido — mas se o cron ficou horas fora do ar, o job
// precisa FALHAR mesmo assim, senão o e-mail de alerta não chega.
if (!vencidos.length && !fila.some(pendenteFb)) process.exit(gapAviso ? 1 : 0);

if (SECO) {
  for (const i of vencidos) console.log(`[seco] ${i.quando} ${i.tipo} ${String([].concat(i.midia)[0]).slice(0, 60)}…`);
  for (const i of fila.filter(pendenteFb)) console.log(`[seco] facebook: ${i.slug}`);
  process.exit(0);
}

await confereConta();

let mudou = substituicoesProjetor > 0;
// ⚠️ 29/08/2026: o job media sucesso pelo TOTAL de falhas da fila — e falha antiga
// nunca sai de lá. Com duas falhas de 19 e 21/08 paradas, TODA rodada que publicava
// terminava vermelha (39 de 100). Vermelho constante = ninguém olha, e foi assim que
// as manhãs comidas pelo cron passaram batido. Agora só conta o que falhou AGORA.
let falhasAgora = 0;
for (const item of vencidos) {
  // Item vencido há mais de 6h não sai atrasado: post fora de hora atrapalha mais do
  // que ajuda. Mas DESCARTAR também não serve — em 27 e 28/08/2026 o cron do GitHub
  // engasgou dois dias seguidos e isso custou 4 posts, que simplesmente morreram.
  // Agora ele vai para o próximo slot LIVRE da grade em vez de virar lixo.
  if (agora - new Date(item.quando).getTime() > 6 * 3600 * 1000) {
    const novo = proximoSlotLivre(fila, agora);
    if (novo) {
      console.log(`REAGENDADO (venceu há mais de 6h): ${item.quando} -> ${novo}`);
      // O funde-fila.mjs usa isto para descartar a cópia do horário velho que ainda está no
      // GitHub. Sem isso ela voltava viva na fusão e o post saía repetido (12/09/2026).
      item.quando_anterior = item.quando;
      item.quando = novo;
      item.reagendado_em = new Date().toISOString();
      item.motivo_reagendamento = 'cron nao disparou no horario original';
    } else {
      item.status = 'perdido';
      item.erro = 'venceu há mais de 6h e não havia slot livre em 7 dias';
      console.log(`PERDIDO (sem slot livre): ${item.quando}`);
    }
    mudou = true;
    continue;
  }
  try {
    console.log(`publicando ${item.quando} (${item.tipo})…`);
    const id = await publica(item);
    item.status = 'publicado';
    item.id_instagram = id;
    item.publicado_em = new Date().toISOString();
    mudou = true;
    console.log(`  PUBLICADO: ${id}`);

    // Story não aceita comentário — só reels/feed.
    if (item.tipo !== 'story') {
      try {
        item.id_comentario = await comenta(id);
        console.log(`  COMENTADO: ${item.id_comentario}`);
      } catch (e) {
        item.erro_comentario = String(e.message || e).slice(0, 300);
        console.error(`  ⚠️ comentário falhou (o post está no ar): ${item.erro_comentario}`);
      }
    }
  } catch (e) {
    item.status = 'falhou';
    item.erro = String(e.message || e).slice(0, 400);
    mudou = true;
    falhasAgora++;
    console.error(`  FALHOU: ${item.erro}`);
  }
}

// Facebook depois do Insta: pega o que acabou de sair E o que saiu numa rodada anterior
// sem ter ido pro Facebook (foi assim que o Reel das 18h de 13/09 virou o primeiro).
for (const item of fila.filter(pendenteFb)) {
  try {
    item.id_facebook = await publicaNoFacebook(item);
    console.log(`  FACEBOOK: ${item.slug} → ${item.id_facebook}`);
  } catch (e) {
    item.erro_facebook = String(e.message || e).slice(0, 300);
    console.error(`  ⚠️ Facebook falhou (o Reel do Insta está no ar): ${item.erro_facebook}`);
  }
  mudou = true;
}

if (mudou) fs.writeFileSync(FILA, JSON.stringify(fila, null, 2) + '\n', 'utf8');
const falhas = fila.filter(i => i.status === 'falhou').length;   // histórico, só para o resumo
console.log(`\nresumo: ${fila.filter(i => i.status === 'publicado').length} publicados · ${falhas} falhas · ${fila.filter(i => i.status === 'agendado').length} na fila`);
// O e-mail do GitHub só chega quando o job falha — então um buraco no cron precisa
// derrubar o job, senão continua sendo descoberto pelo Marcelo olhando o feed.
if (gapAviso) console.error(`\n${gapAviso}`);
if (falhasAgora || gapAviso) process.exitCode = 1;
