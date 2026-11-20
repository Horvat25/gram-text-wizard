// Posts de FOTO e TEXTO na Página do Facebook (monetização paga também por foto e texto, não só Reels). Padrão de 20/11/2026.
// Fila: publicador/fb-posts/fila.json  [{ slug, quando (ISO Z), tipo: 'foto'|'texto', texto, imagem? (caminho no repo) }]
// Cada post é AGENDADO no próprio Facebook (published=false + scheduled_publish_time), então o robô não fica esperando.
// Se o horário já está perto (<12 min) ou passou há até 2 h, publica na hora. Passou de 2 h: PERDIDO (não publica atrasado).
// Recibos em publicador/fb-posts/recibos.json; rodar de novo nunca duplica.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const API = 'https://graph.facebook.com/v21.0', PAGE = '962589380261249';
const DIR = 'publicador/fb-posts', FILA = DIR + '/fila.json', REC = DIR + '/recibos.json';
const RAW = 'https://raw.githubusercontent.com/' + (process.env.GITHUB_REPOSITORY || 'Horvat25/gram-text-wizard') + '/main/';
const fila = JSON.parse(fs.readFileSync(FILA, 'utf8'));
const rec = fs.existsSync(REC) ? JSON.parse(fs.readFileSync(REC, 'utf8')) : {};
const SECO = process.argv.includes('--seco');

function persist(msg) {
  if (SECO) return;
  fs.writeFileSync(REC, JSON.stringify(rec, null, 2) + '\n');
  execFileSync('git', ['add', REC]);
  try { execFileSync('git', ['commit', '-q', '-m', 'fb-posts: ' + msg]); } catch { return; }
  for (let i = 0; i < 5; i++) { try { execFileSync('git', ['pull', '-q', '--rebase', 'origin', 'main']); execFileSync('git', ['push', '-q', 'origin', 'HEAD:main']); return; } catch { execFileSync('sleep', ['3']); } }
  console.log('AVISO: recibo não subiu');
}
async function get(path, fields, tk) { const u = new URL(API + '/' + path); u.searchParams.set('fields', fields); u.searchParams.set('access_token', tk); const d = await (await fetch(u)).json(); if (d.error) throw Error(d.error.message); return d; }
async function post(path, data, tk) { const d = await (await fetch(API + '/' + path, { method: 'POST', body: new URLSearchParams({ ...data, access_token: tk }) })).json(); if (d.error) throw Error(d.error.message); return d; }

// validação antes de qualquer chamada: erro de digitação na fila não pode virar post quebrado
const erros = [];
const slugs = new Set();
for (const p of fila) {
  if (!p.slug || slugs.has(p.slug)) erros.push('slug vazio/duplicado: ' + p.slug); slugs.add(p.slug);
  if (isNaN(Date.parse(p.quando)) || !p.quando.endsWith('Z')) erros.push(p.slug + ': quando inválido (ISO com Z)');
  if (!['foto', 'texto'].includes(p.tipo)) erros.push(p.slug + ': tipo deve ser foto ou texto');
  if (!p.texto || p.texto.length < 40) erros.push(p.slug + ': texto curto demais');
  if (/https?:\/\//.test(p.texto)) erros.push(p.slug + ': link no texto derruba alcance (link vai no comentário)');
  if (p.tipo === 'foto' && (!p.imagem || !fs.existsSync(p.imagem))) erros.push(p.slug + ': imagem não existe no repo: ' + p.imagem);
}
const horas = fila.map(p => p.quando).sort();
for (let i = 1; i < horas.length; i++) if (Date.parse(horas[i]) - Date.parse(horas[i - 1]) < 30 * 60e3) erros.push('dois posts a menos de 30 min: ' + horas[i - 1] + ' e ' + horas[i]);
if (erros.length) { console.log('FILA COM ERRO:\n' + erros.join('\n')); process.exit(1); }
console.log('fila ok:', fila.length, 'posts');
if (SECO) { for (const p of fila) console.log(p.quando, p.tipo, p.slug, rec[p.slug]?.state || 'novo'); process.exit(0); }

const tk = (await get(PAGE, 'access_token', process.env.IG_TOKEN)).access_token;
if (!tk) throw Error('PAGE_TOKEN_MISSING');
const resumo = {};
for (const p of fila.sort((a, b) => a.quando.localeCompare(b.quando))) {
  const r = rec[p.slug] = rec[p.slug] || { quando: p.quando, tipo: p.tipo };
  if (['AGENDADO', 'PUBLICADO', 'PERDIDO'].includes(r.state)) { resumo[p.slug] = r.state; continue; }
  if (r.state === 'FALHOU' && r.tentativas >= 2) { resumo[p.slug] = 'FALHOU'; continue; }
  const slot = Date.parse(p.quando), agora = Date.now();
  if (agora - slot > 2 * 3600e3) { r.state = 'PERDIDO'; persist(p.slug + ' perdido'); resumo[p.slug] = 'PERDIDO'; continue; }
  const agendar = slot - agora > 12 * 60e3;
  const quando = agendar ? { published: 'false', scheduled_publish_time: String(Math.floor(slot / 1000)) } : {};
  try {
    r.tentativas = (r.tentativas || 0) + 1;
    let d;
    if (p.tipo === 'foto') d = await post(PAGE + '/photos', { url: RAW + p.imagem, message: p.texto, ...quando }, tk);
    else d = await post(PAGE + '/feed', { message: p.texto, ...quando }, tk);
    r.id = d.post_id || d.id; r.foto_id = p.tipo === 'foto' ? d.id : undefined;
    try { r.readback = await get(r.id, 'is_published,scheduled_publish_time,permalink_url,created_time', tk); } catch (e) { r.readback = { erro: e.message }; }
    r.state = agendar ? 'AGENDADO' : 'PUBLICADO'; delete r.error;
  } catch (e) { r.state = 'FALHOU'; r.error = e.message; }
  persist(p.slug + ' ' + r.state); resumo[p.slug] = r.state;
  console.log(r.state, p.quando, p.tipo, p.slug, r.error || r.id);
}
console.log('FIM', JSON.stringify(resumo));
