---
name: Unified Agent Vision (Chat + Cron)
description: agent-chat espelha exatamente a mesma visão do ai-agent-core (cron) — progresso semanal, próximo tipo, top performers
type: feature
---
O `agent-chat` calcula em tempo real, antes de montar o systemPrompt, o mesmo bloco de inteligência operacional do `ai-agent-core`:

- **Progresso semanal por tipo** (segunda 00:00 → domingo, Brasília UTC-3) usando `posts.workspace_id` filtrando drafts de reels e failed.
- **Metas por tipo** vindas de `agent_context.content_distribution_*` (com fallback 3/3/8/2/7/2).
- **Próximo tipo** (mesma regra do cron: Reels ativos novamente, marketing intercalado a cada 4 posts regulares quando há `affiliate_links` ativos).
- **Top 3 performers (30d)** por engajamento ponderado: `(likes + comments*2 + saves*3 + shares*3) / reach * 100`.

Esse bloco é injetado no `systemPrompt` como `## 📊 VISÃO OPERACIONAL UNIFICADA`, garantindo que o chat responda perguntas como "como tá a semana?" ou "o que devo postar?" com os MESMOS números que o cron usa para decidir, sem precisar chamar ferramenta extra.

**Como aplicar:** sempre que adicionar nova lógica de decisão no `ai-agent-core`, espelhar no `agent-chat` para manter a personalidade unificada (Agente Horvat fala e age igual nas duas pontas).
