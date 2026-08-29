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
const futuros = fila.filter(i => i.status === 'agendado' && new Date(i.quando).getTime() >= agora);

// ⚠️ 29/08/2026 — O BUG QUE CEGOU O VIGIA.
// Antes, QUALQUER item com falha derrubava o workflow. Como falha antiga nunca é
// limpa da fila, o vigia passou a falhar nas três rodadas de todo dia desde 19/08.
// Alarme que toca todo dia é alarme que ninguém abre: quando o cron comeu as manhãs
// de 27, 28 e 29, o e-mail de alerta chegou igual aos outros e se perdeu no meio.
// Agora só falha o que é ACIONÁVEL — falha recente. O histórico vira linha informativa.
const JANELA_H = 48;
const falhados = fila.filter(i => i.status === 'falhou' || i.status === 'perdido');
const recentes = falhados.filter(i => agora - new Date(i.quando).getTime() <= JANELA_H * 3600e3);
const antigos = falhados.length - recentes.length;

if (atrasados.length) {
  problema = true;
  console.error(`${atrasados.length} post(s) venceram há mais de 1h e NÃO saíram:`);
  for (const i of atrasados) console.error(`  ${i.quando}`);
}
if (recentes.length) {
  problema = true;
  console.error(`${recentes.length} post(s) com falha nas últimas ${JANELA_H}h:`);
  for (const i of recentes) console.error(`  ${i.quando} — ${i.slug || '?'} — ${i.erro || i.status}`);
}
if (antigos) {
  console.log(`(${antigos} falha(s) antiga(s) na fila, fora da janela de ${JANELA_H}h — histórico, não alarme)`);
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
