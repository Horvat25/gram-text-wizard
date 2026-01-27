

# Plano: Correção do ElevenLabs TTS e Adição de Trilha Sonora nos Vídeos

## Diagnóstico

Após análise completa do código, identifiquei os seguintes problemas:

### Problemas Encontrados

1. **Bug de encoding no `elevenlabs-music` e `elevenlabs-sfx`**
   - Usam `btoa()` com spread operator que pode causar stack overflow em buffers de áudio grandes
   - A função `elevenlabs-tts` corretamente usa o encoder do Deno, mas music/sfx não

2. **O hook `useNarrativeVideo.ts` não gera trilha sonora**
   - Este hook só gera narração (TTS)
   - Não tem integração com `elevenlabs-music` para gerar música de fundo

3. **O hook `useNarrativeStory.ts` JÁ tem suporte a música**
   - A lógica de `generateBackgroundMusic` existe e funciona
   - É usado pelo `AgentReelsRenderer` corretamente
   - O problema pode ser o rate-limiting da API ou o bug de encoding

### Configuração OK
- A secret `ELEVENLABS_API_KEY` está configurada
- O `config.toml` tem todas as funções registradas

---

## Solução Proposta

### Parte 1: Corrigir Edge Functions de Música e SFX

Atualizar `elevenlabs-music` e `elevenlabs-sfx` para usar o encoder base64 seguro do Deno:

```typescript
// Adicionar import no topo
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// Substituir btoa() por:
const base64Audio = base64Encode(audioBuffer);
```

Isso previne crash com buffers grandes de áudio.

---

### Parte 2: Adicionar Trilha Sonora ao `useNarrativeVideo.ts`

Atualizar o hook para gerar música de fundo em paralelo com a narração:

```text
Fluxo atual:
1. Gera roteiro
2. Gera imagem
3. Gera narração (TTS)
4. Completo

Novo fluxo:
1. Gera roteiro
2. Gera imagem  
3. Gera narração E música em paralelo
4. Retorna ambos para o player
```

Adicionar ao state:
- `backgroundMusicUrl: string`

Criar nova função `generateBackgroundMusic()` similar à do `useNarrativeStory.ts`.

---

### Parte 3: Melhorar Logs de Diagnóstico

Adicionar logs mais detalhados nas edge functions para debugar chamadas ElevenLabs:
- Log da resposta completa do ElevenLabs
- Log do status da API Key
- Log do tamanho do áudio gerado

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/elevenlabs-music/index.ts` | Corrigir encoding base64 |
| `supabase/functions/elevenlabs-sfx/index.ts` | Corrigir encoding base64 |
| `src/hooks/useNarrativeVideo.ts` | Adicionar geração de música de fundo |

---

## Resultado Esperado

Após as correções:
1. ElevenLabs TTS funcionará como provedor principal
2. Vídeos terão trilha sonora de fundo (15% volume)
3. Se música não disponível (plano gratuito), vídeo continua só com narração
4. Fallback chain de TTS continuará funcionando: ElevenLabs → Edge TTS → Lovable TTS → Google TTS

