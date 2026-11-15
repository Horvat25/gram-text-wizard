import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const API = 'https://graph.facebook.com/v21.0';
const page = '962589380261249';
const file = 'publicador/fb-old-oct/receipts.json';
const items = JSON.parse(fs.readFileSync('publicador/fb-old-oct/manifest.json', 'utf8'));
const tonight = new Set([
  '2263092590921374', '1677485810561474', '2350773815759052', '988362684341467',
  '1555884936303016', '993230107177219', '1124372800298657', '1826705551711362',
  '1398954878705920', '1815472976424272',
]);
let receipts = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function persist() {
  fs.writeFileSync(file, JSON.stringify(receipts, null, 2) + '\n');
  execFileSync('git', ['add', file]);
  try { execFileSync('git', ['commit', '-m', 'receipt: old October Facebook reels']); } catch {}
  for (let i = 0; i < 4; i++) {
    try {
      execFileSync('git', ['pull', '--rebase', 'origin', 'main']);
      execFileSync('git', ['push', 'origin', 'HEAD:main']);
      return;
    } catch {}
  }
  throw Error('RECEIPT_NOT_PERSISTED');
}

async function get(path, fields) {
  const u = new URL(API + '/' + path);
  u.searchParams.set('fields', fields);
  u.searchParams.set('access_token', token);
  const d = await (await fetch(u)).json();
  if (d.error) throw Error(d.error.message);
  return d;
}

async function post(path, data) {
  const d = await (await fetch(API + '/' + path, {
    method: 'POST',
    body: new URLSearchParams({...data, access_token: token}),
  })).json();
  if (d.error) throw Error(d.error.message);
  return d;
}

let token = process.env.IG_TOKEN;
if (!token) throw Error('IG_TOKEN_MISSING');
token = (await get(page, 'access_token')).access_token;
if (!token) throw Error('PAGE_TOKEN_MISSING');
const identity = await get(page, 'id,name');
console.log('PAGE', JSON.stringify(identity));

for (const item of items) {
  let r = receipts[item.slug];
  if (r?.state === 'POSTED') {
    console.log('RESULT', item.slug, 'ALREADY_POSTED', r.video_id);
    continue;
  }
  if (r?.video_id) {
    console.log('RESULT', item.slug, 'EXISTING_ATTEMPT_NO_RETRY', r.video_id);
    continue;
  }
  if (tonight.has(item.prior_facebook_id)) {
    console.log('RESULT', item.slug, 'SKIP_TONIGHT_DUPLICATE');
    continue;
  }
  try {
    r = receipts[item.slug] = {state: 'STARTING', source: item.source, title: item.title};
    persist();
    const ini = await post(page + '/video_reels', {upload_phase: 'start'});
    if (!ini.video_id) throw Error('NO_VIDEO_ID');
    if (tonight.has(String(ini.video_id))) throw Error('COLLIDED_WITH_TONIGHT');
    r.video_id = ini.video_id;
    r.state = 'UPLOADING';
    persist();
    const up = await (await fetch(`https://rupload.facebook.com/video-upload/v21.0/${r.video_id}`, {
      method: 'POST',
      headers: {Authorization: `OAuth ${token}`, file_url: item.file_url},
    })).json();
    if (!up.success) throw Error('UPLOAD_FAILED ' + JSON.stringify(up).slice(0, 300));
    let ready = false;
    for (let j = 0; j < 30; j++) {
      const d = await get(r.video_id, 'status');
      r.readback = d.status;
      const upStatus = d.status?.uploading_phase?.status;
      if (upStatus === 'error' || d.status?.processing_phase?.status === 'error') {
        throw Error('UPLOAD_ERROR ' + JSON.stringify(d.status).slice(0, 300));
      }
      if (upStatus === 'complete' || d.status?.video_status === 'ready') { ready = true; break; }
      await sleep(4000);
    }
    if (!ready) throw Error('UPLOAD_NOT_CONFIRMED');
    r.state = 'FINISHING';
    persist();
    const done = await post(page + '/video_reels', {
      upload_phase: 'finish',
      video_id: r.video_id,
      video_state: 'PUBLISHED',
      description: item.caption,
    });
    if (!done.success) throw Error('FINISH_NOT_CONFIRMED');
    r.state = 'ACCEPTED';
    persist();
    for (let j = 0; j < 20; j++) {
      const d = await get(r.video_id, 'status,published,permalink_url');
      r.readback = d;
      if (d.published === true) {
        r.state = 'POSTED';
        r.confirmed_at = new Date().toISOString();
        break;
      }
      await sleep(4000);
    }
    persist();
    console.log('RESULT', item.slug, JSON.stringify({state: r.state, video_id: r.video_id, published: r.readback?.published}));
  } catch (e) {
    r.state = r.state === 'ACCEPTED' ? 'ACCEPTED_UNVERIFIED' : 'FAIL';
    r.error = e.message;
    try { persist(); } catch {}
    console.log('RESULT', item.slug, JSON.stringify({state: r.state, error: r.error, video_id: r.video_id || null}));
  }
}
