// conferir-fila.mjs — o segundo olho. Falha (e dispara email do GitHub) se
// algum post venceu e não saiu, ou se a fila está acabando.
//
// Existe porque em 10/ago/2026 dois posts ficaram pra trás e ninguém soube por
// dez horas. Fila cheia não é a mesma coisa que post publicado.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fila = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fila.json'), 'utf8')
);
const agora = Date.now();
let problema = false;

const atrasados = fila.filter(i => i.status === 'agendado' && new Date(i.quando).getTime() < agora - 3600e3);
const falhados = fila.filter(i => i.status === 'falhou' || i.status === 'perdido');
const futuros = fila.filter(i => i.status === 'agendado' && new Date(i.quando).getTime() >= agora);

if (atrasados.length) {
  problema = true;
  console.error(`${atrasados.length} post(s) venceram há mais de 1h e NÃO saíram:`);
  for (const i of atrasados) console.error(`  ${i.quando}`);
}
if (falhados.length) {
  problema = true;
  console.error(`${falhados.length} post(s) com falha:`);
  for (const i of falhados) console.error(`  ${i.quando} — ${i.erro || i.status}`);
}

// Fila curta também é um problema: sem aviso, o canal fica mudo de um dia pro outro.
const ultimo = futuros.length ? futuros[futuros.length - 1].quando.slice(0, 10) : '(vazia)';
const dias = futuros.length ? Math.ceil((new Date(futuros[futuros.length - 1].quando) - agora) / 86400000) : 0;
console.log(`fila: ${futuros.length} post(s) pela frente, até ${ultimo} (${dias} dia(s))`);
if (dias <= 1) {
  problema = true;
  console.error('FILA ACABANDO: produzir o próximo lote hoje, senão o canal fica mudo.');
}

if (!problema) console.log('tudo em ordem');
process.exit(problema ? 1 : 0);
