import { pathToFileURL } from 'node:url';

// responde-rotina-youtube.mjs
// Neural Update -> RQP: responde a comentários que começam com ROTINA.
// API oficial do YouTube, sem navegador. Idempotente por thread.

const API = 'https://www.googleapis.com/youtube/v3';
const EXPECTED_TITLE = 'Neural Update';
const WINDOW_DAYS = 30;
const MAX_VIDEOS = 15;

export function normalizeKeywordText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function isRotinaIntent(value) {
  return /^ROTINA(?:\s|$)/.test(normalizeKeywordText(value));
}

export function replyFor(commentId) {
  const replies = [
    'Boa. Esse é o meu projeto Rotina que Paga. Responde aqui com a marca e o modelo exato do seu celular que eu te mostro o próximo passo sem prometer vaga ou renda.',
    'Vi seu ROTINA. Me manda aqui marca + modelo do celular. O Rotina que Paga existe justamente pra te direcionar sem chutar compatibilidade.',
    'Fechou. ROTINA recebido. Responde com o modelo exato do seu celular e eu te mostro por onde começar no Rotina que Paga com informação verificada.',
  ];
  let n = 0;
  for (const ch of String(commentId || '')) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return replies[n % replies.length];
}

async function token() {
  const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    throw new Error('faltam YT_CLIENT_ID / YT_CLIENT_SECRET / YT_REFRESH_TOKEN');
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      refresh_token: YT_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('refresh do YouTube falhou');
  return j.access_token;
}

async function get(tk, path, params) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const r = await fetch(u, { headers: { authorization: 'Bearer ' + tk } });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || ('YouTube GET ' + path + ' falhou'));
  return j;
}

async function ownReplyExists(tk, parentId, ownChannelId) {
  let pageToken;
  do {
    const j = await get(tk, '/comments', {
      part: 'snippet',
      parentId,
      maxResults: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    if ((j.items || []).some((x) => x.snippet?.authorChannelId?.value === ownChannelId)) return true;
    pageToken = j.nextPageToken;
  } while (pageToken);
  return false;
}

async function reply(tk, parentId, text) {
  const r = await fetch(API + '/comments?part=snippet', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + tk,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ snippet: { parentId, textOriginal: text } }),
  });
  const j = await r.json();
  if (!r.ok || !j.id) throw new Error(j.error?.message || 'YouTube não confirmou a resposta');
  return j.id;
}

export async function run({ dryRun = false } = {}) {
  const tk = await token();
  const channels = await get(tk, '/channels', {
    part: 'snippet,contentDetails',
    mine: 'true',
  });
  const channel = channels.items?.[0];
  const ownChannelId = channel?.id;
  const title = String(channel?.snippet?.title || '');

  if (!ownChannelId || title !== EXPECTED_TITLE) {
    throw new Error('canal autorizado não é Neural Update: ' + (title || 'desconhecido'));
  }

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error('playlist de uploads não encontrada');

  const pl = await get(tk, '/playlistItems', {
    part: 'contentDetails',
    playlistId: uploads,
    maxResults: MAX_VIDEOS,
  });
  const ids = (pl.items || []).map((x) => x.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return { scannedVideos: 0, intents: 0, replied: 0 };

  const videos = await get(tk, '/videos', {
    part: 'snippet,status',
    id: ids.join(','),
  });
  const cutoff = Date.now() - WINDOW_DAYS * 864e5;
  const recent = (videos.items || []).filter((v) =>
    v.status?.privacyStatus === 'public' &&
    Date.parse(v.snippet?.publishedAt || 0) >= cutoff
  );

  let intents = 0;
  let replied = 0;
  const seenAuthorsByVideo = new Map();

  for (const video of recent) {
    let threads;
    try {
      threads = await get(tk, '/commentThreads', {
        part: 'snippet',
        videoId: video.id,
        maxResults: 100,
        order: 'time',
        textFormat: 'plainText',
      });
    } catch (e) {
      console.log('· ' + video.id + ' — comentários indisponíveis: ' + e.message);
      continue;
    }

    for (const thread of threads.items || []) {
      const top = thread.snippet?.topLevelComment;
      const s = top?.snippet;
      if (!top?.id || !s) continue;
      if (s.authorChannelId?.value === ownChannelId) continue;
      if (!isRotinaIntent(s.textDisplay || s.textOriginal)) continue;

      intents++;
      const author = s.authorChannelId?.value || s.authorDisplayName || 'unknown';
      const seen = seenAuthorsByVideo.get(video.id) || new Set();
      if (seen.has(author)) continue;
      seen.add(author);
      seenAuthorsByVideo.set(video.id, seen);

      if (thread.snippet?.totalReplyCount > 0 && await ownReplyExists(tk, top.id, ownChannelId)) {
        console.log('· ' + video.id + ' / ' + author + ' — ROTINA já respondido');
        continue;
      }

      const text = replyFor(top.id);
      if (dryRun) {
        console.log('[seco] ' + video.id + ' / ' + author + ' -> ' + text);
        continue;
      }

      await reply(tk, top.id, text);
      replied++;
      console.log('✓ ' + video.id + ' / ' + author + ' — ROTINA respondido');
    }
  }

  return { scannedVideos: recent.length, intents, replied };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run({ dryRun: process.argv.includes('--seco') })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.error('ERRO responde-rotina-youtube: ' + e.message);
      process.exitCode = 1;
    });
}
