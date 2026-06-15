'use strict';

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const AGENT_URL = process.env.IMAGE_AGENT_URL || 'http://localhost:3030';
const LOCAL_DIR = path.join(__dirname, 'exports', 'video-images');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function downloadImage(url, destPath) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'neural-update-instagram/1.0' },
  });
  fs.writeFileSync(destPath, res.data);
  return destPath;
}

async function getInstagramImages({ script, count = 4, outputDir, sceneQueries = null }) {
  if (!script || !script.trim()) throw new Error('[image-client] script é obrigatório');

  const destDir = outputDir || LOCAL_DIR;
  ensureDir(destDir);

  console.log('[image-client] Chamando neural-image-agent...'
    + (sceneQueries ? ` (${sceneQueries.length} queries do roteiro)` : ''));

  let apiResponse;
  try {
    const res = await axios.post(
      `${AGENT_URL}/scene-images`,
      { script, count, source: 'instagram', captionZone: 'bottom', sceneQueries },
      { timeout: 180000 }
    );
    apiResponse = res.data;
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      throw new Error(`[image-client] neural-image-agent offline em ${AGENT_URL}. `
        + 'Inicie com: node src/index.js (no projeto neural-image-agent)');
    }
    if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
      throw new Error('[image-client] neural-image-agent demorou demais (timeout 3min)');
    }
    throw new Error(`[image-client] Erro na chamada HTTP: ${e.message}`);
  }

  if (!apiResponse || !Array.isArray(apiResponse.images) || apiResponse.images.length === 0) {
    throw new Error('[image-client] Resposta inesperada da API: sem imagens');
  }

  console.log(`[image-client] ${apiResponse.images.length} imagens recebidas`
    + ` | sessão: ${apiResponse.sessionId} | marca: ${apiResponse.brand}`);

  const sessionDir = path.join(destDir, apiResponse.sessionId);
  ensureDir(sessionDir);
  const images = [];

  for (const img of apiResponse.images) {
    const fullUrl = img.url.startsWith('http') ? img.url : `${AGENT_URL}${img.url}`;
    const ext = path.extname(img.url) || '.jpg';
    const tag = img.sceneId || img.type || 'cena';
    const filename = `scene_${String(img.scene).padStart(2, '0')}_${tag}${ext}`;
    const localPath = path.join(sessionDir, filename);
    try {
      await downloadImage(fullUrl, localPath);
      const sizeKb = Math.round(fs.statSync(localPath).size / 1024);
      console.log(`[image-client]   Cena ${img.scene} (${img.sceneId}) → ${filename} (${sizeKb}KB)`);
      images.push({
        scene: img.scene,
        sceneId: img.sceneId || img.type || `cena${img.scene}`,
        type: img.type || null,
        localPath,
        url: fullUrl,
        paragraph: img.paragraph || '',
        brand: img.brand || img.label || apiResponse.brand || 'Neural',
        brandColor: img.brandColor || apiResponse.brandColor || '#33bbff',
        icons: img.icons || [],
      });
    } catch (e) {
      console.error(`[image-client]   Cena ${img.scene} falhou ao baixar: ${e.message}`);
    }
  }

  if (images.length === 0) throw new Error('[image-client] Nenhuma imagem foi baixada com sucesso');

  console.log(`[image-client] ${images.length}/${apiResponse.images.length} imagens salvas em: ${sessionDir}`);

  return {
    sessionId: apiResponse.sessionId,
    topic: apiResponse.topic,
    brand: apiResponse.brand,
    brandColor: apiResponse.brandColor,
    news: apiResponse.news || null,
    images,
    dir: sessionDir,
  };
}

module.exports = { getInstagramImages };
