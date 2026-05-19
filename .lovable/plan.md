# Plano: Narração ElevenLabs + Trilha Sonora Grátis nos Reels

## Objetivo
Subir a qualidade do Reels do Neural Update usando **ElevenLabs Sarah** (voz PT-BR realista) na narração e uma **trilha sonora royalty-free curada** (Pixabay/Mixkit, hospedada no Storage) misturada por baixo. Rodar **1 reel de teste** completo pra você aprovar antes de reabrir a produção automática.

---

## 1. Narração com ElevenLabs (Sarah) em `brand-news-video`

Hoje a narração de cada segmento vai pro `edge-tts` (voz Antonio robótica). Vou trocar pra ElevenLabs como **padrão** quando `ELEVENLABS_API_KEY` existir (já está nos secrets), com fallback automático pro `edge-tts` se a API falhar ou estourar quota.

- Voice ID: `EXAVITQu4vr4xnSDxMaL` (Sarah)
- Modelo: `eleven_turbo_v2_5` — **gasta metade dos créditos** do `multilingual_v2` e ainda soa natural em PT-BR
- Settings: `stability 0.45`, `similarity_boost 0.8`, `style 0.35`, `use_speaker_boost true` — perfil editorial pra notícia
- Output: `mp3_44100_128` via query param (formato pedido na URL, não no body)
- Upload do MP3 pro bucket `post-videos` em `{workspace_id}/narration-{postId}-{segIdx}.mp3` e gravar `audioUrl` + `audioDuration` no segmento
- Concatenação dos 4 segmentos numa única chamada usando **request stitching** (`previous_text` / `next_text`) pra prosódia ficar contínua entre cortes — diferença audível em narração editorial

**Economia ElevenLabs**: o Starter ($5/mês = 30k chars) cobre ~25 reels/mês com Turbo v2.5. Adiciono log de caracteres consumidos por reel no `overlay_metadata.elevenlabs_chars_used` pra você acompanhar.

---

## 2. Trilha sonora gratuita (royalty-free curada)

Em vez de gerar música com IA (caro e instável), vou usar **tracks curadas do Pixabay Music** (licença CC0, uso comercial liberado, sem atribuição obrigatória). Plano:

1. Criar pasta `public/music/` com 3 faixas baixadas:
   - `tech-ambient.mp3` — sintetizador minimal, pra notícias de IA/tech
   - `cinematic-news.mp3` — pulso editorial, pra grandes lançamentos
   - `upbeat-future.mp3` — energia, pra hooks fortes
2. Selecionar a faixa por **mood** que a IA já define no script (`urgent` / `editorial` / `hype`) — adiciono campo `mood` no `generateBroadcastScript`
3. Passar `backgroundMusicUrl` no `overlay_metadata.script` — o `video-encoder.ts` cliente **já mixa** trilha (linha 435, 576), só estava sem URL. Volume da trilha: **-18 dB** (15% do gain) pra não competir com a Sarah
4. Fade-in 0.5s no início e fade-out 1s no final automáticos

---

## 3. Teste end-to-end (1 reel surpresa)

Pra você ver o resultado antes de liberar o cron:

1. Reverter `content_distribution_videos: 0 → 1` e `news_video: 0 → 1` no `agent_context` (só pra esse teste)
2. Pegar a notícia top não-usada da Atualização Neural e disparar `brand-news-video` manualmente
3. Render client-side pelo `PublicationQueueTab` (você clica "Renderizar")
4. Resultado fica em **draft** (não publica sozinho) — você revisa, aprova e publica quando quiser
5. Se gostar: zero mudança extra. Se quiser ajustar voz/trilha, eu mexo nos settings antes de reativar o cron diário

---

## 4. Arquivos que vou tocar

- `supabase/functions/brand-news-video/index.ts` — nova função `generateNarrationElevenLabs()` com fallback edge-tts, request stitching, seleção de trilha por mood, salvar `backgroundMusicUrl` no metadata
- `src/lib/background-music.ts` — adicionar mapa `mood → trackUrl` apontando pras 3 faixas em `/public/music/`
- `public/music/*.mp3` — 3 trilhas Pixabay baixadas (≈1-2 MB cada)
- Migração SQL pequena pra atualizar `agent_context` do workspace e reativar 1 vídeo na quota

Nenhuma mudança no fluxo de imagens/carrossel/legenda — só áudio do reel.

---

## 5. Dica sobre planos ElevenLabs (pra você decidir)

| Plano | Preço | Créditos | Reels Neural Update/mês* | Observação |
|---|---|---|---|---|
| Free | $0 | 10k chars | ~8 reels | Bloqueia VPN/datacenter (Supabase Edge pode falhar) |
| **Starter** | **$5** | **30k chars** | **~25 reels** | Recomendado — libera datacenter, voz comercial OK |
| Creator | $22 | 100k chars | ~85 reels | Só se for postar 3x/dia |

\* baseado em ~80 palavras (~1.2k chars) por reel com Turbo v2.5

**Trilha sonora**: NÃO precisa pagar ElevenLabs Music ($22+). Pixabay/Mixkit cobrem 95% dos casos com qualidade editorial e zero custo. Só pensa em ElevenLabs Music se quiser trilha 100% única por vídeo, o que pra Reels de 25s não compensa.

---

Posso seguir? Se você confirmar, na build eu já entrego o reel de teste pronto pra você renderizar e julgar.