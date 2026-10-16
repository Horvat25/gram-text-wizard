import assert from 'node:assert/strict';
import { normalizeKeywordText, isRotinaIntent, isRotinaLongo, replyFor } from './responde-rotina-youtube.mjs';

assert.equal(normalizeKeywordText(' rotina '), 'ROTINA');
assert.equal(isRotinaIntent('ROTINA'), true);
assert.equal(isRotinaIntent('rotina Galaxy A15'), true);
// regra de 16/10: ROTINA solta, em qualquer posição; mais de 12 palavras = marcado pro Marcelo
for (const ok of ['ROTINA', 'quero rotina', 'eu quero ROTINA', 'comentei rotina!', 'Rotina 🙏']) assert.equal(isRotinaIntent(ok), true, ok);
const longo = 'minha rotina de estudo é acordar cedo e ler sobre o universo todo dia antes do trabalho';
assert.equal(isRotinaIntent(longo), false);
assert.equal(isRotinaLongo(longo), true);
assert.equal(isRotinaLongo('quero rotina'), false);
assert.equal(isRotinaIntent('rotinas diárias'), false);
assert.equal(isRotinaIntent('COSMOS'), false);
assert.equal(replyFor('abc'), replyFor('abc'));
console.log('neural responde-rotina-youtube: PASS');
