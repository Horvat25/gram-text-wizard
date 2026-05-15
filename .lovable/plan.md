## Objetivo

Voltar a publicar Reels no @neuralupdate de forma automática (10h e 18h Brasília), zerando o custo de voz (Polly Camila grátis no lugar do ElevenLabs) e trocando imagens IA por imagens reais das notícias.

---

## 1. Voz: trocar ElevenLabs por Polly Camila (grátis)

**Problema hoje:** o `edge-tts` foi reescrito pra chamar SÓ ElevenLabs, exigindo créditos pagos. Quando acaba o crédito, o vídeo trava.

**Solução:**
- Reescrever `edge-tts` pra usar StreamElements/Polly Camila como voz primária (já temos rodando em `lovable-tts`).
- Cadeia de fallback: Polly Camila → Polly Vitória → Google Translate (último recurso).
- ElevenLabs vira opcional: só usa se `ELEVENLABS_API_KEY` existir E o caller passar `preferPaid: true` (pra testes pontuais que você quiser fazer).
- Atualizar `brand-news-video` e `process-curated-video` pra continuarem chamando `edge-tts` (sem mudar interface — só o motor por baixo muda).
- Deletar o nome enganoso "Sarah" das logs/UI e padronizar como "Camila (Polly Neural)".

**Resultado:** custo de voz = R$ 0, qualidade neural natural em PT-BR.

---

## 2. Imagens: reais ao invés de IA

**Problema hoje:** `brand-news-video` chama `search-images-for-video`, que mistura Pexels/Unsplash com geração IA — e quando vai pra IA, sai cara robótica/mãos tortas.

**Solução nova hierarquia (sem IA pra Reels de notícia):**
1. **Capa principal (cena 1 + 4):** imagem do próprio artigo (`rss_items.image_url` / og:image). Para Neural Update já temos.
2. **Cenas do meio (2 e 3):** B-roll do **Pexels** (foto + vídeo curto), buscado por palavras-chave reais da notícia (ex: "data center", "chip semiconductor", "Nvidia office"). Extraídas via Gemini Flash a partir do título.
3. **Fallback** se Pexels não tiver match relevante: outra foto do mesmo artigo (scrape via Firecrawl pegando todas as `<img>`) ou foto da empresa mencionada.
4. **Sem IA**: remover qualquer chamada a `generate-image` dentro do pipeline de Reels. IA continua liberada só pra carrosséis educativos onde faz sentido.

**Branding:** mantém o overlay Neural Update (header preto + logo dourado + manchete via SVG/resvg) por cima das imagens reais — isso já funciona bem.

---

## 3. Reel automático (2x/dia)

**Pipeline novo `auto-reel-publisher` (edge function):**

```text
CRON 13:00 UTC (10h BRT) e 21:00 UTC (18h BRT)
   │
   ▼
1. Pega notícia top não usada do pool prioritário
   (Neural Update primeiro; senão, melhor ranqueada)
   │
   ▼
2. Cria post em status='generating' já agendado
   pra 30min depois (10:30 / 18:30)
   │
   ▼
3. Dispara brand-news-video em background
   (EdgeRuntime.waitUntil)
   │
   ├── ✅ Sucesso → status='scheduled', video_url salvo
   │       scheduled-publisher pega no horário
   │
   └── ❌ Falha → status='draft', error_message,
           notifica via realtime "Reel falhou,
           revisar na Fila"
```

**Detalhes:**
- Cron via `pg_cron` + `pg_net` (mesmo padrão do `auto-fetch-rss`).
- Marca `rss_items.used_for_reel = true` (coluna nova) pra não repetir notícia.
- Limite de segurança: máx 2 Reels/dia, ignora se já tem 2 publicados/agendados nas últimas 24h.
- Mantém o `scheduled-publisher` atual fazendo o upload pro IG (já funciona pra Reels, só depende de `video_url` estar pronto).

---

## 4. Notificação de falha

Como você falou que não tava recebendo notificação:
- Toda falha de render vira linha em `agent_chat_messages` (tipo: `system_alert`) — aparece no chat do Agente automaticamente.
- Push notification opcional (já temos `usePushNotifications`) — se você ativar nas configs, dispara também.
- Botão "🎬 Re-renderizar" na Fila pra reprocessar manualmente sem ter que apagar/criar de novo.

---

## 5. Detalhes técnicos

**Arquivos editados:**
- `supabase/functions/edge-tts/index.ts` — reescrita: Polly primary, ElevenLabs opcional
- `supabase/functions/brand-news-video/index.ts` — substitui `search-images-for-video` por nova função `fetch-real-news-images` (Pexels + scrape do artigo)
- `supabase/functions/scheduled-publisher/index.ts` — só validação, já suporta Reels

**Arquivos novos:**
- `supabase/functions/auto-reel-publisher/index.ts` — cron handler
- `supabase/functions/fetch-real-news-images/index.ts` — Pexels + Firecrawl scraping de imagens do artigo

**Migração SQL:**
- `rss_items.used_for_reel BOOLEAN DEFAULT false`
- 2 jobs no `pg_cron` (10h e 18h BRT)
- Tabela `agent_chat_messages` ganha tipo `system_alert` se ainda não tiver

**Não muda:**
- Pipeline de imagem/carrossel do Instagram (`ai-agent-core` continua igual)
- Branding visual (header, logo dourado, watermark)
- TikTok (fora de escopo)

---

## Fora de escopo (confirmar se quer incluir)

- **Música de fundo nos Reels:** hoje não tem. Posso adicionar trilha grátis (Pixabay Music) num próximo passo.
- **Legendas queimadas (ASS subtitles):** já existe no pipeline viral, mas não no `brand-news-video`. Posso portar.
- **TikTok automático com mesmo Reel:** o vídeo final é compatível, mas precisa do TikTok sair do Sandbox primeiro.
