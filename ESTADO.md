# Instagram + Facebook — estado agora

> **Substituir, não acrescentar.** Histórico vai pro git. Atualizar a cada lote enfileirado.

**Atualizado:** 01/10/2026

## Fila (conferida no `origin/main` em 30/09)

| tipo | até | observação |
|---|---|---|
| Reels | qui 01/10 21:00 UTC (18h) | mesma grade do YouTube; 28/09–30/09 08h já publicados |
| Stories | qui 01/10 23:00 UTC (20h) | lote `stories/dia-2026-09-30-a-2026-10-01.json` (commit `fae0de3`) |
| Feed (carrossel 12h) | **nenhum agendado** | último lote de feed foi 25–27/09 |
| Facebook | acompanha cada Reel | o `publicar.mjs` repete na Página |

⚠️ **De sex 02/10 em diante não há nada.** Precisa do lote de vídeo antes dos Stories.

## Saúde

- Vigia `conferir-fila.mjs` mede **Reels e Stories separados** desde 30/09 (`99bdc58`).
- Token do Instagram (IG_TOKEN e FB_TOKEN): **vale até 31/12/2026** (medido 04/10 pelo `saude.yml`). Ele avisa 10 dias antes; não confiar em data escrita, ler o saude.
- 9 falhas antigas na fila (19/08–19/09): histórico, não alarme.

## Pendências desta plataforma

1. Stories de sex 02 e sáb 03 (depois que os vídeos existirem).
2. Decidir se o feed (carrossel 12h) volta. Ele parou em 27/09 sem decisão registrada.
3. Renovar o token até ~11/10 (clique do Marcelo).
