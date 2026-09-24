// Alarme do espelhamento Facebook.
//
// Falha quando a sequencia CORRENTE chega a dois Reels publicados no Instagram
// sem id_facebook. Cada Reel ganha 30 minutos antes de ser julgado. O corte de
// 24/09 evita que as 22 falhas antigas, ja conhecidas e deliberadamente nao
// reenviadas, transformem o alarme novo em ruido permanente.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FACEBOOK_ALARME_DESDE = '2026-09-24T21:00:00.000Z';
export const ESPERA_MS = 30 * 60 * 1000;

const tempoPublicacao = item => new Date(item.publicado_em || item.quando).getTime();

export function avaliarFacebook(fila, {
  agora = Date.now(),
  desde = FACEBOOK_ALARME_DESDE,
  esperaMs = ESPERA_MS,
} = {}) {
  const desdeMs = new Date(desde).getTime();
  const reels = fila
    .filter(item => (item.tipo === 'reels' || item.tipo === 'video') && item.status === 'publicado')
    .filter(item => Number.isFinite(tempoPublicacao(item)) && tempoPublicacao(item) >= desdeMs)
    .filter(item => agora - tempoPublicacao(item) >= esperaMs)
    .sort((a, b) => tempoPublicacao(a) - tempoPublicacao(b));

  let sequencia = [];
  for (const item of reels) {
    if (item.id_facebook) {
      sequencia = [];
      continue;
    }
    sequencia.push({
      slug: item.slug || '?',
      quando: item.quando || null,
      publicado_em: item.publicado_em || null,
      motivo: item.erro_facebook || 'sem id_facebook 30 min depois da publicacao',
    });
  }

  return {
    problema: sequencia.length >= 2,
    avaliados: reels.length,
    falhas_consecutivas: sequencia.length,
    sequencia,
  };
}

function main() {
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const filaPath = process.env.FILA_PATH || path.join(aqui, 'fila.json');
  const agora = process.env.AGORA ? new Date(process.env.AGORA).getTime() : Date.now();
  const desde = process.env.FB_ALARME_DESDE || FACEBOOK_ALARME_DESDE;
  const resultado = avaliarFacebook(JSON.parse(fs.readFileSync(filaPath, 'utf8')), { agora, desde });

  console.log(`Facebook: ${resultado.avaliados} Reel(s) avaliados desde ${desde}; sequencia atual de falhas: ${resultado.falhas_consecutivas}`);
  if (resultado.problema) {
    console.error('ALARME: 2 ou mais Reels seguidos ficaram sem publicacao no Facebook:');
    for (const item of resultado.sequencia) {
      console.error(`  ${item.publicado_em || item.quando} — ${item.slug} — ${item.motivo}`);
    }
    process.exit(1);
  }
  console.log('Facebook em observacao: nenhuma sequencia acionavel de 2 falhas.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

