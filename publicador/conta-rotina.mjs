// conta-rotina.mjs — conta os comentários "ROTINA" dos Reels do Instagram e quantos já têm resposta.
//
// POR QUE EXISTE (16/10/2026, ordem da Direção): a semana do Rotina que Paga tem como meta o máximo
// de comentários ROTINA, e NENHUM pode ficar sem resposta. O IG_TOKEN só existe no GitHub, então a
// contagem (12h, 18h e 22h BRT) roda aqui, no Actions, e acrescenta linhas em
// `publicador/rotina-contagem.jsonl`. SÓ LEITURA: não comenta, não manda DM, não mexe na fila.
//
// "respondidos" = quem comentou ROTINA e já recebeu uma DM nossa (conversa que abre com
// "Você comentou ROTINA") OU uma resposta pública da própria conta.
// "dm_enviadas" = conversas nossas que abrem com "Você comentou ROTINA" entre quem comentou.
// Se a API de mensagens recusar (permissão do token), dm_enviadas sai null e o motivo vai em `erro_dm`.
// Nenhum nome de usuário é gravado: só contagens.
//
//   node publicador/conta-rotina.mjs [--seco] [--autoteste]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://graph.facebook.com/v21.0';
const SECO = process.argv.includes('--seco');
const AUTOTESTE = process.argv.includes('--autoteste');
const SAIDA = process.env.ROTINA_SAIDA || path.join(AQUI, 'rotina-contagem.jsonl');
const MEU_USUARIO = (process.env.IG_USERNAME || 'neuralupdate').toLowerCase();

const PALAVRA = /(^|[^\p{L}])rotina([^\p{L}]|$)/iu;
export const ehRotina = texto => PALAVRA.test(texto || '');
const abreComRotina = texto => /voc[eê] comentou rotina/i.test(texto || '');

// BRT = UTC-3, escrito no formato do arquivo da Direção: 2026-10-16T12:00-03:00
function quandoBRT(d = new Date()) {
  const b = new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 16);
  return `${b}-03:00`;
}

// Núcleo puro (testável): comentários + usuários com DM nossa -> números
export function contaVideo(comentarios, usuariosComDm, meuUsuario = MEU_USUARIO) {
  let rotina = 0, respondidos = 0, dm = 0;
  for (const c of comentarios) {
    if (!ehRotina(c.text)) continue;
    if ((c.username || '').toLowerCase() === meuUsuario) continue; // nosso próprio comentário fixo
    rotina++;
    const respostaPublica = (c.replies?.data || []).some(r => (r.username || '').toLowerCase() === meuUsuario);
    const temDm = usuariosComDm?.has((c.username || '').toLowerCase());
    if (temDm) dm++;
    if (respostaPublica || temDm) respondidos++;
  }
  return { rotina, respondidos, dm_enviadas: dm };
}

if (AUTOTESTE) {
  const dms = new Set(['ana', 'bia']);
  const r = contaVideo([
    { text: 'ROTINA', username: 'ana' },
    { text: 'rotina!', username: 'bia', replies: { data: [{ username: 'neuralupdate' }] } },
    { text: 'quero rotina', username: 'caio' },
    { text: 'Comenta ROTINA aqui que eu te explico', username: 'neuralupdate' },
    { text: 'rotinas de estudo', username: 'dani' },
    { text: 'que legal', username: 'edu' },
  ], dms);
  if (r.rotina !== 3 || r.respondidos !== 2 || r.dm_enviadas !== 2) throw new Error('autoteste falhou ' + JSON.stringify(r));
  console.log('autoteste conta-rotina: OK');
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

async function comentarios(idMidia) {
  const todos = [];
  let pagina = await get(`/${idMidia}/comments`, { fields: 'id,text,username,timestamp,replies{id,username}', limit: '100' });
  for (let i = 0; i < 10; i++) {
    if (pagina.error) throw new Error(`comentários ${idMidia}: ${(pagina.error.message || '').slice(0, 160)}`);
    todos.push(...(pagina.data || []));
    if (!pagina.paging?.next) break;
    pagina = await get(pagina.paging.next);
  }
  return todos;
}

// Usuários que já têm uma DM nossa "Você comentou ROTINA…". Devolve { usuarios:Set, erro }.
async function usuariosComDm() {
  const usuarios = new Set();
  let pagina = await get(`/${IG_USER_ID}/conversations`, {
    platform: 'instagram', limit: '50',
    fields: 'participants,messages.limit(5){message,from,created_time}',
  });
  for (let i = 0; i < 20; i++) {
    if (pagina.error) return { usuarios, erro: (pagina.error.message || 'erro').slice(0, 160) };
    for (const conv of pagina.data || []) {
      const abriu = (conv.messages?.data || []).some(m => abreComRotina(m.message));
      if (!abriu) continue;
      for (const p of conv.participants?.data || []) {
        const nome = (p.username || '').toLowerCase();
        if (nome && nome !== MEU_USUARIO) usuarios.add(nome);
      }
    }
    if (!pagina.paging?.next) break;
    pagina = await get(pagina.paging.next);
  }
  return { usuarios, erro: null };
}

async function main() {
  // slug <- id do Reel, pela fila; só entram vídeos com o pedido ROTINA (campo `comentario` ou legenda)
  const fila = JSON.parse(fs.readFileSync(path.join(AQUI, 'fila.json'), 'utf8'));
  const porId = new Map();
  for (const x of fila) {
    if (x.tipo === 'reels' && x.id_instagram && /rotina/i.test((x.comentario || '') + (x.legenda || ''))) porId.set(x.id_instagram, x.slug);
  }
  if (!porId.size) { console.log('nenhum Reel com pedido ROTINA publicado ainda'); return; }

  const { usuarios, erro } = await usuariosComDm();
  if (erro) console.error('⚠️ conversas indisponíveis: ' + erro);

  const quando = quandoBRT();
  const linhas = [];
  for (const [id, slug] of porId) {
    const cs = await comentarios(id);
    const n = contaVideo(cs, erro ? null : usuarios);
    const linha = { quando, rede: 'ig', video: slug, rotina: n.rotina, respondidos: n.respondidos, dm_enviadas: erro ? null : n.dm_enviadas };
    if (erro) linha.erro_dm = erro;
    linhas.push(linha);
  }
  const texto = linhas.map(l => JSON.stringify(l)).join('\n') + '\n';
  console.log(texto.trim());
  const tot = linhas.reduce((a, l) => ({ r: a.r + l.rotina, p: a.p + l.respondidos }), { r: 0, p: 0 });
  console.log(`TOTAL ROTINA=${tot.r} respondidos=${tot.p} sem_resposta=${tot.r - tot.p}`);
  if (!SECO) fs.appendFileSync(SAIDA, texto, 'utf8');
}

main().catch(e => { console.error('ERRO na contagem ROTINA: ' + (e.message || e)); process.exit(1); });
