# Instagram + Facebook — como medir (do jeito desta rede)

> Camada 2: ler só quando for medir ou concluir algo. Dados começam em **17/06/2026**.
> Toda conclusão com o tamanho da amostra (n=…).

## A pergunta que cada métrica responde

| formato | métrica principal | por quê |
|---|---|---|
| **Reels** | **tempo médio assistido ÷ duração** (`ig_reels_avg_watch_time`, em ms) | é a retenção do Insta; views sozinhas enganam |
| Reels | **compartilhamentos e salvos** | "mandar pra alguém" pesa 3–5x mais que curtida na distribuição |
| Reels | seguidores ganhos no dia | o Insta premia formatos diferentes do YouTube (a aula, pior formato no YT, foi a que mais viralizou aqui) |
| **Stories** | alcance e respostas de cada Story | a API só entrega enquanto o Story está no ar (24h); por isso existe o coletor a cada 6h |
| **Feed (carrossel)** | salvos | carrossel é conteúdo de guardar |
| **Funil** | cliques com origem `?o=ig` em `neural-update.com.br/api/clique` | Story não tem link clicável pela API: atribuir pelo **horário** do Story |
| **Facebook** | média de views por Reel | régua combinada com o Marcelo: se ficar abaixo de ~50 views por Reel em 2 semanas, não investir mais lá |

## De onde vem cada número

| arquivo | o que tem | quem gera | quando |
|---|---|---|---|
| `publicador/metricas.json` | últimos 50 posts: views, alcance, curtidas, comentários | `metricas-instagram.mjs` (GitHub) | diário 06h20 BRT |
| `publicador/metricas-facebook.json` | Reels da Página | `metricas-facebook.mjs` (GitHub) | diário, junto |
| `publicador/stories-historico.json` | último retrato de cada Story antes de expirar | `metricas-stories.mjs` (GitHub) | a cada 6h |
| `publicador/metricas-historico.json` | **histórico inteiro** + tempo médio assistido dos Reels | `metricas-historico-instagram.mjs` (GitHub) | sob demanda |
| `publicador/radar-cta.json` | o que contas comerciais pedem em "comenta X" | `radar-cta.mjs` (GitHub) | diário 06h05 |
| `../analytics/jev/instagram-historico.json` | cópia para o sistema de análise | Claude | quando coleta |

O `IG_TOKEN` só existe como secret do GitHub: **coletor do Insta roda no Actions, não no PC.**

## Armadilhas

- `metricas-instagram.mjs` lê **uma página só** (50 posts). Para análise, usar o histórico.
- Retenção cai quando o alcance sobe (r = −0,64 no YouTube): comparar vídeos de alcance parecido.
- Comparar o mesmo vídeo no Insta e no YouTube antes de concluir qualquer coisa sobre conteúdo.
- Separar tráfego de teste (`teste-*`, `prova-*`) dos números de clique.
