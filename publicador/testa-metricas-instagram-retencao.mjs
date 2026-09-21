// Teste de integracao local: simula a Graph API, inclusive fallback sem reels_skip_rate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nu-ig-retencao-'));
const saida = path.join(temp, 'metricas.json');
const agora = new Date();
const iso = dias => new Date(agora.getTime() - dias * 864e5).toISOString();
fs.writeFileSync(saida, JSON.stringify({
  conta_diaria: [],
  acervo: [{ id: 'reel-antigo', quando: iso(30), tipo: 'REELS', titulo: 'antigo', views: 10, ig_reels_avg_watch_time: 1000, retencao_atualizado: '2026-01-01T00:00:00Z' }]
}));

process.env.METRICAS_SAIDA = saida;
process.env.IG_USER_ID = 'IGTEST';
process.env.IG_TOKEN = 'token-de-teste';

const metricas = nomes => ({ data: nomes.split(',').map(name => ({ name, values: [{ value:
  name === 'views' || name === 'plays' ? 100 :
  name === 'ig_reels_avg_watch_time' ? 12500 :
  name === 'ig_reels_video_view_total_time' ? 125000 : 1 }] })) });
globalThis.fetch = async entrada => {
  const u = new URL(String(entrada));
  const rota = u.pathname;
  const metric = u.searchParams.get('metric') || '';
  let corpo;
  if (rota === '/v21.0/IGTEST') corpo = { username: 'neuralupdate', followers_count: 1000, media_count: 3 };
  else if (rota === '/v21.0/IGTEST/media') corpo = { data: [
    { id: 'reel-novo', caption: 'Reel novo', media_type: 'VIDEO', media_product_type: 'REELS', timestamp: iso(1), permalink: 'https://instagram.test/reel-novo' },
    { id: 'feed-novo', caption: 'Feed novo', media_type: 'IMAGE', media_product_type: 'FEED', timestamp: iso(2), permalink: 'https://instagram.test/feed-novo' },
  ] };
  else if (rota === '/v21.0/IGTEST/insights') corpo = { data: [{ name: 'views', values: [{ value: 7, end_time: iso(1) }] }] };
  else if (rota.endsWith('/comments')) corpo = { data: [] };
  else if (metric.includes('reels_skip_rate')) corpo = { error: { message: 'metric reels_skip_rate is invalid for v21' } };
  else if (metric.includes('ig_reels_avg_watch_time')) corpo = metricas(metric);
  else if (rota.endsWith('/insights')) corpo = metricas(metric);
  else corpo = { error: { message: `rota de teste nao prevista: ${rota}` } };
  return { json: async () => corpo };
};

await import(`./metricas-instagram.mjs?teste=${Date.now()}`);
const doc = JSON.parse(fs.readFileSync(saida, 'utf8'));
const reelNovo = doc.itens.find(x => x.id === 'reel-novo');
const feedNovo = doc.itens.find(x => x.id === 'feed-novo');
if (doc.retencao_coleta.reels_com_watch_time !== 2) throw new Error(`watch time esperado em 2 Reels, veio ${doc.retencao_coleta.reels_com_watch_time}`);
if (doc.retencao_coleta.reels_com_skip_rate !== 0) throw new Error('skip rate invalido nao deveria ser salvo');
if (doc.retencao_coleta.reels_com_erro !== 0) throw new Error('fallback aceito nao pode virar erro');
if (reelNovo.ig_reels_avg_watch_time !== 12500) throw new Error('watch time nao foi replicado para item recente');
if (feedNovo.ig_reels_avg_watch_time !== undefined) throw new Error('FEED recebeu metrica exclusiva de Reel');
if (reelNovo.views !== 100 || feedNovo.views !== 100) throw new Error('metricas principais foram perdidas');
console.log('teste integracao retencao Instagram: OK');
