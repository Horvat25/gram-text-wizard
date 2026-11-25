// Bônus do Facebook 25-26/11/2026: 25 Reels curtos SÓ na Página (meta: 30 reels de 10 s+ em 6 dias; estava 6/30). Pedido do Marcelo: "videos rapidos... entre hoje e amanha, sem videos repetidos".
// Cópia do fb-bonus-20nov.mjs (agenda nativo; quem falhar no agendamento é publicado na hora). Vídeo sobe em bytes do repositório (campo arquivo).
// Modo 2 (se o Facebook recusar agendamento de Reel): espera a hora de cada um e publica (PUBLISHED).
// Uma tentativa por Reel; recibo de cada passo em receipts.json (rodar de novo nunca duplica).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const API = 'https://graph.facebook.com/v21.0', PAGE = '962589380261249';
const DIR = 'publicador/fb-bonus-25nov', FILE = DIR + '/receipts.json';
const items = JSON.parse(fs.readFileSync(DIR + '/manifest.json', 'utf8'));
const receipts = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function persist(msg) {
  fs.writeFileSync(FILE, JSON.stringify(receipts, null, 2) + '\n');
  execFileSync('git', ['add', FILE]);
  try { execFileSync('git', ['commit', '-q', '-m', 'fb-bonus-25nov: ' + msg]); } catch { return; }
  for (let i = 0; i < 5; i++) { try { execFileSync('git', ['pull', '-q', '--rebase', 'origin', 'main']); execFileSync('git', ['push', '-q', 'origin', 'HEAD:main']); return; } catch { execFileSync('sleep', ['3']); } }
  console.log('AVISO: recibo não subiu (segue rodando)');
}
async function get(path, fields, tk) { const u = new URL(API + '/' + path); u.searchParams.set('fields', fields); u.searchParams.set('access_token', tk); const d = await (await fetch(u)).json(); if (d.error) throw Error(d.error.message); return d; }
async function post(path, data, tk) { const d = await (await fetch(API + '/' + path, { method: 'POST', body: new URLSearchParams({ ...data, access_token: tk }) })).json(); if (d.error) throw Error(d.error.message); return d; }

const tk = (await get(PAGE, 'access_token', process.env.IG_TOKEN)).access_token;
if (!tk) throw Error('PAGE_TOKEN_MISSING');
console.log('PAGINA', JSON.stringify(await get(PAGE, 'id,name', tk)));
const LIMITE = Date.parse('2026-11-27T03:30:00Z');   // nada sai depois de 00h30 BRT de 27/11

async function sobe(item, r) {
  const ini = await post(PAGE + '/video_reels', { upload_phase: 'start' }, tk);
  if (!ini.video_id) throw Error('sem video_id');
  r.video_id = ini.video_id; r.state = 'SUBINDO'; persist(item.slug + ' start');
  // Rodada 4: arquivo recusado pelo link hospedado sobe em bytes, direto do repositório.
  const hdr = item.arquivo ? { Authorization: `OAuth ${tk}`, offset: '0', file_size: String(fs.statSync(item.arquivo).size) } : { Authorization: `OAuth ${tk}`, file_url: item.url };
  const up = await (await fetch(`https://rupload.facebook.com/video-upload/v21.0/${r.video_id}`, { method: 'POST', headers: hdr, body: item.arquivo ? fs.readFileSync(item.arquivo) : undefined })).json();
  if (!up.success) throw Error('upload ' + JSON.stringify(up).slice(0, 200));
  for (let j = 0; j < 30; j++) {
    const st = (await get(r.video_id, 'status', tk)).status || {};
    if (st.uploading_phase?.status === 'error') throw Error('upload erro ' + JSON.stringify(st).slice(0, 200));
    if (st.uploading_phase?.status === 'complete' || st.video_status === 'ready') { r.state = 'SUBIU'; persist(item.slug + ' subiu'); return; }
    await sleep(10000);
  }
  throw Error('upload não completou em 5 min');
}

// Rodada 3 (20/11): erro de UM arquivo não muda o modo dos outros. Quem falhar no agendamento ganha 1 envio novo;
// se falhar de novo, vai pra lista "na hora" e é publicado no horário dele depois que todos os outros estiverem agendados.
async function agenda(item, r) {
  const slot = Date.parse(item.quando);
  const fim = await post(PAGE + '/video_reels', { upload_phase: 'finish', video_id: r.video_id, video_state: 'SCHEDULED', scheduled_publish_time: String(Math.floor(slot / 1000)), description: item.caption }, tk);
  if (!fim.success) throw Error('finish ' + JSON.stringify(fim));
  const rb = await get(r.video_id, 'status,published,scheduled_publish_time', tk);
  r.readback = rb; r.state = 'AGENDADO'; persist(item.slug + ' agendado');
  console.log('AGENDADO', item.slug, item.quando, JSON.stringify(rb).slice(0, 200));
}
const naHora = [];
for (const item of items) {
  let r = receipts[item.slug];
  if (r && ['AGENDADO', 'PUBLICADO', 'ACEITO'].includes(r.state)) { console.log(item.slug, 'JA', r.state); continue; }
  if (r && r.state === 'FALHOU') { console.log(item.slug, 'FALHOU ANTES, nao repete', r.error); continue; }
  r = receipts[item.slug] = r || { quando: item.quando };
  try {
    if (r.recusa_agendar && !r.reenviado) {   // arquivo recusado antes: manda de novo, do zero (URL do manifest pode ter mudado)
      r.video_id_antigo = r.video_id; delete r.video_id; r.reenviado = true; r.state = 'REENVIANDO'; persist(item.slug + ' reenviando');
    }
    if (!r.video_id || r.state === 'SUBINDO') await sobe(item, r);
    try { await agenda(item, r); continue; }
    catch (e1) {
      console.log('agendamento recusado (1):', item.slug, e1.message);
      r.recusa_agendar = e1.message;
      if (!r.reenviado) {
        r.video_id_antigo = r.video_id; delete r.video_id; r.reenviado = true; persist(item.slug + ' recusado, reenviando');
        await sobe(item, r);
        try { await agenda(item, r); continue; } catch (e2) { r.recusa_agendar = e2.message; console.log('agendamento recusado (2):', item.slug, e2.message); }
      }
      r.state = 'NA_HORA'; persist(item.slug + ' vai publicar na hora'); naHora.push(item);
    }
  } catch (e) { r.state = 'FALHOU'; r.error = e.message; persist(item.slug + ' falhou'); console.log('FALHOU', item.slug, e.message); }
}
for (const item of naHora.sort((a, b) => a.quando.localeCompare(b.quando))) {
  const r = receipts[item.slug];
  try {
    const slot = Date.parse(item.quando);
    while (Date.now() < slot) await sleep(Math.min(20000, slot - Date.now()));
    if (Date.now() > LIMITE) throw Error('passou do limite (27/11 00h30 BRT)');
    const fim = await post(PAGE + '/video_reels', { upload_phase: 'finish', video_id: r.video_id, video_state: 'PUBLISHED', description: item.caption }, tk);
    if (!fim.success) throw Error('finish ' + JSON.stringify(fim));
    r.state = 'ACEITO'; persist(item.slug + ' aceito');
    for (let j = 0; j < 24; j++) { const d = await get(r.video_id, 'status,published,permalink_url', tk); r.readback = d; if (d.published === true) { r.state = 'PUBLICADO'; break; } await sleep(5000); }
    persist(item.slug + ' ' + r.state); console.log(r.state, item.slug, new Date().toISOString());
  } catch (e) { r.state = 'FALHOU'; r.error = e.message; persist(item.slug + ' falhou'); console.log('FALHOU', item.slug, e.message); }
}
// Conferência (rodada 4): depois do último horário, lê cada Reel na Página e grava se saiu publicado.
if (Date.now() > Date.parse(items.map(i => i.quando).sort().pop())) {
  const conf = {};
  for (const [k, v] of Object.entries(receipts)) { if (!v.video_id || !items.some(i => i.slug === k)) continue;
    try { const d = await get(v.video_id, 'published,permalink_url,status', tk); v.confere = { published: d.published, permalink: d.permalink_url, video_status: d.status?.video_status, em: new Date().toISOString() }; conf[k] = d.published; } catch (e) { v.confere = { erro: e.message }; conf[k] = 'erro'; } }
  persist('conferencia final'); console.log('CONFERE', JSON.stringify(conf));
}
console.log('FIM', JSON.stringify(Object.fromEntries(Object.entries(receipts).map(([k, v]) => [k, v.state]))));
