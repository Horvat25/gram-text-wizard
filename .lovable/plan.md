## Objetivo

Integrar o blog **Atualização Neural** (https://neural-update.com.br) como fonte prioritária de notícias do agente, garantindo que:
1. O feed do blog é puxado e tratado como fonte preferencial.
2. Quando há matéria nova do Neural Update não usada, ela é escolhida antes de qualquer outra fonte.
3. A imagem do post vem direto do RSS do blog (sem gerar imagem por IA).
4. A legenda sempre divulga o blog, com CTA + link diferenciado conforme a fonte.

---

## 1. `supabase/functions/fetch-rss/index.ts`

- Adicionar no topo da lista `DEFAULT_FEEDS` (primeira posição):
  ```ts
  { name: 'Atualização Neural', url: 'https://neural-update.com.br/rss.xml', priority: true }
  ```
- Estender o tipo do feed para aceitar `priority?: boolean` (sem quebrar feeds existentes).
- Como o fetch já é em paralelo, a ordem na fila é decidida no `ai-agent-core`. Aqui só garantir que o feed entra no `rss_items` normalmente (campos atuais já bastam — `source_name = 'Atualização Neural'` já identifica).

## 2. `supabase/functions/ai-agent-core/index.ts` — priorização

Dois pontos de seleção a ajustar:

**a) `selectBestRssItem` (linha ~2604):** após buscar `rssItems`, antes do `calculateNewsRankingScore`, separar:
```ts
const neuralItems = rssItems.filter(i => i.source_name === 'Atualização Neural');
const others = rssItems.filter(i => i.source_name !== 'Atualização Neural');
const pool = neuralItems.length > 0 ? neuralItems : others;
```
e ranquear apenas o `pool`. Logar `[AGENT] 🟢 Usando fonte prioritária Neural Update`.

**b) Carrossel (linha ~1597):** mesma lógica de partição antes do `scored = ...`.

## 3. `ai-agent-core` — imagem do Neural Update

Em `createNewsContent` (linha ~2649), quando `rssItem.source_name === 'Atualização Neural'`:
- **Não chamar** `generate-image`.
- Usar `rssItem.image_url` direto como `image_url` do post (já é o que `selectedImage` recebe — só garantir que o caminho de geração de imagem por IA é pulado).
- Se por algum motivo o item Neural Update não tiver `image_url`, cair no fluxo padrão.

Localizar o trecho onde, hoje, depois de selecionar a notícia, ele decide entre usar `selectedImage` ou gerar nova com IA — adicionar guard `isNeuralUpdate = rssItem.source_name === 'Atualização Neural'` que força reuso da imagem original.

## 4. `supabase/functions/generate-caption/index.ts` — CTA do blog

- Aceitar dois novos campos no body: `sourceUrl?: string` e `sourceName?: string` (já é passado em alguns chamados; padronizar).
- No bloco final da legenda (substituindo/expandindo o atual `📰 Fonte: ...`), aplicar:
  - **Se `sourceName === 'Atualização Neural'`:**
    ```
    📖 Leia o artigo completo no Neural Update 👉 {sourceUrl}
    ```
  - **Se vier de outra fonte:**
    ```
    📰 Fonte: {sourceName} — {sourceUrl}
    🧠 Acompanhe mais notícias de IA em neural-update.com.br
    ```
  - **Se não for `noticia` (imagem IA, carrossel, etc.):**
    ```
    🧠 Mais notícias de IA no nosso blog: neural-update.com.br
    ```
- Garantir que o CTA do blog **substitui** o atual `🔗 {sourceUrl}` cru e não duplica.
- Atualizar também o trecho do `ai-agent-core` (linhas ~2916 e ~2932) que monta a fonte manualmente fora da `generate-caption` para usar o mesmo formato (ou remover, deixando a `generate-caption` ser única responsável).

## 5. Memória do projeto

Adicionar nova memory `mem://channel/neural-update-priority-source.md` documentando:
- Atualização Neural é fonte prioritária de notícias.
- Imagem do post vem do RSS do blog quando a notícia é dele.
- Toda legenda inclui CTA para o blog (formato varia conforme fonte).

---

## Fora de escopo (confirmar antes de incluir)

- Não vou criar nova tabela / painel de "fontes prioritárias" (deixar hardcoded por enquanto).
- Não vou alterar TikTok (`publish-to-tiktok`, etc.) — pedido fala só em Instagram, mas a `generate-caption` é compartilhada; o CTA aparecerá em TikTok também. **OK?**
- Não vou refazer `fetch-rss` para ordenar/deduplicar — só adicionar o feed.
