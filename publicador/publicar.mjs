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

async function publica(item) {
  const ehVideo = item.tipo === 'reels' || item.tipo === 'video';
  const cria = { access_token: IG_TOKEN };
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
try {
  fs.writeFileSync(BATIMENTO, JSON.stringify({ em: new Date(agora).toISOString() }, null, 2) + '\n', 'utf8');
} catch (e) { console.error('não deu para gravar o batimento:', e.message); }

console.log(`fila: ${fila.length} · vencidos agora: ${vencidos.length}`);
// Sai cedo quando não há nada vencido — mas se o cron ficou horas fora do ar, o job
// precisa FALHAR mesmo assim, senão o e-mail de alerta não chega.
if (!vencidos.length) process.exit(gapAviso ? 1 : 0);

if (SECO) {
  for (const i of vencidos) console.log(`[seco] ${i.quando} ${i.tipo} ${i.midia.slice(0, 60)}…`);
  process.exit(0);
}

await confereConta();

let mudou = false;
for (const item of vencidos) {
  // Item vencido há mais de 6h não sai atrasado: post fora de hora atrapalha mais do
  // que ajuda. Mas DESCARTAR também não serve — em 27 e 28/08/2026 o cron do GitHub
  // engasgou dois dias seguidos e isso custou 4 posts, que simplesmente morreram.
  // Agora ele vai para o próximo slot LIVRE da grade em vez de virar lixo.
  if (agora - new Date(item.quando).getTime() > 6 * 3600 * 1000) {
    const novo = proximoSlotLivre(fila, agora);
    if (novo) {
      console.log(`REAGENDADO (venceu há mais de 6h): ${item.quando} -> ${novo}`);
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
    console.error(`  FALHOU: ${item.erro}`);
  }
}

if (mudou) fs.writeFileSync(FILA, JSON.stringify(fila, null, 2) + '\n', 'utf8');
const falhas = fila.filter(i => i.status === 'falhou').length;
console.log(`\nresumo: ${fila.filter(i => i.status === 'publicado').length} publicados · ${falhas} falhas · ${fila.filter(i => i.status === 'agendado').length} na fila`);
// O e-mail do GitHub só chega quando o job falha — então um buraco no cron precisa
// derrubar o job, senão continua sendo descoberto pelo Marcelo olhando o feed.
if (gapAviso) console.error(`\n${gapAviso}`);
if (falhas || gapAviso) process.exitCode = 1;
