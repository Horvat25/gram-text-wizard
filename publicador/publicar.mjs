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

const fila = JSON.parse(fs.readFileSync(FILA, 'utf8'));
const agora = Date.now();
const vencidos = fila.filter(i => i.status === 'agendado' && new Date(i.quando).getTime() <= agora);

console.log(`fila: ${fila.length} · vencidos agora: ${vencidos.length}`);
if (!vencidos.length) process.exit(0);

if (SECO) {
  for (const i of vencidos) console.log(`[seco] ${i.quando} ${i.tipo} ${i.midia.slice(0, 60)}…`);
  process.exit(0);
}

await confereConta();

let mudou = false;
for (const item of vencidos) {
  // Item vencido há mais de 6h não sai atrasado: post fora de hora atrapalha
  // mais do que ajuda, e mascara a falha. Vira 'perdido' pra aparecer no log.
  if (agora - new Date(item.quando).getTime() > 6 * 3600 * 1000) {
    item.status = 'perdido';
    item.erro = 'venceu há mais de 6h';
    mudou = true;
    console.log(`PERDIDO (atrasado demais): ${item.quando}`);
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
if (falhas) process.exitCode = 1;
