---
name: Reels Automation Pipeline
description: Auto Reels 2x/dia (10h e 18h BRT) usando Polly Camila e imagens reais
type: feature
---

## Reels automáticos no @neuralupdate

- **Cron**: 13:00 e 21:00 UTC (10h e 18h Brasília) → `auto-reel-publisher`
- **Limite**: máx 2 Reels (scheduled+published+generating) nas últimas 24h
- **Prioridade de fonte**: Atualização Neural primeiro, senão melhor ranqueada
- **Marca `rss_items.used_for_reel = true`** pra não repetir notícia
- **Pipeline**: `auto-reel-publisher` → cria post `generating` → dispara `brand-news-video` em background → status vira `scheduled` (sucesso) ou `draft` (falha) com notificação no chat

## Voz
- `edge-tts` agora usa **Polly Camila (StreamElements, GRÁTIS)** como padrão
- Fallback: Polly Vitória → Google Translate
- ElevenLabs Sarah só se `preferPaid: true` E chave configurada

## Imagens (sem IA)
- Nova função `fetch-real-news-images`: og:image + Pexels (queries via Gemini Flash Lite) + scrape do artigo
- `brand-news-video` substituiu `search-images-for-video` por essa nova
- Branding Neural Update (header preto + logo dourado + manchete SVG) aplicado por cima das fotos reais
