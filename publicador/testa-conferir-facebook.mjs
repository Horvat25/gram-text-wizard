import assert from 'node:assert/strict';
import { avaliarFacebook } from './conferir-facebook.mjs';

const agora = new Date('2026-09-25T03:00:00.000Z').getTime();
const base = (slug, publicadoEm, extra = {}) => ({
  slug,
  tipo: 'reels',
  status: 'publicado',
  quando: publicadoEm,
  publicado_em: publicadoEm,
  ...extra,
});

assert.equal(avaliarFacebook([
  base('antigo-1', '2026-09-23T21:00:00.000Z', { erro_facebook: 'erro antigo' }),
  base('antigo-2', '2026-09-24T17:00:00.000Z', { erro_facebook: 'erro antigo' }),
], { agora }).problema, false, 'falhas anteriores ao conserto devem ser ignoradas');

assert.equal(avaliarFacebook([
  base('falha-1', '2026-09-24T21:00:00.000Z', { erro_facebook: 'upload falhou' }),
], { agora }).problema, false, 'uma falha isolada nao dispara');

assert.equal(avaliarFacebook([
  base('falha-1', '2026-09-24T21:00:00.000Z', { erro_facebook: 'upload falhou' }),
  base('falha-2', '2026-09-25T00:00:00.000Z'),
], { agora }).problema, true, 'erro seguido de ausencia de id deve disparar');

assert.equal(avaliarFacebook([
  base('falha-1', '2026-09-24T21:00:00.000Z'),
  base('ok', '2026-09-25T00:00:00.000Z', { id_facebook: '123' }),
  base('falha-2', '2026-09-25T01:00:00.000Z'),
], { agora }).problema, false, 'um sucesso reinicia a sequencia');

assert.equal(avaliarFacebook([
  base('falha-1', '2026-09-24T21:00:00.000Z'),
  base('ainda-no-prazo', '2026-09-25T02:45:00.000Z'),
], { agora }).problema, false, 'Reel com menos de 30 min nao pode ser julgado');

assert.equal(avaliarFacebook([
  base('falha-1', '2026-09-24T21:00:00.000Z'),
  base('falha-2', '2026-09-25T00:00:00.000Z'),
  base('recuperou', '2026-09-25T01:00:00.000Z', { id_facebook: '456' }),
], { agora }).problema, false, 'sequencia antiga recuperada nao deve alarmar para sempre');

console.log('OK: 6 cenarios do alarme do Facebook passaram');
