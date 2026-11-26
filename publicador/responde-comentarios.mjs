// responde-comentarios.mjs — publica RESPOSTAS a comentários do @neuralupdate (só as aprovadas).
//
// POR QUE EXISTE (24/11/2026): relacionamento com o público. O Marcelo aprova cada resposta uma por uma
// (Direção); o IG_TOKEN só existe no GitHub, então quem posta é este workflow.
//
// ⚠️ PRIVACIDADE: o repositório é PÚBLICO. Este script NUNCA lê nem grava @ ou texto de comentário de
// terceiros. O arquivo de entrada tem só `id_comentario` (opaco) + a NOSSA resposta (que vira pública ao
// ser postada) e é APAGADO pelo workflow logo depois. A saída guarda só IDs.
//
//   node publicador/responde-comentarios.mjs [--seco]
//
// RITMO (24/11, pedido do Marcelo: "responde intercalado pra nao sermos bloqueados"): 20 respostas em 3 minutos
// parecem robô. Agora: no máximo RESPONDE_MAX (padrão 2) por rodada, com 3–8 min de pausa aleatória entre elas,
// só de dia (08h–22h BRT), nunca duas seguidas pra mesma pessoa; o que sobra FICA no arquivo de entrada e sai nas
// rodadas seguintes (o workflow roda de 30 em 30 min).
//
// Segurança: só posta item com `aprovado_em`; confere antes se o @neuralupdate já respondeu aquele
// comentário (não duplica); depois de postar, confere que a resposta aparece embaixo do comentário.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://graph.facebook.com/v21.0';
const SECO = process.argv.includes('--seco');
const ENTRADA = process.env.RESPONDE_ENTRADA || path.join(AQUI, 'respostas-pendentes.json');
const SAIDA = process.env.RESPONDE_SAIDA || path.join(AQUI, 'respostas-publicadas.json');
const MEU = (process.env.IG_USERNAME || 'neuralupdate').toLowerCase();
const IG_TOKEN = process.env.IG_TOKEN;
if (!SECO && !IG_TOKEN) { console.error('falta IG_TOKEN'); process.exit(1); }

const get = async (caminho, params = {}) => {
  const u = new URL(API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', IG_TOKEN);
  return (await fetch(u)).json();
};
const post = async (caminho, params) => {
  const u = new URL(API + caminho);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', IG_TOKEN);
  return (await fetch(u, { method: 'POST' })).json();
};
const dorme = ms => new Promise(r => setTimeout(r, ms));
const MAX = Number(process.env.RESPONDE_MAX || 2);
const PAUSA_MIN_S = Number(process.env.RESPONDE_PAUSA_MIN_S || 180);
const PAUSA_MAX_S = Number(process.env.RESPONDE_PAUSA_MAX_S || 480);
const FORCAR_HORARIO = process.env.RESPONDE_FORCAR === '1';
const pausaAleatoria = () => (PAUSA_MIN_S + Math.random() * (PAUSA_MAX_S - PAUSA_MIN_S)) * 1000;

if (!fs.existsSync(ENTRADA)) { console.log('sem arquivo de respostas pendentes: nada a fazer'); process.exit(0); }
const entrada = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
const ja = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')) : [];
// chave de controle: resposta a comentário = id do comentário; resposta a RÉPLICA (25/11) = 'r:' + id da réplica
const chaveDe = x => (x.id_replica ? 'r:' + x.id_replica : String(x.id_comentario));
const feitos = new Set(ja.map(x => x.chave || String(x.id_comentario)));

const fila = entrada.filter(x => x.id_comentario && String(x.resposta || '').trim() && x.aprovado_em && !x.publicado && !feitos.has(chaveDe(x)));
const recusados = entrada.filter(x => !x.aprovado_em).length;
console.log(`respostas no arquivo: ${entrada.length} · aprovadas e pendentes: ${fila.length} · sem aprovação (ignoradas): ${recusados}`);

// trava de segurança: nada de link, venda ou @ no texto que vai pro ar
for (const x of fila) {
  const t = String(x.resposta);
  if (/https?:\/\/|www\.|ROTINA|Kindle|amazon|comenta\s+\w+\s+que/i.test(t)) throw new Error('texto com link/venda bloqueado: ' + String(x.id_comentario));
  if (t.length > 2000) throw new Error('texto grande demais: ' + String(x.id_comentario));
}
if (SECO) { console.log('[seco] não posta nada. Há', fila.length, 'aprovadas; por rodada saem no máx.', MAX); process.exit(0); }

// só de dia no Brasil: 08h–22h BRT = 11h–01h UTC
const hUTC = new Date().getUTCHours();
if (!FORCAR_HORARIO && !(hUTC >= 11 || hUTC < 1)) { console.log('fora do horário (só 08h–22h BRT); ficam ' + fila.length + ' pendentes'); process.exit(0); }
if (!fila.length) { console.log('nada aprovado pendente'); process.exit(0); }
// TRAVA DE RITMO (26/11): o cron do GitHub falha muito (24→26/11 só 1 de ~12 rodadas disparou), então o workflow
// acorda a cada 10 min e ESTE trava garante o espaçamento: só posta se a última resposta tem >= ESPACO_MIN min.
const ESPACO_MIN = Number(process.env.RESPONDE_ESPACO_MIN || 25);
const ultimaEm = ja.map(x => Date.parse(x.em)).filter(Number.isFinite).sort((a, b) => b - a)[0] || 0;
if (!FORCAR_HORARIO && Date.now() - ultimaEm < ESPACO_MIN * 60000) { console.log('aguardando espaço: última resposta há ' + Math.round((Date.now() - ultimaEm) / 60000) + ' min (mínimo ' + ESPACO_MIN + ')'); process.exit(0); }

// nome de quem comentou só vive em memória (pra intercalar); nunca é gravado nem impresso
const autor = {};
for (const x of fila) {
  try { const c = await get('/' + (x.id_replica || x.id_comentario), { fields: 'username' }); autor[chaveDe(x)] = (c.username || '').toLowerCase(); } catch { autor[chaveDe(x)] = ''; }
}
// intercala: pega primeiro de quem tem menos itens na fila, sem repetir o mesmo autor em seguida
const grupos = new Map();
for (const x of fila) { const a = autor[chaveDe(x)] || ('_' + chaveDe(x)); if (!grupos.has(a)) grupos.set(a, []); grupos.get(a).push(x); }
const ordem = [];
let ultimo = null;
while ([...grupos.values()].some(g => g.length)) {
  const cand = [...grupos.entries()].filter(([, g]) => g.length).sort((a, b) => (b[1].length - a[1].length));
  const esc = cand.find(([a]) => a !== ultimo) || cand[0];
  ordem.push(esc[1].shift()); ultimo = esc[0];
}
const lote = ordem.slice(0, MAX);
console.log('desta rodada: ' + lote.length + ' (ficam ' + (ordem.length - lote.length) + ' para as próximas)');
// jitter de início pra não cair sempre no minuto cheio
await dorme(Math.random() * 60000);

const resultado = [];
let erros = 0;
let primeiro = true;
for (const x of lote) {
  if (!primeiro) await dorme(pausaAleatoria());
  primeiro = false;
  const id = String(x.id_comentario);
  try {
    // já respondido por nós? (não duplica)
    const antes = await get(`/${id}/replies`, { fields: 'id,username,timestamp', limit: '50' });
    if (antes.error) throw new Error('lendo respostas: ' + String(antes.error.message).slice(0, 120));
    let minha;
    if (x.id_replica) {
      // réplica: só conta como "já respondida" se nós escrevemos DEPOIS dela
      const rep = (antes.data || []).find(r => r.id === String(x.id_replica));
      if (!rep) throw new Error('réplica não encontrada no fio (apagada?)');
      minha = (antes.data || []).find(r => (r.username || '').toLowerCase() === MEU && r.timestamp > rep.timestamp);
    } else {
      minha = (antes.data || []).find(r => (r.username || '').toLowerCase() === MEU);
    }
    if (minha) { console.log(`ja respondido: ${id} -> ${minha.id}`); resultado.push({ id_comentario: id, chave: chaveDe(x), id_resposta: minha.id, em: new Date().toISOString(), origem: 'ja_existia', verificada: true }); continue; }
    const r = await post(`/${id}/replies`, { message: String(x.resposta) });
    if (!r.id) throw new Error('POST: ' + JSON.stringify(r).slice(0, 200));
    await dorme(2500);
    const depois = await get(`/${id}/replies`, { fields: 'id,username', limit: '50' });
    const achou = (depois.data || []).some(y => y.id === r.id && (y.username || '').toLowerCase() === MEU);
    console.log(`respondido: ${id} -> ${r.id} (aparece embaixo do comentario: ${achou ? 'sim' : 'NAO CONFIRMADO'})`);
    resultado.push({ id_comentario: id, chave: chaveDe(x), id_resposta: r.id, em: new Date().toISOString(), origem: 'postada_agora', verificada: achou });
    if (!achou) erros++;
  } catch (e) {
    erros++;
    console.error(`falhou ${id}: ${String(e.message || e).slice(0, 200)}`);
    resultado.push({ id_comentario: id, chave: chaveDe(x), erro: String(e.message || e).slice(0, 200), em: new Date().toISOString() });
  }
}

const guardar = [...ja, ...resultado.filter(r => r.id_resposta)];
fs.writeFileSync(SAIDA, JSON.stringify(guardar, null, 2) + '\n', 'utf8');
// o que NÃO foi postado agora continua na entrada; o que foi (ou já existia) sai dela
const postados = new Set(resultado.filter(r => r.id_resposta).map(r => r.chave));
const resta = entrada.filter(x => !postados.has(chaveDe(x)) && !feitos.has(chaveDe(x)));
if (resta.length) fs.writeFileSync(ENTRADA, JSON.stringify(resta, null, 2) + '\n', 'utf8'); else fs.rmSync(ENTRADA, { force: true });
console.log('restam na entrada: ' + resta.length);
console.log(`\nresumo: ${resultado.filter(r => r.id_resposta).length} ok · ${resultado.filter(r => r.erro).length} com erro · ${resultado.filter(r => r.id_resposta && !r.verificada).length} nao confirmadas`);
if (erros) process.exit(1);
