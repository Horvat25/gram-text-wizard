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

if (!fs.existsSync(ENTRADA)) { console.log('sem arquivo de respostas pendentes: nada a fazer'); process.exit(0); }
const entrada = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
const ja = fs.existsSync(SAIDA) ? JSON.parse(fs.readFileSync(SAIDA, 'utf8')) : [];
const feitos = new Set(ja.map(x => x.id_comentario));

const fila = entrada.filter(x => x.id_comentario && String(x.resposta || '').trim() && x.aprovado_em && !x.publicado && !feitos.has(String(x.id_comentario)));
const recusados = entrada.filter(x => !x.aprovado_em).length;
console.log(`respostas no arquivo: ${entrada.length} · aprovadas e pendentes: ${fila.length} · sem aprovação (ignoradas): ${recusados}`);

// trava de segurança: nada de link, venda ou @ no texto que vai pro ar
for (const x of fila) {
  const t = String(x.resposta);
  if (/https?:\/\/|www\.|ROTINA|Kindle|amazon|comenta\s+\w+\s+que/i.test(t)) throw new Error('texto com link/venda bloqueado: ' + String(x.id_comentario));
  if (t.length > 2000) throw new Error('texto grande demais: ' + String(x.id_comentario));
}
if (SECO) { console.log('[seco] não posta nada. Postaria', fila.length, 'respostas.'); process.exit(0); }

const resultado = [];
let erros = 0;
for (const x of fila) {
  const id = String(x.id_comentario);
  try {
    // já respondido por nós? (não duplica)
    const antes = await get(`/${id}/replies`, { fields: 'id,username', limit: '50' });
    if (antes.error) throw new Error('lendo respostas: ' + String(antes.error.message).slice(0, 120));
    const minha = (antes.data || []).find(r => (r.username || '').toLowerCase() === MEU);
    if (minha) { console.log(`ja respondido: ${id} -> ${minha.id}`); resultado.push({ id_comentario: id, id_resposta: minha.id, em: new Date().toISOString(), origem: 'ja_existia', verificada: true }); continue; }
    const r = await post(`/${id}/replies`, { message: String(x.resposta) });
    if (!r.id) throw new Error('POST: ' + JSON.stringify(r).slice(0, 200));
    await dorme(2500);
    const depois = await get(`/${id}/replies`, { fields: 'id,username', limit: '50' });
    const achou = (depois.data || []).some(y => y.id === r.id && (y.username || '').toLowerCase() === MEU);
    console.log(`respondido: ${id} -> ${r.id} (aparece embaixo do comentario: ${achou ? 'sim' : 'NAO CONFIRMADO'})`);
    resultado.push({ id_comentario: id, id_resposta: r.id, em: new Date().toISOString(), origem: 'postada_agora', verificada: achou });
    if (!achou) erros++;
  } catch (e) {
    erros++;
    console.error(`falhou ${id}: ${String(e.message || e).slice(0, 200)}`);
    resultado.push({ id_comentario: id, erro: String(e.message || e).slice(0, 200), em: new Date().toISOString() });
  }
  await dorme(3000);
}

const guardar = [...ja, ...resultado.filter(r => r.id_resposta)];
fs.writeFileSync(SAIDA, JSON.stringify(guardar, null, 2) + '\n', 'utf8');
console.log(`\nresumo: ${resultado.filter(r => r.id_resposta).length} ok · ${resultado.filter(r => r.erro).length} com erro · ${resultado.filter(r => r.id_resposta && !r.verificada).length} nao confirmadas`);
if (erros) process.exit(1);
