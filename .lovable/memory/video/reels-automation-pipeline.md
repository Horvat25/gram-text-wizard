---
name: Reels Automation Pipeline
description: Reels ativos 2x/dia (10h e 18h BRT), com imagens reais e render multi-cena no navegador
type: feature
---

## Reels automáticos no @neuralupdate

- **Cron ativo novamente**: 13:00 e 21:00 UTC (10h e 18h Brasília) → `auto-reel-publisher`
- **Limite**: máx 2 Reels (scheduled+published+generating) nas últimas 24h
- **Prioridade de fonte**: Atualização Neural primeiro, senão melhor ranqueada
- **Marca `rss_items.used_for_reel = true`** pra não repetir notícia
- **Pipeline**: `auto-reel-publisher` → cria post `generating` → dispara `brand-news-video` em background → deixa assets prontos → render multi-cena no navegador agenda o post
- **Não pausar Reels novamente** sem pedido explícito do usuário. Pedidos manuais ao Agente Horvat devem criar Reels e disparar render quando possível.

## Voz
- Edge Neural gratuito como padrão configurável: Thalita / Francisca / Antônio via `lovable-tts`
- Fallback: ElevenLabs Sarah / TTS gratuito conforme disponibilidade

## Imagens (sem IA)
- Nova função `fetch-real-news-images`: og:image + Pexels (queries via Gemini Flash Lite) + scrape do artigo
- `brand-news-video` substituiu `search-images-for-video` por essa nova
- Branding Neural Update (header preto + logo dourado + manchete SVG) aplicado por cima das fotos reais
