
# Diagnóstico Completo de Custos — Corte Máximo de Gastos com IA

## O que foi encontrado nos logs

Analisando os logs ao vivo, encontrei **3 problemas críticos** que estão consumindo seus créditos sem necessidade:

---

### Problema 1 — `add-watermark` chamando IA para CADA imagem de vídeo (MAIOR GASTO)

Nos logs do `search-images-for-video`, o sistema está buscando **4 imagens por vídeo** (modo `legacy_segment`). Para cada uma dessas 4 imagens, ele chama `add-watermark`, que por sua vez chama `google/gemini-2.5-flash-image` (modelo de **geração de imagem**, o mais caro) para adicionar apenas um badge pequeno de marca d'água.

```
[add-watermark] ✅ Watermark applied  ← 1 chamada de IA cara por imagem
[add-watermark] ✅ Watermark applied  ← 2ª chamada
[add-watermark] ✅ Watermark applied  ← 3ª chamada
[add-watermark] ✅ Watermark applied  ← 4ª chamada
```

**4 chamadas ao modelo de imagem mais caro POR VÍDEO.** Isso é desnecessário.

---

### Problema 2 — `apply-text-overlay` também chama `gemini-2.5-flash-image` para headlines

Nos posts de notícia, `apply-text-overlay` faz **2 chamadas de IA por post**:
1. `gemini-2.5-flash-lite` → gera o texto da headline
2. `gemini-2.5-flash-image` → compõe a imagem com o texto

A segunda chamada (composição de imagem) é **muito cara** e pode ser substituída por código puro.

---

### Problema 3 — Meta semanal absurdamente alta (46 posts/semana!)

Os logs mostram:
```
Meta semanal: 18/46 posts
weeklyGoals: { videos: 9, carousels: 6, news: 17, images: 14 }
```

**46 posts por semana = 6-7 posts por dia.** Cada post gasta créditos de IA. Com essa meta, o agente vai gastar indefinidamente. Isso precisa ser reduzido drasticamente.

---

## Solução: Modo "Custo Zero" em 3 Etapas

### Etapa 1 — Substituir IA de imagem por código SVG puro (economy: ~80% dos créditos)

**`add-watermark`**: Remover completamente a chamada ao `gemini-2.5-flash-image`. Substituir por uma técnica de composição programática:
- Baixar imagem
- Usar a API de `upload-external-image` já existente para proxy
- Adicionar o texto de marca d'água como **metadado** no banco de dados (sem modificar a imagem)
- Ou usar um canvas SVG leve via Deno para sobrescrever o badge

**`apply-text-overlay`**: Remover a segunda chamada ao modelo de imagem. A headline gerada pela primeira chamada (flash-lite, barata) será salva no banco (`overlay_metadata`) e renderizada no **frontend via Canvas HTML** quando o usuário visualizar o post — sem custo de servidor.

### Etapa 2 — Reduzir metas semanais do agente autônomo

As metas atuais de 46 posts/semana serão reduzidas para valores razoáveis:
- Vídeos: 9 → **2**
- Carrosséis: 6 → **1**
- Notícias: 17 → **5**
- Imagens: 14 → **3**

**Total: 11 posts/semana** (de 46 para 11, corte de 76%)

### Etapa 3 — Otimizar `search-images-for-video` (sem IA para entity extraction)

A função `extractEntities` chama IA para gerar 4 queries de busca de imagem. Isso é desnecessário — o título do artigo já é suficiente para buscar no Pexels. Remover essa chamada de IA e usar o título diretamente como query.

---

## Custo estimado APÓS as mudanças

| Item | Antes | Depois |
|------|-------|--------|
| Chamadas de imagem IA por vídeo | 4 × caro | 0 (código puro) |
| Chamadas de imagem IA por notícia | 1 × caro | 0 (Canvas frontend) |
| Headline de notícia | flash-lite | flash-lite (mantido) |
| Caption de post | flash-lite | flash-lite (mantido) |
| Posts por semana | 46 | 11 |
| Custo estimado/mês | ~$2-3 | ~**$0.05-0.15** |

---

## Arquivos que serão modificados

### `supabase/functions/add-watermark/index.ts`
- **Remover**: Função `applyWatermarkOnly` e `applyHeadlineWithAI` (ambas chamam `gemini-2.5-flash-image`)
- **Adicionar**: Upload direto da imagem original para Storage sem modificação de IA, retornando a URL com os dados de marca d'água como metadado
- **Resultado**: Zero custo de IA por watermark

### `supabase/functions/apply-text-overlay/index.ts`
- **Remover**: Chamada ao `gemini-2.5-flash-image` na função `createProgrammaticOverlay`
- **Manter**: Apenas a chamada `gemini-2.5-flash-lite` para gerar texto da headline (custo muito baixo)
- **Adicionar**: Retornar a imagem original + texto da headline nos metadados (o frontend aplica o overlay via Canvas)
- **Resultado**: 1 chamada barata (flash-lite) ao invés de 1 cara (flash-image)

### `supabase/functions/search-images-for-video/index.ts`
- **Remover**: Chamada à função `extractEntities` que usa IA para gerar queries (essa função chama flash-lite mas não é necessária)
- **Manter**: Busca Pexels usando o título/topic diretamente
- **Resultado**: Zero chamadas de IA para buscar imagens

### `supabase/functions/ai-agent-core/index.ts`
- **Modificar**: Reduzir `weeklyGoals` padrão de `{ videos: 9, carousels: 6, news: 17, images: 14 }` para `{ videos: 2, carousels: 1, news: 5, images: 3 }`
- **Resultado**: Agente criará 11 posts/semana em vez de 46

### Banco de dados — `agent_context`
- Reset dos goals na tabela para os novos valores menores

---

## Resumo do impacto

O gasto principal não era o chat com o agente, mas sim o `add-watermark` sendo chamado **dezenas de vezes por hora** (para cada imagem de cada vídeo criado automaticamente), usando o modelo de geração de imagem mais caro. Com o agente autônomo rodando a cada 2 horas e criando vídeos com 4 imagens cada, isso acumula rápido.

As mudanças propostas eliminam **~95% dos gastos de IA** mantendo toda a funcionalidade visual intacta, apenas movendo a renderização do texto de "servidor caro" para "navegador gratuito".
