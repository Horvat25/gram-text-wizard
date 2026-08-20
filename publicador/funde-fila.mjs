// funde-fila.mjs — junta a fila que ACABEI de publicar com a que está no GitHub agora.
//
// POR QUE EXISTE (20/08/2026, depois de um post sair DUPLICADO no @neuralupdate):
//
// O passo "Guardar o estado da fila" fazia `git add/commit/push` seco. Se qualquer
// outra coisa empurrasse pro main enquanto o publicador rodava — o agente corrigindo
// uma legenda, o workflow de métricas, outra rodada — o push era REJEITADO e o
// registro de "publicado" ia junto. A rodada seguinte lia o item ainda como
// "agendado" e publicava DE NOVO.
//
// Foi exatamente isso: o publicador postou o Reels das 18h, o push dele bateu num
// commit meu de 1 minuto antes, o estado se perdeu, e 30 minutos depois a rodada
// seguinte postou o mesmo vídeo outra vez.
//
// A CORREÇÃO: em vez de tentar empurrar por cima, a gente RECONCILIA. Regra única e
// simples: **quem já foi publicado ganha, sempre**. Publicar é irreversível; estado
// de fila não é. Na dúvida entre "agendado" e "publicado", "publicado" vence — assim
// o pior caso vira um post que não sai, e não um post que sai duas vezes.
//
//   node publicador/funde-fila.mjs <minha-fila.json> <fila-do-github.json> <saida.json>

import fs from 'node:fs';

const [meuPath, remotoPath, saidaPath] = process.argv.slice(2);
if (!meuPath || !remotoPath || !saidaPath) {
  console.error('uso: node funde-fila.mjs <minha.json> <remota.json> <saida.json>');
  process.exit(1);
}

const meu = JSON.parse(fs.readFileSync(meuPath, 'utf8'));
const remoto = JSON.parse(fs.readFileSync(remotoPath, 'utf8'));

// A chave é slug+horário: o mesmo slug pode legitimamente aparecer em dois horários.
const chave = i => `${i.slug || ''}|${i.quando}`;
const PESO = { publicado: 3, falhou: 2, perdido: 2, agendado: 1 };

const juntos = new Map();
for (const i of remoto) juntos.set(chave(i), i);

for (const i of meu) {
  const k = chave(i);
  const outro = juntos.get(k);
  if (!outro) { juntos.set(k, i); continue; }                    // item novo meu
  const meuPeso = PESO[i.status] ?? 0;
  const outroPeso = PESO[outro.status] ?? 0;
  if (meuPeso > outroPeso) { juntos.set(k, i); continue; }       // eu publiquei, ele não
  if (outroPeso > meuPeso) continue;                             // ele publicou, eu não
  // Mesmo status: fica o do GitHub, mas herda o que só eu tenho (id do comentário etc).
  juntos.set(k, { ...i, ...outro });
}

const saida = [...juntos.values()].sort((a, b) => new Date(a.quando) - new Date(b.quando));
fs.writeFileSync(saidaPath, JSON.stringify(saida, null, 2) + '\n', 'utf8');

const conta = s => saida.filter(i => i.status === s).length;
console.log(`fundido: ${saida.length} itens · ${conta('publicado')} publicados · ${conta('agendado')} agendados · ${conta('falhou')} falhas`);

// Rede de segurança: se dois itens tiverem o mesmo id do Instagram, alguma coisa
// publicou duas vezes e a gente precisa saber AGORA, não pelo print do Marcelo.
const ids = saida.map(i => i.id_instagram).filter(Boolean);
const dup = ids.filter((x, n) => ids.indexOf(x) !== n);
if (dup.length) console.error('⚠️ ATENÇÃO: id do Instagram repetido na fila: ' + [...new Set(dup)].join(', '));
