// Ciclo diário de Stories da @reparumtech.
//
// A agenda tem somente os seis produtos ativos e se repete por dia. O estado
// registra cada publicação por data + horário + produto: reexecuções dos crons
// de segurança não duplicam Story. Nenhum arquivo local é necessário no runner.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const AGENDA_PATH = path.join(AQUI, 'reparum-agenda.json');
const ESTADO_PATH = path.join(AQUI, 'reparum-estado.json');
const API = 'https://graph.facebook.com/v21.0';
const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
const CONTA = process.env.IG_CONTA || 'reparumtech';

const argumentos = process.argv.slice(2);
const posSlot = argumentos.indexOf('--slot');
const slotForcado = posSlot >= 0 ? argumentos[posSlot + 1] : null;
const apenasValidar = argumentos.includes('--validar') || slotForcado === 'validar';
const apenasConferirToken = argumentos.includes('--conferir-token') || slotForcado === 'conferir-token';
const seco = argumentos.includes('--seco');

if (!apenasValidar && !seco && (!IG_USER_ID || !IG_TOKEN)) {
  throw new Error('faltam IG_USER_ID ou IG_TOKEN');
}

const agenda = JSON.parse(fs.readFileSync(AGENDA_PATH, 'utf8'));
const estado = fs.existsSync(ESTADO_PATH)
  ? JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8'))
  : { publicados: {}, falhas: {} };

function agoraLocal() {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: agenda.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  );
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: partes.hour,
    minuto: partes.minute
  };
}

function leDimensoesJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('arquivo remoto não é JPEG');
  }
  let i = 2;
  while (i + 8 < buffer.length) {
    if (buffer[i] !== 0xff) { i++; continue; }
    const marcador = buffer[i + 1];
    i += 2;
    if (marcador === 0xd8 || marcador === 0xd9) continue;
    if (i + 2 > buffer.length) break;
    const tamanho = buffer.readUInt16BE(i);
    const ehSof = (marcador >= 0xc0 && marcador <= 0xc3) ||
      (marcador >= 0xc5 && marcador <= 0xc7) ||
      (marcador >= 0xc9 && marcador <= 0xcb) ||
      (marcador >= 0xcd && marcador <= 0xcf);
    if (ehSof) {
      return { altura: buffer.readUInt16BE(i + 3), largura: buffer.readUInt16BE(i + 5) };
    }
    if (tamanho < 2) break;
    i += tamanho;
  }
  throw new Error('não foi possível ler as dimensões do JPEG');
}

async function validaMidia(item) {
  const resposta = await fetch(item.midia, { cache: 'no-store' });
  if (!resposta.ok) throw new Error(`URL respondeu HTTP ${resposta.status}`);
  const tipo = (resposta.headers.get('content-type') || '').toLowerCase();
  const buffer = Buffer.from(await resposta.arrayBuffer());
  const { largura, altura } = leDimensoesJpeg(buffer);
  if (!tipo.includes('image/jpeg')) throw new Error(`Content-Type inesperado: ${tipo || 'ausente'}`);
  if (largura !== 1080 || altura !== 1920) throw new Error(`dimensão ${largura}x${altura}; esperado 1080x1920`);
  console.log(`  OK ${item.nome}: JPEG ${largura}x${altura} · ${buffer.length} bytes`);
}

async function json(url, opcoes) {
  const resposta = await fetch(url, opcoes);
  const dados = await resposta.json();
  if (dados.error) throw new Error(dados.error.message);
  return dados;
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

const dorme = ms => new Promise(resolve => setTimeout(resolve, ms));

async function publicaStory(item) {
  const criar = new URL(`${API}/${IG_USER_ID}/media`);
  criar.searchParams.set('image_url', item.midia);
  criar.searchParams.set('media_type', 'STORIES');
  criar.searchParams.set('access_token', IG_TOKEN);
  const { id: creationId } = await json(criar, { method: 'POST' });

  let pronto = false;
  for (let tentativa = 1; tentativa <= 20; tentativa++) {
    await dorme(3000);
    const statusUrl = new URL(`${API}/${creationId}`);
    statusUrl.searchParams.set('fields', 'status_code');
    statusUrl.searchParams.set('access_token', IG_TOKEN);
    const status = await json(statusUrl);
    if (status.status_code === 'FINISHED') { pronto = true; break; }
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`container ${creationId}: ${status.status_code}`);
    }
  }
  if (!pronto) throw new Error(`container ${creationId} não ficou pronto em 60s`);

  const publicar = new URL(`${API}/${IG_USER_ID}/media_publish`);
  publicar.searchParams.set('creation_id', creationId);
  publicar.searchParams.set('access_token', IG_TOKEN);
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const dados = await json(publicar, { method: 'POST' });
      return dados.id;
    } catch (erro) {
      if (!/not available|temporarily|try again/i.test(erro.message) || tentativa === 3) throw erro;
      await dorme(8000);
    }
  }
}

function salvaEstado() {
  fs.writeFileSync(ESTADO_PATH, JSON.stringify(estado, null, 2) + '\n', 'utf8');
}

const local = agoraLocal();
const slots = Object.keys(agenda.slots);

if (apenasValidar) {
  console.log(`validando ${slots.flatMap(slot => agenda.slots[slot]).length} mídias da agenda`);
  for (const slot of slots) for (const item of agenda.slots[slot]) await validaMidia(item);
  console.log('agenda válida; nenhuma publicação foi feita');
  process.exit(0);
}

if (apenasConferirToken) {
  for (const slot of slots) for (const item of agenda.slots[slot]) await validaMidia(item);
  await confereConta();
  console.log('token e agenda conferidos; nenhuma publicação foi feita');
  process.exit(0);
}

const slot = slotForcado || local.hora;
if (!slots.includes(slot)) {
  console.log(`sem slot para ${local.data} ${local.hora}:${local.minuto} (${agenda.timezone})`);
  process.exit(0);
}

const itens = agenda.slots[slot];
console.log(`Reparum: ${local.data} · slot ${slot}h · ${itens.length} itens`);
for (const item of itens) await validaMidia(item);

estado.publicados[local.data] ||= {};
estado.publicados[local.data][slot] ||= {};
estado.falhas[local.data] ||= {};
estado.falhas[local.data][slot] ||= {};

const pendentes = itens.filter(item => !estado.publicados[local.data][slot][item.id]);
if (!pendentes.length) {
  console.log('slot já publicado por completo; nada a repetir');
  process.exit(0);
}

if (seco) {
  for (const item of pendentes) console.log(`[seco] publicaria ${item.nome}`);
  process.exit(0);
}

await confereConta();
let houveFalha = false;
for (const item of pendentes) {
  try {
    console.log(`publicando ${item.nome}…`);
    const id = await publicaStory(item);
    estado.publicados[local.data][slot][item.id] = {
      id_instagram: id,
      publicado_em: new Date().toISOString()
    };
    delete estado.falhas[local.data][slot][item.id];
    salvaEstado();
    console.log(`  PUBLICADO: ${id}`);
  } catch (erro) {
    houveFalha = true;
    const anterior = estado.falhas[local.data][slot][item.id] || { tentativas: 0 };
    estado.falhas[local.data][slot][item.id] = {
      tentativas: anterior.tentativas + 1,
      ultimo_erro: String(erro.message || erro).slice(0, 400),
      em: new Date().toISOString()
    };
    salvaEstado();
    console.error(`  FALHOU: ${erro.message || erro}`);
  }
}

if (houveFalha) process.exitCode = 1;
