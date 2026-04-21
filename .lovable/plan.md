

## Posts de imagem ficando como rascunho sem mídia

### Diagnóstico

Confirmei no banco: **6 posts de imagem** virando draft sem `image_url` nas últimas 24h. Todos vieram de artigos RSS que **tinham `og:image` válida** (`has_image = true`). Ou seja, a imagem original existia, mas o pipeline a descartou no caminho.

### Causa raiz

No `ai-agent-core` (linha 2762-2920), o fluxo de notícia faz:

```text
selectedImage (og:image real, válida)
   ↓
apply-text-overlay (gera headline + revisão PT-BR + SVG)
   ↓
   ├─ 422 (revisão PT-BR falha — HARD BLOCK) → overlayResponse.ok = false
   ├─ 500 (erro SVG/render)                  → overlayResponse.ok = false
   └─ network error                          → catch
   ↓
imageUrl = null
   ↓
Fallback add-watermark é chamado SÓ se overlayResponse.ok === true
   (não cobre 422/500/exception)
   ↓
Fallback upload-external-image — também depende de !imageUrl,
mas se algo na cadeia anterior já jogou exceção, pode pular
   ↓
Post salvo como draft com image_url = null
```

A `apply-text-overlay` foi reforçada recentemente com revisão de português obrigatória (HARD BLOCK 422) e novo render SVG offset de 8 sombras. Toda vez que esses dois bloqueiam, **a imagem real do artigo é jogada fora** em vez de cair para os fallbacks.

### Plano de correção

**1. Tornar a cadeia de fallback resiliente em `ai-agent-core/index.ts`** (função `handleNewsContent`, linhas ~2762-2867)

Refatorar a lógica de fallback para sempre garantir que `imageUrl` seja preenchido quando `selectedImage` existir:

```text
TENTATIVA 1: apply-text-overlay (com headline)
  ↓ falhou (422/500/erro)?
TENTATIVA 2: add-watermark (com headlineText do título original)
  ↓ falhou?
TENTATIVA 3: upload-external-image (imagem original sem nada)
  ↓ falhou?
ÚLTIMO: usar selectedImage diretamente (URL externa)

Resultado: post sempre é criado como 'scheduled' se autoPublish=true
e tiver QUALQUER imagem, mesmo sem overlay.
```

**2. Logar motivo do fallback** no `overlay_metadata` para rastrear quando o overlay falha (`overlay_status: 'fallback_no_overlay' | 'fallback_watermark_only' | 'success'`).

**3. Reprocessar os 6 rascunhos órfãos**: criar uma função de manutenção pontual que pega os 6 posts em draft com `media_type='image'` + `image_url IS NULL`, reaplica o pipeline corrigido buscando a `image_url` do `rss_items` vinculado, e atualiza o status para `scheduled` (ou mantém draft se realmente não houver imagem).

**4. Investigar e reduzir falsos positivos do HARD BLOCK PT-BR** em `apply-text-overlay`: o review está bloqueando headlines válidas. Suavizar para `WARN` em vez de `BLOCK` quando a confiança da rejeição for baixa, mantendo o bloqueio apenas para erros graves de ortografia. Isso evita que headlines tecnicamente OK sejam rejeitadas.

### Arquivos afetados

- `supabase/functions/ai-agent-core/index.ts` — refatorar cadeia de fallback de imagem (linhas 2762-2920)
- `supabase/functions/apply-text-overlay/index.ts` — suavizar HARD BLOCK do review PT-BR
- Script SQL pontual via migration para reagendar os 6 rascunhos órfãos com a `image_url` do `rss_items`

### Resultado esperado

- Nenhum post de notícia com imagem RSS válida vai mais cair em draft sem mídia
- Os 6 rascunhos atuais serão recuperados e voltam para a fila como `scheduled`
- Falhas de overlay viram posts publicados com a imagem original (sem headline) em vez de virarem draft órfão

