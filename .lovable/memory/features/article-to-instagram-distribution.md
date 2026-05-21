---
name: Article to Instagram Distribution
description: Distribuição multi-formato de artigos Neural Update → carrossel/reels/snippets via edge function article-to-instagram + tabela article_distributions
type: feature
---

Pipeline novo (Fase 1) que NÃO substitui o auto-reel-publisher nem o ai-agent-core — adiciona camada de distribuição manual por artigo.

**Tabela `article_distributions`**: rastreia (rss_item_id, format, post_id, status, cta_clicks). UNIQUE em (rss_item_id, format) garante dedup. View `article_performance` agrega métricas por artigo.

**Edge function `article-to-instagram`**:
- Body: `{ rss_item_id, formats?: ['carousel'|'reels'|'snippet'], force? }`
- Carrossel: cria post `draft` com `overlay_metadata.slides` (1 hook + 5 insights + 1 CTA). Usa banco fixo de hooks (HOOK_BANK) + Gemini Flash Lite JSON.
- Reels: mesmo padrão do auto-reel-publisher (post `generating` + brand-news-video em background).
- Snippets: gera tldr/stories/tweets/hooks, salvos só em `article_distributions.payload` (sem post).
- CTA com UTM: `?utm_source=instagram&utm_medium=<fmt>&utm_campaign=<rss_id>`.

**UI**: novo botão "Distribuir" no AgentGenieView (entre Teste e Histórico), abre `ArticleDistributionPanel` listando artigos do Neural Update com status por formato e botão "Gerar tudo". Snippets expandem inline pra copiar.

**Fase 2 (pendente)**: trigger automático no fetch-rss, endpoint de tracking de cliques real.
