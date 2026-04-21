

## Portal Neural Update: site público de notícias de tecnologia

Transformar o app numa **plataforma editorial completa**, onde o portal Neural Update é a fonte primária — as redes sociais (Instagram/TikTok) passam a ser **distribuição** do que já foi publicado no site.

### Visão geral

```text
RSS / Firecrawl (notícias frescas)
        ↓
  Agente Horvat escreve artigo COMPLETO (1x — armazenado)
        ↓
   ┌────────────────────────────────────────┐
   │   Artigo no Portal Neural Update       │  ← fonte da verdade
   │   (público, SEO, /noticia/slug)        │
   └────────────────────────────────────────┘
        ↓ (reaproveita: título + resumo + imagem)
   Posts Instagram / TikTok / Carrossel
   (zero crédito extra — tudo pré-pronto)
```

### O que vai ser construído

**1. Site público "Neural Update" (rotas abertas, sem login)**
- `/` — homepage do portal: manchete principal + grade de últimas notícias por categoria (IA, Gadgets, Futuro, Mercado, Ciência)
- `/noticia/:slug` — página individual do artigo (título SEO, hero image, corpo formatado, tempo de leitura, autor "Agente Horvat", data, tags, "leia também")
- `/categoria/:nome` — listagem filtrada por categoria
- `/busca?q=` — busca por palavra-chave
- `/sobre` — página institucional do Neural Update
- Header com logo + menu de categorias + busca; Footer com links sociais (IG/TikTok), políticas, RSS feed

**2. Painel administrativo (rotas protegidas — login atual)**
- Tudo que já existe (Agente, Fila, Crescimento, Teste, Histórico) continua igual em `/admin`
- Nova aba **"Portal"**: lista de artigos publicados no site, edição manual, destaque de manchete, agendamento

**3. Geração de conteúdo otimizada para custo**
- Agente roda RSS/Firecrawl (já existe) → escolhe notícia → **gera UMA vez** o artigo completo (~600-1000 palavras) + título SEO + meta description + imagem hero + 5-8 tags
- A partir desse mesmo artigo, **derivações gratuitas** (sem nova chamada de IA):
  - **Post imagem IG**: reaproveita hero + título como headline overlay + parágrafo de abertura como legenda
  - **Carrossel**: divide artigo em 3 blocos lógicos (intro, ponto-chave, conclusão) → vira 3 slides
  - **Reels notícia**: usa o resumo já gerado como roteiro
- Resultado: **1 chamada cara de IA** alimenta o site + 3 formatos de redes sociais

**4. SEO e descoberta**
- Sitemap.xml automático
- Meta tags Open Graph (preview rico no WhatsApp/Twitter)
- Schema.org NewsArticle (aparece bonito no Google)
- RSS feed próprio (`/feed.xml`) — outros sites podem consumir o Neural Update
- URLs amigáveis em PT-BR (ex: `/noticia/openai-lanca-novo-modelo-2026`)

**5. Domínio próprio**
- Você compra **neuralupdate.com.br** direto via Lovable Settings → Domains
- Subdomínio `app.neuralupdate.com.br` para o painel admin
- Domínio raiz `neuralupdate.com.br` para o portal público
- SSL automático

### Estrutura técnica (resumo para você)

**Banco de dados** — nova tabela `articles`:
- `id`, `workspace_id`, `slug` (único), `title`, `subtitle`, `content` (markdown/html), `excerpt`, `hero_image_url`, `category`, `tags[]`, `author_name`, `status` (draft/published), `published_at`, `view_count`, `seo_title`, `seo_description`, `og_image_url`, `source_rss_item_id`, `linked_post_ids[]` (vínculo com posts IG/TikTok já gerados)
- RLS: SELECT público (`USING true` quando `status='published'`); INSERT/UPDATE/DELETE só para editores do workspace

**Edge functions novas/modificadas**:
- `generate-article` (nova): pega item RSS + Firecrawl deep research → gera artigo completo de uma vez
- `derive-social-from-article` (nova): pega `article_id` → cria entradas em `posts` para IG/TikTok sem nova chamada de IA
- `ai-agent-core` (modificada): novo fluxo "article first" — gera artigo, depois deriva os formatos sociais

**Roteamento**:
- `App.tsx` ganha rotas públicas: `/`, `/noticia/:slug`, `/categoria/:nome`, `/busca`, `/sobre`
- Painel admin migra para `/admin/*` (mantém auth atual)
- Quando o domínio próprio for conectado: `app.` → painel, raiz → portal

**Componentes a criar**:
- `src/pages/portal/Home.tsx`, `ArticlePage.tsx`, `CategoryPage.tsx`, `SearchPage.tsx`, `About.tsx`
- `src/components/portal/PortalHeader.tsx`, `PortalFooter.tsx`, `ArticleCard.tsx`, `HeroArticle.tsx`, `CategoryNav.tsx`
- `src/components/admin/ArticlesManagerTab.tsx` (nova aba no painel)
- `src/lib/article-helpers.ts` (slug generator, reading time, markdown render)

### Entrega faseada

**Fase 1 (esta entrega)** — base funcional:
- Tabela `articles` + RLS
- Edge function `generate-article` integrada com RSS + Firecrawl
- Rotas públicas do portal (Home, Artigo, Categoria, Busca)
- Painel admin: aba "Portal" para listar/editar artigos
- Header/Footer do portal com identidade Neural Update
- SEO básico (meta tags, Open Graph)

**Fase 2 (próxima conversa)**:
- Derivação automática artigo → IG/TikTok (a integração com `ai-agent-core` existente)
- Sitemap.xml + RSS feed + Schema.org
- Newsletter (captura de email)
- Compra do domínio neuralupdate.com.br

### Custo de IA reduzido

- **Antes**: cada formato (post imagem, carrossel, reels) = 1 chamada de IA = 3 chamadas/notícia
- **Depois**: 1 chamada gera o artigo, e os formatos sociais são montados por código (template + recortes do texto) = **~70% menos custo de IA por notícia publicada nos 3 lugares**

