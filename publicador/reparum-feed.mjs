// Posts avulsos de FEED da @reparumtech (imagem única ou carrossel).
//
// Por que existe separado do reparum-stories.mjs: Story é uma agenda que se
// repete todo dia com os mesmos seis produtos; post de feed é datado e sai uma
// vez só. Misturar os dois numa estrutura só obrigaria a inventar "slot" para
// coisa que não tem slot.
//
// A fila é o próprio arquivo de estado: cada item guarda seu status. O workflow
// commita reparum-feed.json de volta, então uma reexecução do cron de segurança
// não republica o que já saiu.
//
//   node publicador/reparum-feed.mjs           # publica o que venceu
//   node publicador/reparum-feed.mjs --seco    # só mostra, não publica
//   node publicador/reparum-feed.mjs --validar # confere as mídias, sem token

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FILA_PATH = path.join(AQUI, 'reparum-feed.json');
const API = 'https://graph.facebook.com/v21.0';
const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
const CONTA = process.env.IG_CONTA || 'reparumtech';

// Item vencido há mais de 6h não sai atrasado: post fora de hora atrapalha mais
// do que ajuda, e sair de madrugada mascara a falha em vez de mostrar.
const MAX_ATRASO_MS = 6 * 3600 * 1000;

const seco = process.argv.includes('--seco');
const apenasValidar = process.argv.includes('--validar');

if (!seco && !apenasValidar && (!IG_USER_ID || !IG_TOKEN)) {
  throw new Error('faltam IG_USER_ID ou IG_TOKEN');
}

const fila = JSON.parse(fs.readFileSync(FILA_PATH, 'utf8'));
const itens = fila.itens || [];
const agora = process.env.REPARUM_NOW ? new Date(process.env.REPARUM_NOW) : new Date();
if (Number.isNaN(agora.getTime())) throw new Error('REPARUM_NOW inválido');

const dorme = ms => new Promise(resolve => setTimeout(resolve, ms));

async function json(url, opcoes) {
  const resposta = await fetch(url, opcoes);
  const dados = await resposta.json();
  if (dados.error) throw new Error(dados.error.message);
  return dados;
}

function leDimensoesJpeg(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('não é JPEG');
  let i = 2;
  while (i < buffer.length) {
    if (buffer[i] !== 0xff) throw new Error('JPEG malformado');
    const marcador = buffer[i + 1];
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { altura: buffer.readUInt16BE(i + 5), largura: buffer.readUInt16BE(i + 7) };
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  throw new Error('dimensão não encontrada no JPEG');
}

// O Instagram baixa a imagem do lado dele: se a URL cair ou servir outra coisa,
// o erro só aparece depois de publicado. Conferir aqui é barato.
async function validaMidia(url) {
  const resposta = await fetch(url, { cache: 'no-store' });
  if (!resposta.ok) throw new Error(`URL respondeu HTTP ${resposta.status}`);
  const tipo = (resposta.headers.get('content-type') || '').toLowerCase();
  // Vídeo não passa pela checagem de JPEG: conferimos que é mp4 de verdade e que
  // a Meta consegue baixar. O resto (codec, duração) ela valida no processamento
  // e devolve status ERROR, que o publicador já trata.
  if (tipo.includes('video/')) {
    const tam = Number(resposta.headers.get('content-length') || 0);
    if (!tipo.includes('mp4')) throw new Error(`vídeo não é mp4: ${tipo}`);
    if (tam && tam > 100 * 1024 * 1024) throw new Error(`vídeo com ${(tam/1e6).toFixed(0)} MB; o limite de Reels é 100 MB`);
    console.log(`  OK vídeo mp4 · ${(tam/1e6).toFixed(1)} MB`);
    return;
  }
  if (!tipo.includes('image/jpeg')) throw new Error(`Content-Type inesperado: ${tipo || 'ausente'}`);
  const buffer = Buffer.from(await resposta.arrayBuffer());
  const { largura, altura } = leDimensoesJpeg(buffer);
  const proporcao = largura / altura;
  // A Meta aceita de 4:5 (0,8) a 1,91:1. Fora disso ela corta por conta própria.
  if (proporcao < 0.8 || proporcao > 1.91) {
    throw new Error(`proporção ${proporcao.toFixed(2)} fora do aceito pelo feed (0,80 a 1,91)`);
  }
  console.log(`  OK ${largura}x${altura} · ${buffer.length} bytes`);
}

async function confereConta() {
  const url = new URL(`${API}/${IG_USER_ID}`);
  url.searchParams.set('fields', 'username');
  url.searchParams.set('access_token', IG_TOKEN);
  const dados = await json(url);
  if ((dados.username || '').toLowerCase() !== CONTA.toLowerCase()) {
    throw new Error(`ABORTADO: token de @${dados.username}; esperado @${CONTA}`);
  }
  console.log(`token confere: @${dados.username}`);
}

async function criaContainer(midia, extras) {
  const url = new URL(`${API}/${IG_USER_ID}/media`);
  url.searchParams.set('image_url', midia);
  for (const [chave, valor] of Object.entries(extras)) url.searchParams.set(chave, valor);
  url.searchParams.set('access_token', IG_TOKEN);
  const { id } = await json(url, { method: 'POST' });
  return id;
}

async function publicaContainer(creationId) {
  const url = new URL(`${API}/${IG_USER_ID}/media_publish`);
  url.searchParams.set('creation_id', creationId);
  url.searchParams.set('access_token', IG_TOKEN);
  try {
    const { id } = await json(url, { method: 'POST' });
    return id;
  } catch (erro) {
    // "Media ID is not available" é transitório: o Instagram ainda está
    // indexando o container. Uma segunda tentativa resolve.
    if (!/not available/i.test(erro.message)) throw erro;
    await dorme(8000);
    const { id } = await json(url, { method: 'POST' });
    return id;
  }
}

async function publica(item) {
  const midias = Array.isArray(item.midia) ? item.midia : [item.midia];

  // REELS: o container precisa terminar de processar antes do publish. Aqui a
  // espera é barata — segura só este job do Actions, não um banco.
  if (item.tipo === 'reels' || /\.mp4($|\?)/i.test(midias[0])) {
    const url = new URL(`${API}/${IG_USER_ID}/media`);
    url.searchParams.set('media_type', 'REELS');
    url.searchParams.set('video_url', midias[0]);
    url.searchParams.set('caption', item.legenda || '');
    url.searchParams.set('access_token', IG_TOKEN);
    const { id: creation } = await json(url, { method: 'POST' });
    for (let i = 1; i <= 60; i++) {
      await dorme(5000);
      const st = new URL(`${API}/${creation}`);
      st.searchParams.set('fields', 'status_code');
      st.searchParams.set('access_token', IG_TOKEN);
      const { status_code } = await json(st);
      if (status_code === 'FINISHED') break;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') {
        throw new Error(`processamento do vídeo: ${status_code}`);
      }
      if (i === 60) throw new Error('vídeo não ficou pronto em 5 min');
    }
    return publicaContainer(creation);
  }

  if (midias.length === 1) {
    const creation = await criaContainer(midias[0], { caption: item.legenda || '' });
    return publicaContainer(creation);
  }

  // Carrossel: cada filho precisa de is_carousel_item como TEXTO 'true'.
  // Com booleano no corpo, a Meta responde 9004 "Only photo or video can be
  // accepted as media type" — foi o que derrubou o carrossel de 08/08/2026.
  const filhos = [];
  for (const midia of midias) {
    filhos.push(await criaContainer(midia, { is_carousel_item: 'true' }));
  }
  const url = new URL(`${API}/${IG_USER_ID}/media`);
  url.searchParams.set('media_type', 'CAROUSEL');
  url.searchParams.set('children', filhos.join(','));
  url.searchParams.set('caption', item.legenda || '');
  url.searchParams.set('access_token', IG_TOKEN);
  const { id: creation } = await json(url, { method: 'POST' });
  return publicaContainer(creation);
}

const pendentes = itens
  .filter(item => item.status === 'agendado')
  .sort((a, b) => new Date(a.quando) - new Date(b.quando));

if (apenasValidar) {
  console.log(`validando ${pendentes.length} item(ns) agendado(s)`);
  for (const item of pendentes) {
    console.log(`${item.slug} · ${item.quando}`);
    for (const midia of [].concat(item.midia)) await validaMidia(midia);
  }
  console.log('todas as mídias válidas');
  process.exit(0);
}

const vencidos = pendentes.filter(item => new Date(item.quando) <= agora);
console.log(`fila: ${pendentes.length} agendado(s) · vencidos agora: ${vencidos.length}`);
if (!vencidos.length) process.exit(0);

if (seco) {
  for (const item of vencidos) console.log(`[seco] ${item.quando} ${item.slug}`);
  process.exit(0);
}

// Aposentar item vencido NÃO depende da Meta, então vem antes da trava de
// conta: com token quebrado o item ainda precisa sair da fila, senão ele fica
// tentando para sempre e o log some no meio das falhas.
let mudou = false;
const aPublicar = [];
for (const item of vencidos) {
  const atraso = agora - new Date(item.quando);
  if (atraso > MAX_ATRASO_MS) {
    item.status = 'perdido';
    item.motivo = `venceu há ${Math.round(atraso / 3600000)}h (limite 6h)`;
    mudou = true;
    console.log(`PERDIDO ${item.slug}: ${item.motivo}`);
  } else {
    aPublicar.push(item);
  }
}
if (mudou) fs.writeFileSync(FILA_PATH, JSON.stringify(fila, null, 2) + '\n', 'utf8');
if (!aPublicar.length) process.exit(0);

// process.exit() com fetch pendente derruba o Node no Windows com uma asserção
// do libuv. Marcar exitCode e deixar o script terminar sozinho dá o mesmo
// resultado no runner e não polui o log com falso pânico.
let contaConfere = true;
try {
  await confereConta();
} catch (erro) {
  console.error(`ABORTADO antes de publicar: ${erro.message}`);
  contaConfere = false;
  process.exitCode = 1;
}

for (const item of contaConfere ? aPublicar : []) {
  try {
    for (const midia of [].concat(item.midia)) await validaMidia(midia);
    const id = await publica(item);
    item.status = 'publicado';
    item.id_instagram = id;
    item.publicado_em = new Date().toISOString();
    console.log(`PUBLICADO ${item.slug}: ${id}`);
  } catch (erro) {
    item.status = 'falhou';
    item.erro = String(erro.message || erro).slice(0, 400);
    console.error(`FALHOU ${item.slug}: ${item.erro}`);
  }
  // Grava a cada item: se o job morrer no meio, o que já saiu não sai de novo.
  fs.writeFileSync(FILA_PATH, JSON.stringify(fila, null, 2) + '\n', 'utf8');
}

const falhas = itens.filter(item => item.status === 'falhou').length;
if (falhas) process.exit(1);
