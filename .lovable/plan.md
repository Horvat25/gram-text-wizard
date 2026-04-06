

## Plano: Corrigir Sincronização do Crescimento + Pipeline de Vídeo com Template Branded

---

### Parte 1 — Corrigir Sincronização da Aba Crescimento

**Diagnóstico**: A função `sync-instagram-metrics` não mostra logs de erro, o que sugere que ela pode estar falhando silenciosamente (timeout, problema de token, ou o erro está sendo capturado no frontend sem mensagem útil). O `handleSync` no `AgentGrowthDashboard.tsx` faz um loop com batches de 50 posts, e se qualquer batch falhar, o erro genérico "Erro ao sincronizar" aparece.

**Correções**:

1. **Melhorar tratamento de erros no frontend** (`AgentGrowthDashboard.tsx`):
   - Capturar e exibir a mensagem de erro real retornada pela edge function (ex: "Nenhuma conta do Instagram conectada")
   - Adicionar timeout de 30s por batch para evitar travamentos

2. **Verificar resposta da edge function**: O `supabase.functions.invoke` retorna `{ data, error }` — se a edge function retorna status 400 (ex: "Nenhuma conta conectada"), o SDK trata como `error`, mas o `error` pode não ter a mensagem clara. Vou ajustar para extrair `error.message` ou `error.context?.body` corretamente.

3. **Adicionar log de diagnóstico**: Mostrar no toast qual erro específico ocorreu (token expirado, conta não encontrada, etc.)

---

### Parte 2 — Pipeline de Vídeo com Template Branded "Neural Update"

**Conceito**: O agente baixa vídeos curtos da internet (sobre IA/tech), enquadra dentro de um template visual fixo com a marca Neural Update, e publica como Reels.

**Arquitetura proposta**:

```text
┌─────────────────────────────────────┐
│         Template Neural Update       │
│  ┌─────────────────────────────┐    │
│  │    NEURAL UPDATE (header)    │    │
│  ├─────────────────────────────┤    │
│  │                             │    │
│  │     VÍDEO DA INTERNET       │    │
│  │     (área central 80%)      │    │
│  │                             │    │
│  ├─────────────────────────────┤    │
│  │  Headline / Caption (footer) │    │
│  └─────────────────────────────┘    │
│  @neuralupdate • IA • Tecnologia    │
└─────────────────────────────────────┘
```

**Etapas de implementação**:

1. **Nova edge function `download-stock-video`**:
   - Busca vídeos gratuitos no Pexels Video API (já tem `PEXELS_API_KEY`)
   - Query baseada no tema do post (ex: "artificial intelligence", "robot", "technology")
   - Baixa vídeo em resolução HD (720p ou 1080p vertical)
   - Faz upload para o bucket `post-videos` no Storage

2. **Nova edge function `frame-video-template`**:
   - Recebe: URL do vídeo original + headline + branding config
   - Usa FFmpeg (via servidor Remotion existente ou serviço externo) para:
     - Redimensionar vídeo para caber na área central (80% da tela)
     - Adicionar barras superior/inferior com a marca
     - Inserir texto da headline programaticamente
     - Exportar como MP4 vertical (1080x1920)
   - Retorna URL do vídeo processado

3. **Integrar no fluxo do agente** (`ai-agent-core`):
   - Novo tipo de conteúdo: "video_curated" (vídeo curado da internet)
   - Fluxo: escolher tema → buscar vídeo no Pexels → aplicar template → agendar publicação

4. **Template no frontend** (para preview):
   - Componente React que mostra o preview do vídeo dentro do template
   - Usa Canvas ou CSS para simular o enquadramento

**Dependências técnicas**:
- A composição de vídeo (FFmpeg) precisa de um serviço de renderização. O projeto já tem `RENDER_SERVICE_URL` e `remotion/` — podemos usar esse pipeline existente ou criar uma edge function com FFmpeg via Deno
- Alternativa mais simples: usar a API do Pexels para vídeos e aplicar o branding apenas via o encoder que já existe no `video-encoder.ts` (Canvas no browser), que já tem o template Neural Update

**Abordagem recomendada** (menor complexidade):
- Reutilizar o `video-encoder.ts` que já tem branding Neural Update
- Em vez de gerar 4 imagens com Ken Burns, ele receberia 1 vídeo de fundo + overlays de texto
- Isso mantém tudo no browser sem precisar de FFmpeg server-side

---

### Resumo das mudanças

| Arquivo | Mudança |
|---------|---------|
| `src/components/agent/AgentGrowthDashboard.tsx` | Melhorar tratamento de erros na sincronização |
| `supabase/functions/download-stock-video/index.ts` | Nova função para buscar vídeos no Pexels |
| `src/lib/video-encoder.ts` | Adicionar modo "video frame" com template branded |
| `supabase/functions/ai-agent-core/index.ts` | Adicionar tipo "video_curated" |

---

### Ordem de execução sugerida

1. Primeiro: corrigir a sincronização (impacto imediato)
2. Segundo: implementar download de vídeo stock via Pexels
3. Terceiro: adaptar o encoder para enquadrar vídeo em template
4. Quarto: integrar no agente autônomo

