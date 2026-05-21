## O que JÁ existe (não vou tocar)

Mapeei o código antes de propor mudanças. Já está implementado:

- **Fonte prioritária Neural Update**: `fetch-rss` traz o RSS do blog próprio com `priority: true`; `ai-agent-core` (linhas 1686-1689 e 2702-2705) já filtra `source_name === 'Atualização Neural'` e prioriza esses itens tanto pra carrossel quanto pra post normal.
- **Carrossel IG**: `ai-agent-core` gera carrossel a partir do pool Neural (com imagem original sem overlay quando vem do blog próprio — linhas 2859-2867).
- **Reels automáticos**: `auto-reel-publisher` (cron 2x/dia) puxa Neural primeiro, cria post `generating` e dispara `brand-news-video` → renderiza vídeo 9:16 com voz Sarah, manchete SVG, headline gold, watermark Neural Update.
- **CTA fixo no blog**: `ai-agent-core` linhas 141-146 já injeta `🧠 Acompanhe mais notícias de IA em neural-update.com.br` automaticamente em todo conteúdo derivado de RSS.
- **Imagens reais por tema**: `fetch-real-news-images` com ranking por entidade (Pexels + Unsplash + og:image).
- **Revisão PT-BR obrigatória**: `review-portuguese` bloqueia publicação se script/legenda falha.
- **Métricas IG**: `sync-instagram-metrics` sincroniza likes/comments/reach por post.

**Não vou mexer em nada disso.** Vou só adicionar a camada de *distribuição multi-formato por artigo* em cima do que já existe.

---

## O que vou construir (novo, sem quebrar nada)

### 1. Tabela `article_distributions` (nova)
Liga 1 artigo do blog (`rss_items`) a N posts derivados. Sem isso não dá pra rastrear "este artigo já virou carrossel + reels + snippets?".

Campos: `rss_item_id`, `workspace_id`, `format` (`carousel|reels|story|snippet|tweet`), `post_id` (FK opcional pra `posts`), `status`, `cta_clicks`, `created_at`.

### 2. Edge function `article-to-instagram` (nova)
Recebe `rss_item_id` e dispara em paralelo os formatos pedidos. **Reusa** funções existentes:
- Carrossel → mesmo fluxo do `ai-agent-core` (extrai pra helper compartilhado)
- Reels → chama `auto-reel-publisher` lógica de criação + `brand-news-video`
- Snippets → nova chamada Gemini Flash Lite com schema fixo (3 hooks de Story + 3 frases de Tweet + 1 TL;DR)

Tudo grava em `article_distributions` pra dedup.

### 3. Estrutura editorial do carrossel (refinada, dentro do gerador já existente)
Em vez de slides livres, vou impor o template que pediu via prompt estruturado:
- **Slide 1**: hook (banco de 8 padrões: "Você ainda…?", "X coisas que…", "O ChatGPT consegue ISSO?", etc.)
- **Slides 2-6**: insights extraídos de TL;DR + subtítulos + FAQ do artigo
- **Slide 7**: CTA "Link na bio → neural-update.com.br"

Visual já é dark/gold (memória "Branding Direction") — só ajusto tipografia dos slides 2-6 pra um destaque neon/gradiente nas palavras-chave (extraídas via Gemini).

### 4. Roteiro Reels estruturado (refinado, dentro de `generate-story-script`)
Template fixo de 30-45s:
- 0-3s: hook (mesma lib de hooks do carrossel)
- 3-30s: 3 insights do artigo (TL;DR/pontos-chave)
- 30-45s: CTA blog

### 5. Social Snippets (novo endpoint leve)
`generate-social-snippets` — Gemini Flash Lite, schema JSON:
```
{ stories: [3], tweets: [3], tldr: string, hooks: [5] }
```
Salvos como rows em `article_distributions` com `format='snippet'`. UI mostra na aba do artigo pra copiar/agendar.

### 6. Tracking de tráfego IG → Blog
- UTM automático em todos CTAs: `?utm_source=instagram&utm_medium=<carousel|reels|story>&utm_campaign=<rss_item_id>`
- Coluna `cta_clicks` populada via webhook do blog (você cola um pixel/edge endpoint).
- View `article_performance` agrega: posts gerados, reach, comments, CTR estimado.

### 7. Trigger automático
Quando `fetch-rss` insere um item novo com `source_name='Atualização Neural'`:
- Trigger Postgres chama `article-to-instagram` via `pg_net` com `formats=['carousel','reels','snippets']`.
- Respeita limites já existentes (2 reels/24h, gap 6h).

### 8. UI mínima
Nova aba **"Artigos → IG"** dentro de Agente:
- Lista artigos Neural Update
- Status de cada formato (verde = gerado, cinza = pendente, vermelho = falhou)
- Botão "Gerar tudo" e botões individuais por formato
- Preview dos snippets pra copiar

---

## Ordem de implementação (sua prioridade: carrossel + reels dos artigos existentes primeiro)

```text
Fase 1 (esta entrega)
├── Migration: article_distributions + view article_performance
├── Edge: article-to-instagram (carousel + reels reusando código atual)
├── Refino prompt: hooks + estrutura 7-slides + CTA UTM
└── UI: aba "Artigos → IG" com botões manuais

Fase 2 (próxima)
├── generate-social-snippets
├── Trigger automático no fetch-rss
└── Tracking real de cliques (endpoint /track-click)
```

---

## Detalhes técnicos

- **Sem duplicação**: helper `buildCarouselFromArticle()` extraído de `ai-agent-core` pra `_shared/article-to-content.ts`. `ai-agent-core` continua chamando o mesmo helper — comportamento atual idêntico.
- **Custo**: snippets usam `google/gemini-3.1-flash-lite-preview` (memória "Cost Optimization"). Carrossel/Reels já têm orçamento próprio.
- **PT-BR**: `review-portuguese` aplicado em hooks, snippets e CTAs.
- **Dedup**: antes de gerar, checa `article_distributions` pra não recriar formato que já existe.
- **Workspace isolation**: tudo via RLS no `workspace_id` (memória "Multi-workspace").

Confirma que posso seguir com Fase 1?