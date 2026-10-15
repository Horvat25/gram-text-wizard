import assert from 'node:assert/strict';
import { normalizeKeywordText, isRotinaIntent, replyFor } from './responde-rotina-youtube.mjs';

assert.equal(normalizeKeywordText(' rotina '), 'ROTINA');
assert.equal(isRotinaIntent('ROTINA'), true);
assert.equal(isRotinaIntent('rotina Galaxy A15'), true);
assert.equal(isRotinaIntent('minha rotina é corrida'), false);
assert.equal(isRotinaIntent('COSMOS'), false);
assert.equal(replyFor('abc'), replyFor('abc'));
console.log('neural responde-rotina-youtube: PASS');
