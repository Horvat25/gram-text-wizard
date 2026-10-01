# Instagram + Facebook — o que roda sozinho e o que ainda é manual

> Camada 2. Regra: **automação só no GitHub** (agente e PC acabam crédito ou desligam, e a rotina
> morre calada). Toda automação precisa de um alarme que avise quando ela parar.

## Robôs no GitHub (`.github/workflows/`)

| workflow | faz | quando (BRT) | alarme |
|---|---|---|---|
| `instagram.yml` | publica o que venceu na fila, repete o Reel no Facebook, comenta no YouTube | várias rodadas por hora nos horários de post | `saude.yml` |
| `saude.yml` | token vivo? post atrasado? fila acabando **por tipo**? Facebook saiu? | 09h, 16h, 23h | falha = e-mail do GitHub |
| `metricas.yml` | números do Insta e do Facebook | 06h20 | — |
| `metricas-stories.yml` | guarda métricas dos Stories antes de expirarem | a cada 6h | — |
| `metricas-historico.yml` | histórico completo do Insta | sob demanda | — |
| `radar-cta.yml` | lê "comenta X" de contas comerciais | 06h05 | — |

**Reservas do cron** (o cron do GitHub já engoliu manhãs inteiras):
- Worker do Cloudflare em `cron-externo/` (conta horvatvendas; token vence 13/09/2027).
- Tarefa do Windows `NeuralUpdate-Instagram` → `publicador/gatilho-silencioso.vbs` (PC ligado).
- O workflow relê a fila nova antes de publicar, pra disparo duplo não postar 2x.

## Manual: o que um agente ainda faz à mão (candidatos a automatizar)

| tarefa | como se faz hoje | dá pra automatizar? |
|---|---|---|
| **Reels na fila** | importar os vídeos do lote do YouTube (`../YouTube/`) | sim: o lote do YouTube já tem slug e horário. Falta um passo que enfileire ao agendar |
| **Stories** | `node ../YouTube/gera-stories.js stories/<lote>.json` → `node ../YouTube/insta-stories-fila.js <fila do origin> <lote> --seco` → sem `--seco` → acrescentar os itens novos num worktree limpo do `origin/main` → push | **sim, é o próximo da lista.** O Story de notícia é trailer do vídeo do dia; o de 16h é a aula do dia; o Kindle gira entre 3 modelos. Tudo derivável do lote. ⚠️ O `gera-stories-dia.js` procura notícias em `lotes/*.json` e não acha os lotes do Flow |
| **Legendas** | escritas por lote em `../YouTube/lotes/insta-legendas-*.json` | parcial: precisa de revisão humana |
| **Carrossel 12h** | `../YouTube/carrossel/render.js` + `enfileira.js` + `poe-na-fila.js` | parcial |
| **Renovar token** | o Marcelo gera um novo a cada 60 dias | não pela API; o alarme avisa com 10 dias |
| **Automação de DM** (palavra-chave → mensagem) | ligada no Business Suite pelo Marcelo | é recurso da Meta, sem API nossa |
