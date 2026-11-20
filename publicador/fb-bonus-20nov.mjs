// Bônus do Facebook 20/11/2026: 18 Reels SÓ na Página (não vão pro Instagram), pedido do Marcelo: "agendar tudo pra hoje antes das 12".
// Modo 1: sobe cada Reel e deixa AGENDADO no próprio Facebook (video_state SCHEDULED + scheduled_publish_time).
// Modo 2 (se o Facebook recusar agendamento de Reel): espera a hora de cada um e publica (PUBLISHED).
// Uma tentativa por Reel; recibo de cada passo em receipts.json (rodar de novo nunca duplica).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const API = 'https://graph.facebook.com/v21.0', PAGE = '962589380261249';
const DIR = 'publicador/fb-bonus-20nov', FILE = DIR + '/receipts.json';
const items = JSON.parse(fs.readFileSync(DIR + '/manifest.json', 'utf8'));
const receipts = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function persist(msg) {
  fs.writeFileSync(FILE, JSON.stringify(receipts, null, 2) + '\n');
  execFileSync('git', ['add', FILE]);
  try { execFileSync('git', ['commit', '-q', '-m', 'fb-bonus-20nov: ' + msg]); } catch { return; }
  for (let i = 0; i < 5; i++) { try { execFileSync('git', ['pull', '-q', '--rebase', 'origin', 'main']); execFileSync('git', ['push', '-q', 'origin', 'HEAD:main']); return; } catch { execFileSync('sleep', ['3']); } }
  console.log('AVISO: recibo não subiu (segue rodando)');
}
async function get(path, fields, tk) { const u = new URL(API + '/' + path); u.searchParams.set('fields', fields); u.searchParams.set('access_token', tk); const d = await (await fetch(u)).json(); if (d.error) throw Error(d.error.message); return d; }
async function post(path, data, tk) { const d = await (await fetch(API + '/' + path, { method: 'POST', body: new URLSearchParams({ ...data, access_token: tk }) })).json(); if (d.error) throw Error(d.error.message); return d; }

const tk = (await get(PAGE, 'access_token', process.env.IG_TOKEN)).access_token;
if (!tk) throw Error('PAGE_TOKEN_MISSING');
console.log('PAGINA', JSON.stringify(await get(PAGE, 'id,name', tk)));
const LIMITE = Date.parse('2026-11-20T15:30:00Z');   // nada sai depois de 12h30 BRT
let modo = 'agendar';

async function sobe(item, r) {
  const ini = await post(PAGE + '/video_reels', { upload_phase: 'start' }, tk);
  if (!ini.video_id) throw Error('sem video_id');
  r.video_id = ini.video_id; r.state = 'SUBINDO'; persist(item.slug + ' start');
  const up = await (await fetch(`https://rupload.facebook.com/video-upload/v21.0/${r.video_id}`, { method: 'POST', headers: { Authorization: `OAuth ${tk}`, file_url: item.url } })).json();
  if (!up.success) throw Error('upload ' + JSON.stringify(up).slice(0, 200));
  for (let j = 0; j < 30; j++) {
    const st = (await get(r.video_id, 'status', tk)).status || {};
    if (st.uploading_phase?.status === 'error') throw Error('upload erro ' + JSON.stringify(st).slice(0, 200));
    if (st.uploading_phase?.status === 'complete' || st.video_status === 'ready') { r.state = 'SUBIU'; persist(item.slug + ' subiu'); return; }
    await sleep(10000);
  }
  throw Error('upload não completou em 5 min');
}

for (const item of items) {
  let r = receipts[item.slug];
  if (r && ['AGENDADO', 'PUBLICADO', 'ACEITO'].includes(r.state)) { console.log(item.slug, 'JA', r.state); continue; }
  if (r && r.state === 'FALHOU') { console.log(item.slug, 'FALHOU ANTES, nao repete', r.error); continue; }
  r = receipts[item.slug] = r || { quando: item.quando };
  try {
    if (!r.video_id || r.state === 'SUBINDO') await sobe(item, r);
    const slot = Date.parse(item.quando);
    if (modo === 'agendar') {
      try {
        const fim = await post(PAGE + '/video_reels', { upload_phase: 'finish', video_id: r.video_id, video_state: 'SCHEDULED', scheduled_publish_time: String(Math.floor(slot / 1000)), description: item.caption }, tk);
        if (!fim.success) throw Error('finish ' + JSON.stringify(fim));
        const rb = await get(r.video_id, 'status,published,scheduled_publish_time', tk);
        r.readback = rb; r.state = 'AGENDADO'; persist(item.slug + ' agendado');
        console.log('AGENDADO', item.slug, item.quando, JSON.stringify(rb).slice(0, 200));
        continue;
      } catch (e) {
        console.log('agendamento recusado, mudo pra publicar na hora:', e.message);
        r.recusa_agendar = e.message; modo = 'na-hora'; persist(item.slug + ' agendamento recusado, publica na hora');
      }
    }
    while (Date.now() < slot) await sleep(Math.min(20000, slot - Date.now()));
    if (Date.now() > LIMITE) throw Error('passou do limite de 12h30 BRT');
    const fim = await post(PAGE + '/video_reels', { upload_phase: 'finish', video_id: r.video_id, video_state: 'PUBLISHED', description: item.caption }, tk);
    if (!fim.success) throw Error('finish ' + JSON.stringify(fim));
    r.state = 'ACEITO'; persist(item.slug + ' aceito');
    for (let j = 0; j < 24; j++) { const d = await get(r.video_id, 'status,published,permalink_url', tk); r.readback = d; if (d.published === true) { r.state = 'PUBLICADO'; break; } await sleep(5000); }
    persist(item.slug + ' ' + r.state); console.log(r.state, item.slug, new Date().toISOString());
  } catch (e) { r.state = 'FALHOU'; r.error = e.message; persist(item.slug + ' falhou'); console.log('FALHOU', item.slug, e.message); }
}
console.log('FIM', JSON.stringify(Object.fromEntries(Object.entries(receipts).map(([k, v]) => [k, v.state]))));
