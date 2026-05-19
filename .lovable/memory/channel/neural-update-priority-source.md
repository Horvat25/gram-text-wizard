---
name: Neural Update — fonte prioritária
description: Blog Atualização Neural (neural-update.com.br) é fonte prioritária do agente, com imagem original do RSS e CTA fixo na legenda
type: feature
---
O blog próprio **Atualização Neural** (https://neural-update.com.br, RSS em `/rss.xml`) é fonte prioritária do agente para posts de notícia/carrossel.

**Regras:**
1. `fetch-rss` inclui o feed no topo de `DEFAULT_FEEDS` com `priority: true`.
2. `ai-agent-core`, em `selectBestRssItem` e na seleção de carrossel, particiona `rss_items` — se houver itens com `source_name === 'Atualização Neural'` não usados, ranqueia APENAS esse pool. Outras fontes só entram quando o pool do blog está vazio.
3. Em `createNewsContent`, quando a notícia é do Neural Update: usa a imagem original do RSS como base, mas passa por `apply-text-overlay` para inserir headline programática + CTA visual. Se o overlay falhar, cai para `upload-external-image` direto (`overlayStatus = 'neural_original'`).
4. `generate-caption` sempre injeta um bloco final divulgando o blog:
   - Notícia do Neural Update → `📖 Leia o artigo completo no Neural Update 👉 {sourceUrl}`
   - Notícia de outra fonte → `📰 Fonte: {nome} — {url}` + `🧠 Acompanhe mais notícias de IA em neural-update.com.br`
   - Não-notícia (imagem IA, carrossel etc.) → `🧠 Mais notícias de IA no nosso blog: neural-update.com.br`
   Qualquer linha "Fonte:/🔗" gerada pela IA é removida antes de inserir o bloco oficial.
