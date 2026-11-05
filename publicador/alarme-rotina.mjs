// alarme-rotina.mjs — avisa quando uma conversa de ROTINA está ESPERANDO resposta nossa há mais de 1 hora.
//
// POR QUE EXISTE (05/11/2026, Direção): a 1ª resposta ao ROTINA já sai em 0 h (automação), mas a conversa que
// vem DEPOIS é humana e ninguém era avisado quando a pessoa respondia. Em 22/10 uma pessoa respondeu e ficou
// 14 dias sem resposta. SÓ LEITURA: não responde, não comenta, não manda DM.
//
// COMO AVISA: sai com código 1 → o job do GitHub fica vermelho → o GitHub manda e-mail (mesmo mecanismo do
// saude.yml). O log e o e-mail só têm CONTAGEM, uma referência opaca por conversa (hash, não reversível) e o vídeo
// em que a pessoa comentou. NUNCA nome, @ nem texto. O repositório é PÚBLICO.
//
// PARA NÃO VIRAR "ALARME QUE TOCA SEMPRE" (lição de 29/08):
//  - conversa em que a pessoa disse que não quer sai da lista (status "recusou");
//  - conversa sem resposta há mais de JANELA_H horas (padrão 168 = 7 dias) sai da lista (status "expirada");
//  - uma conversa na lista pode ser silenciada pondo a referência dela em publicador/rotina-alarme-ignorar.json;
//  - fora a 1ª hora de espera, só toca nos horários de 8h, 12h, 16h e 20h (BRT), em vez de toda hora.
//
//   node publicador/alarme-rotina.mjs [--teste] [--autoteste]
//   --teste: ignora a regra de horário, grava o relatório e NÃO falha (usado pra provar que dispararia).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://graph.facebook.com/v21.0';
const TESTE = process.argv.includes('--teste');
const AUTOTESTE = process.argv.includes('--autoteste');
const MEU = (process.env.IG_USERNAME || 'neuralupdate').toLowerCase();
const JANELA_H = Number(process.env.ALARME_JANELA_H || 168);
const ESPERA_H = 1;
const SAIDA = process.env.ALARME_SAIDA || path.join(AQUI, 'rotina-alarme-teste.json');

const EXATA = /(^|[^\p{L}])rotina([^\p{L}]|$)/iu;
const APROX = /rotin/i;
const abertura = t => /voc[eê] comentou rotina/i.test(t || '');
const RECUSA = /(n[aã]o\s+(quero|tenho\s+interesse|me\s+interessa|vou)|sem\s+interesse|(pode\s+)?parar|para\s+de\s+(me\s+)?(mandar|enviar)|desisti|desisto|n[aã]o\s+preciso|deixa\s+pra\s+l[aá]|me\s+tira|stop)/i;

// Núcleo puro e testável.
// conv = { id, msgs:[{de:'nos'|'pessoa', em, texto}] } (texto só vive em memória; nunca sai daqui)
export function avalia(conv, agora, janelaH = JANELA_H) {
  const ms = [...conv.msgs].sort((a, b) => new Date(a.em) - new Date(b.em));
  const eRotina = ms.some(m => (m.de === 'pessoa' && (EXATA.test(m.texto) || APROX.test(m.texto))) || (m.de === 'nos' && abertura(m.texto)));
  if (!eRotina || !ms.length) return { estado: 'fora' };
  const ultima = ms[ms.length - 1];
  if (ultima.de === 'nos') return { estado: 'ok' };            // a bola está com a pessoa
  const dela = ms.filter(m => m.de === 'pessoa');
  if (RECUSA.test(dela[dela.length - 1].texto || '')) return { estado: 'recusou' };
  const h = (agora - new Date(ultima.em)) / 3600000;
  if (h < ESPERA_H) return { estado: 'recente', horas: h };
  if (h > janelaH) return { estado: 'expirada', horas: h };
  return { estado: 'esperando', horas: h, ultima_em: ultima.em };
}

export const ref = id => crypto.createHash('sha256').update('rotina|' + id).digest('hex').slice(0, 8);
export function deveTocarAgora(horas, horaBRT) {
  return horas < 2 || [8, 12, 16, 20].includes(horaBRT);
}

if (AUTOTESTE) {
  const agora = new Date('2026-11-06T00:00:00Z');
  const h = (d) => new Date(agora - d * 3600000).toISOString();
  const t = (msgs) => ({ id: 'x', msgs });
  const casos = [
    ['espera 14 dias (janela 720)', avalia(t([{ de: 'nos', em: h(340), texto: 'Você comentou ROTINA' }, { de: 'pessoa', em: h(336), texto: 'tenho um A12' }]), agora, 720).estado, 'esperando'],
    ['mesma, janela padrão 168 h', avalia(t([{ de: 'nos', em: h(340), texto: 'Você comentou ROTINA' }, { de: 'pessoa', em: h(336), texto: 'tenho um A12' }]), agora, 168).estado, 'expirada'],
    ['última é nossa', avalia(t([{ de: 'pessoa', em: h(50), texto: 'rotina' }, { de: 'nos', em: h(49), texto: 'oi' }]), agora).estado, 'ok'],
    ['pessoa há 30 min', avalia(t([{ de: 'nos', em: h(5), texto: 'Você comentou ROTINA' }, { de: 'pessoa', em: h(0.5), texto: 'oi' }]), agora).estado, 'recente'],
    ['pessoa disse não quero', avalia(t([{ de: 'nos', em: h(30), texto: 'Você comentou ROTINA' }, { de: 'pessoa', em: h(20), texto: 'Não quero, obrigado' }]), agora).estado, 'recusou'],
    ['não é conversa de rotina', avalia(t([{ de: 'pessoa', em: h(10), texto: 'oi, tudo bem?' }]), agora).estado, 'fora'],
    ['pessoa mandou ROTINA direto', avalia(t([{ de: 'pessoa', em: h(3), texto: 'ROTINA' }]), agora).estado, 'esperando'],
  ];
  for (const [nome, got, want] of casos) if (got !== want) throw new Error(`autoteste "${nome}": veio ${got}, esperado ${want}`);
  if (!deveTocarAgora(1.5, 3) || deveTocarAgora(5, 3) || !deveTocarAgora(5, 12)) throw new Error('regra de horário falhou');
  console.log('autoteste alarme-rotina: OK (' + casos.length + ' casos)');
  process.exit(0);
}

const IG_USER_ID = process.env.IG_USER_ID;
const IG_TOKEN = process.env.IG_TOKEN;
if (!IG_USER_ID || !IG_TOKEN) { console.error('faltam IG_USER_ID / IG_TOKEN'); process.exit(1); }

const get = async (caminho, params = {}) => {
  const u = new URL(caminho.startsWith('http') ? caminho : API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', IG_TOKEN);
  return (await fetch(u)).json();
};

async function paginas(primeira, max = 40) {
  const todos = [];
  let p = primeira;
  for (let i = 0; i < max; i++) {
    if (p.error) return { itens: todos, erro: (p.error.message || 'erro').slice(0, 160) };
    todos.push(...(p.data || []));
    if (!p.paging?.next) break;
    p = await get(p.paging.next);
  }
  return { itens: todos, erro: null };
}

async function main() {
  const agora = new Date();
  const conv = await paginas(await get(`/${IG_USER_ID}/conversations`, {
    platform: 'instagram', limit: '50',
    fields: 'id,participants,messages.limit(25){message,from,created_time}',
  }));
  if (conv.erro) { console.error('⚠️ conversas indisponíveis: ' + conv.erro); process.exit(TESTE ? 0 : 1); }

  // vídeo em que a pessoa comentou ROTINA (opcional; o nome fica só em memória)
  const fila = JSON.parse(fs.readFileSync(path.join(AQUI, 'fila.json'), 'utf8'));
  const desde = new Date(agora - 40 * 24 * 3600 * 1000);
  const videoPorPessoa = new Map();
  for (const r of fila.filter(x => x.tipo === 'reels' && x.id_instagram && new Date(x.publicado_em || x.quando) >= desde && /rotina/i.test((x.comentario || '') + (x.legenda || '')))) {
    const cs = await paginas(await get(`/${r.id_instagram}/comments`, { fields: 'text,username', limit: '100' }), 10);
    for (const c of cs.itens) if ((c.username || '').toLowerCase() !== MEU && (EXATA.test(c.text || '') || APROX.test(c.text || ''))) videoPorPessoa.set((c.username || '').toLowerCase(), r.slug);
  }

  let ignorar = new Set();
  try { ignorar = new Set(JSON.parse(fs.readFileSync(path.join(AQUI, 'rotina-alarme-ignorar.json'), 'utf8'))); } catch { /* sem arquivo = ninguém ignorado */ }

  const horaBRT = new Date(agora.getTime() - 3 * 3600 * 1000).getUTCHours();
  const contagem = { lidas: conv.itens.length, esperando: 0, recusou: 0, expirada: 0, ok: 0, recente: 0, silenciadas: 0 };
  const lista = [];
  for (const c of conv.itens) {
    const outros = (c.participants?.data || []).map(p => (p.username || '').toLowerCase()).filter(n => n && n !== MEU);
    const msgs = (c.messages?.data || []).map(m => ({ de: (m.from?.username || '').toLowerCase() === MEU ? 'nos' : 'pessoa', em: m.created_time, texto: m.message || '' }));
    const a = avalia({ id: c.id, msgs }, agora);
    if (a.estado === 'fora') continue;
    if (a.estado === 'esperando' && ignorar.has(ref(c.id))) { contagem.silenciadas++; continue; }
    contagem[a.estado] = (contagem[a.estado] || 0) + 1;
    if (a.estado === 'esperando') lista.push({ ref: ref(c.id), video: videoPorPessoa.get(outros[0]) || 'dm_direta', horas: Math.round(a.horas), toca: deveTocarAgora(a.horas, horaBRT) });
  }
  lista.sort((x, y) => y.horas - x.horas);
  const tocam = lista.filter(l => l.toca);
  console.log(`ROTINA alarme: ${JSON.stringify(contagem)} | esperando=${lista.length} | tocam_agora=${tocam.length} | janela=${JANELA_H}h | hora_BRT=${horaBRT}`);
  for (const l of lista) console.log(`  ESPERANDO ref=${l.ref} video=${l.video} horas=${l.horas}${l.toca ? ' [TOCA]' : ''}`);

  if (TESTE) {
    fs.writeFileSync(SAIDA, JSON.stringify({ gerado_em: agora.toISOString(), janela_h: JANELA_H, contagem, esperando: lista, dispararia: lista.length > 0 }, null, 1) + '\n', 'utf8');
    console.log('modo teste: ' + (lista.length ? 'O ALARME DISPARARIA' : 'nada esperando'));
    return;
  }
  if (tocam.length) {
    console.error(`::error::${tocam.length} conversa(s) de ROTINA esperando resposta há mais de ${ESPERA_H} h`);
    process.exit(1);
  }
}

main().catch(e => { console.error('ERRO no alarme ROTINA: ' + (e.message || e)); process.exit(1); });
