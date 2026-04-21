---
name: Caption length by post type
description: Tamanho da legenda varia por tipo — Imagem IA e Notícia agora têm legenda profunda
type: feature
---
A regra de tamanho de legenda foi diferenciada por tipo de post (substitui regra antiga "300-800 chars para tudo"):

**Legenda PROFUNDA (800-1500 chars, 4 blocos):**
- `postType: 'noticia'` (Notícia)
- `postType: 'reflexao_profunda'` (Imagem IA — substituiu o antigo `engajamento` no `createImageContent`)

Estrutura obrigatória em 4 blocos separados por linha em branco:
1. Hook/Lead (2-3 linhas) — paga a tensão criada pela headline, sem repetir
2. Contexto + dados concretos (3-5 linhas) — o ouro
3. Análise/consequência (2-4 linhas) — opinião de quem entende
4. Provocação + (se notícia) "📰 Fonte: [site]"

**Justificativa:** o leitor NÃO vai clicar em link nenhum (não somos donos do site original da notícia). A legenda É o destino final — precisa entregar valor de verdade, não só prometer.

**Legenda CURTA (400-700 chars):** continua valendo para `engajamento`, `educacional`, `storytelling`, `viral`, `vendas`.

**Comportamento do CTA "👇 LEIA A LEGENDA COMPLETA":** removido para legendas profundas (a headline provocativa já puxa, e a legenda entrega — não promete).

Implementado em `supabase/functions/generate-caption/index.ts` (variáveis `isDeepCaption` e `sizeRules`).
