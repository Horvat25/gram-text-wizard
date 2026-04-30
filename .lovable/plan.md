## Problema identificado

A legenda do post no Instagram aparece cortada no meio de uma palavra ("...mais p"). Não é fim natural — é truncamento.

**Causa raiz:** a função `supabase/functions/review-portuguese/index.ts` (linha 190) está configurada com `max_tokens: 500`. Toda legenda de notícia/reflexão profunda tem entre 800 e 1500 caracteres (~400-700 tokens só do texto, mais raciocínio), então a resposta da IA estoura o limite, vem truncada, e a função substitui a legenda original por essa versão cortada.

O fluxo é:
```text
generate-caption → caption completa (1200 chars)
        ↓
review-portuguese (max_tokens: 500) → resposta truncada em "...mais p"
        ↓
caption = reviewResult.corrected   ← sobrescreve a legenda boa
        ↓
post no Instagram com texto comido
```

Confirmado por: `ai-agent-core/index.ts` linhas 2007-2030 e contextos similares (3 outros lugares fazem revisão de caption).

## Correções

### 1. `supabase/functions/review-portuguese/index.ts`
- **Aumentar `max_tokens` de 500 para 4096** — suficiente para qualquer caption (até 2200 chars do limite do Instagram).
- **Adicionar guarda de segurança**: se o texto revisado vier com tamanho < 70% do original, descartar e retornar o original (proteção contra truncamento futuro por qualquer motivo — limite de tokens, finishReason MAX_TOKENS, etc).
- **Logar `finish_reason`** da resposta da IA pra detectar truncamento explicitamente.
- **Para `type: 'caption'`**: instruir explicitamente o prompt a preservar TODOS os parágrafos, fonte e hashtags.

### 2. `supabase/functions/ai-agent-core/index.ts`
- Nos 4 pontos onde `review-portuguese` é chamado em cima de caption, adicionar fallback defensivo no chamador também: se `corrected.length < caption.length * 0.7`, manter a original e logar warning. Defesa em profundidade.

### 3. Limpar drafts existentes
- Verificar se há posts com caption truncada na fila (`status = 'draft'` ou `'scheduled'` com caption terminando em palavra cortada / sem pontuação final / sem hashtags). Se houver, regerar a caption ou remover.

## Detalhes técnicos

- Modelo `gemini-2.5-flash` aceita até 8192 tokens de output. 4096 é folga confortável.
- A heurística de "70% do tamanho" é segura: revisão ortográfica raramente reduz texto em mais de 30%; quando reduz mais, é truncamento.
- Não vou mexer em `generate-caption` — esse já gera certo (sem `max_tokens`, usa default do gateway). O bug é só no revisor.

## Resultado esperado

Próximas notícias publicadas no Instagram terão a legenda completa, com os 3-4 parágrafos, "📰 Fonte:" e hashtags íntegros.