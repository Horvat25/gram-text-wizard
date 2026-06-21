/**
 * import-shorts-to-reels.mjs — injeta os Shorts JÁ PRONTOS (do YouTube/TikTok) na fila de Reels do Insta.
 * NÃO gera vídeo: sobe o MP4 pronto pro Supabase Storage (bucket post-videos) e cria um post
 * media_type='reels' + video_url + caption, status 'draft' (você revisa/agenda/publica no painel).
 *
 * Rodar (Node 20+ lê o .env nativo):
 *   node --env-file=.env import-shorts-to-reels.mjs
 *
 * Exige no .env (você adiciona a sua chave — eu não preciso vê-la):
 *   SUPABASE_URL=...               (ou VITE_SUPABASE_URL, já existe)
 *   SUPABASE_SERVICE_ROLE_KEY=...  (chave service_role do Supabase — NÃO é a anon)
 * Opcionais:
 *   WORKSPACE_ID=...   (se tiver mais de um workspace; senão usa o primeiro)
 *   REELS_STATUS=draft|scheduled  (default draft)
 *   INCLUDE_HORIZONTAL=1  (inclui os longos 16:9; default só verticais 9:16)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SRC = 'C:\\Users\\Mateus Horvat\\neural-update-tiktok\\videos';
const BUCKET = 'post-videos';
const STATUS = process.env.REELS_STATUS || 'draft';
const INCLUDE_HORIZONTAL = process.env.INCLUDE_HORIZONTAL === '1';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FALTA config: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env. (a service_role NÃO é a anon/publishable)');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function getWorkspaceId() {
  if (process.env.WORKSPACE_ID) return process.env.WORKSPACE_ID;
  const { data, error } = await sb.from('workspaces').select('id, name').order('created_at', { ascending: true }).limit(1);
  if (error) throw new Error('workspaces: ' + error.message);
  if (!data?.length) throw new Error('Nenhum workspace encontrado.');
  console.log(`workspace: ${data[0].name} (${data[0].id})`);
  return data[0].id;
}

async function main() {
  if (!fs.existsSync(SRC)) { console.error('Pasta de origem não existe: ' + SRC); process.exit(1); }
  const workspace_id = await getWorkspaceId();

  const mp4s = fs.readdirSync(SRC).filter(f => f.endsWith('.mp4'));
  let ok = 0, skip = 0;
  for (const file of mp4s) {
    const id = file.replace(/\.mp4$/i, '');
    const sidecarPath = path.join(SRC, `${id}.json`);
    const meta = fs.existsSync(sidecarPath) ? JSON.parse(fs.readFileSync(sidecarPath, 'utf8')) : {};
    if (!INCLUDE_HORIZONTAL && meta.orientation === 'horizontal') { console.log(`- pulei ${id} (16:9, não é reels)`); skip++; continue; }

    const storagePath = `reels/${id}.mp4`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(storagePath, fs.readFileSync(path.join(SRC, file)), {
      contentType: 'video/mp4', upsert: true,
    });
    if (upErr) { console.error(`! upload ${id}: ${upErr.message}`); continue; }
    const video_url = sb.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

    // dedupe por video_url: se já existe um post desse vídeo no workspace, pula
    const { data: existing } = await sb.from('posts').select('id').eq('workspace_id', workspace_id).eq('video_url', video_url).limit(1);
    if (existing?.length) { console.log(`= já na fila: ${id}`); skip++; continue; }

    const tags = (meta.hashtags || []);
    const caption = `${(meta.caption || meta.title || id).trim()}${tags.length ? '\n\n' + tags.join(' ') : ''}`;
    const { error: insErr } = await sb.from('posts').insert({
      workspace_id,
      caption,
      hashtags: tags,
      media_type: 'reels',
      post_type: meta.format || 'conhecimento',
      video_url,
      status: STATUS,
      ...(STATUS === 'scheduled' ? { scheduled_for: new Date(Date.now() + (ok + 1) * 3 * 3600e3).toISOString() } : {}),
    });
    if (insErr) { console.error(`! insert ${id}: ${insErr.message}`); continue; }
    console.log(`✓ ${id} → reels na fila (${STATUS})`);
    ok++;
  }
  console.log(`\nReels enfileirados: ${ok} | pulados: ${skip} | status: ${STATUS}`);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
