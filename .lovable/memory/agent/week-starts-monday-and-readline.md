---
name: Semana Brasília começa Segunda + Readline 7d
description: Toda lógica semanal dos agentes (cron + chat) usa Segunda como dia 1; agent-chat injeta diagnóstico de 7 dias e separa Blog vs Instagram
type: feature
---
**Início de semana = Segunda-feira (Brasília UTC-3)**

Tanto `ai-agent-core` quanto `agent-chat` calculam `mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek`. Domingo (0) recua 6 dias, qualquer outro dia volta até segunda. Nada usa `getDay()` cru como início de semana — isso causou o agente parar de postar mid-week porque as metas pareciam batidas usando domingo→sábado.

**Readline operacional 7 dias (agent-chat)**

O system prompt do `agent-chat` injeta uma tabela com publicados/falhas/drafts/agendados/pendentes por dia (BR) dos últimos 7 dias + amostras de `error_message`/`last_render_error`. O agente DEVE responder "o que aconteceu?", "por que postou pouco?", "cadê os posts?" usando essa tabela — nunca dizer "não sei".

**Separação Blog vs Instagram**

- `agent_proactive_messages.message_type='daily_blog_report'` → ícone Newspaper, badge azul "📰 Blog Neural Update"
- `agent_proactive_messages.message_type='report'` → ícone Instagram, badge rosa "📱 Instagram"
- O system prompt do agent-chat (Instagram) tem seção explícita dizendo que ele NÃO controla o blog e deve redirecionar perguntas sobre artigos.
