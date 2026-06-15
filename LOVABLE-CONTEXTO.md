# LOVABLE-CONTEXTO

Contexto rapido para continuar o projeto Lovable do Agente Instagram em local ou no Lovable.

## Resumo do projeto

Este repo e um app Lovable/Vite chamado **Agente IA Instagram**. A tela principal e uma experiencia de agente para criar, renderizar, agendar, publicar e medir conteudo de Instagram, com foco em noticias de IA/tecnologia e distribuicao do blog Neural Update.

Stack principal:

- Vite 5 + React 18 + TypeScript.
- shadcn-ui/Radix + Tailwind CSS.
- Supabase Auth, Postgres, Realtime, Storage e Edge Functions.
- React Query, Sonner, Framer Motion, Three.js/react-three-fiber.
- PWA via `vite-plugin-pwa`.
- Renderizacao de video no navegador com FFmpeg/Web APIs e pipeline auxiliar em `remotion/`.

## Como rodar local

Pre-requisitos:

- Node.js e npm instalados.
- Arquivo `.env` presente na raiz com as chaves `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Acesso ao projeto Supabase remoto configurado em `supabase/config.toml`.

Comandos:

```powershell
cd "D:\Neural Update\gram-text-wizard"
npm install
npm run dev
```

O Vite esta configurado para subir em:

```text
http://localhost:8080
```

Para validar build de producao:

```powershell
npm run build
npm run preview
```

Status verificado em 2026-06-15 (Alterações do Antigravity):

- **Correção de Reels (WebM para MP4 real)**: Os Reels gerados no browser que saíam em WebM agora são convertidos no frontend para MP4 real (H.264/AAC) usando o FFmpeg.wasm antes de serem salvos no Supabase Storage. Isso resolveu o erro silencioso onde o Instagram rejeitava o processamento dos arquivos.
- **Configuração do Vite**: Habilitados headers COOP/COEP no `vite.config.ts` para isolamento de origem necessário para o WebAssembly multithread.
- **Exclusividade do Kokoro local & Pausas de Respiração**: Modificado o cliente do frontend para chamar exclusivamente o Kokoro TTS local (engine "kokoro") e adicionada uma injeção de marcadores de pausas reflexivas (`...`) nas pontuações do script Python local do Kokoro, fazendo com que a narração respeite perfeitamente as vírgulas e pontos-finais.
- **Busca de Imagens Focada por Cena com Deduplicação**: Corrigido o seletor de imagens que fazia busca geral mesclando todos os prompts e distribuía imagens aleatoriamente. Agora o app pesquisa imagens individualmente para cada cena do Reels, garantindo máxima relevância visual, e implementa deduplicação automática (`usedUrls`) para evitar repetições.
- **Ken Burns Cinemático**: Atualizada a animação de Ken Burns para utilizar a curva `easeOutQuint` (aceleração rápida no início e desaceleração progressiva) dando o aspecto visual premium das transições de Reels de alta retenção.
- **Validação**: Build de produção executado e concluído com sucesso (`npm run build`).

Status verificado em 2026-06-09:

- `npm install` concluiu com sucesso.
- `npm run build` concluiu com sucesso.
- O build emite aviso de chunk grande, principalmente no bundle principal, mas nao bloqueia.
- `npm audit` aponta vulnerabilidades moderadas/altas; nao rodei `npm audit fix` para nao mexer em versoes sem uma tarefa especifica.

## Variaveis de ambiente

O frontend usa:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

O `.env` tambem contem aliases sem `VITE_`:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Nao coloque service role key no frontend. As Edge Functions usam secrets do ambiente Supabase, nao do Vite local.

## Rotas principais

Arquivo: `src/App.tsx`

- `/auth`: login, cadastro com codigo de acesso e recuperacao de senha.
- `/`: rota protegida; exige usuario Supabase autenticado.
- `/instagram/callback`: callback OAuth do Instagram.
- `/privacy-policy`, `/terms-of-service`, `/data-deletion`: paginas publicas legais.
- `/admin` e `/settings`: redirecionam para `/`.

O app inteiro e envolvido por:

- `QueryClientProvider`
- `TooltipProvider`
- `WorkspaceProvider`
- `VideoRenderingProvider`
- toasts, PWA prompt e notificacoes realtime.

## Fluxo visual principal

Entrada real: `src/pages/Index.tsx` -> `src/components/tabs/AgentTab.tsx` -> `src/components/agent/AgentGenieView.tsx`.

`AgentGenieView` e o hub do produto:

- Renderiza o fundo 3D (`AgentGenie3D`).
- Mostra o chat minimalista e painel proativo do agente.
- Abre paineis de Fila, Crescimento, Teste, Distribuir e Historico.
- Envia mensagens para a Edge Function `agent-chat`.
- Se uma acao do agente pedir renderizacao de video, chama `renderVideo(postId)` e abre a Fila.

Abas/painels importantes:

- `PublicationQueueTab`: rascunhos, agendados, atrasados, publicar agora, reagendar, deletar, renderizar reels e processar agendados.
- `PostHistoryTab`: historico de publicacoes.
- `AgentGrowthDashboard`: metricas e estrategia.
- `ContentTestTab`: gera exemplos de conteudo.
- `ArticleDistributionPanel`: pega artigos do Neural Update e gera carrossel, reels e snippets.
- `AgentSettingsPanel`: configuracoes do agente, OAuth Instagram e teste de voz.

## Dados e Supabase

Cliente Supabase: `src/integrations/supabase/client.ts`.

O app usa Auth com sessao persistida em `localStorage`.

Tabelas mais importantes vistas no codigo:

- `workspaces`, `workspace_members`, `user_roles`
- `agent_context`, `agent_decisions`, `agent_chat_messages`
- `posts`
- `instagram_accounts`
- `rss_items`
- `article_distributions`
- `affiliate_links`
- tabelas auxiliares de notificacoes, metricas e feedback conforme migrations

O app e multi-workspace. Quase toda consulta relevante filtra por `workspace_id`.

## Edge Functions usadas pelo frontend

Chamadas diretas via `supabase.functions.invoke`:

- `agent-chat`: conversa do agente e execucao de ferramentas.
- `ai-agent-core`: agente autonomo/manual.
- `ai-agent-feedback`: loop de aprendizado.
- `publish-post`: publica imagem, carrossel ou video/Reels no Instagram Graph API.
- `scheduled-publisher`: processa posts atrasados/agendados.
- `sync-instagram-metrics`: sincroniza metricas reais do Instagram.
- `start-oauth` e `oauth-callback`: conexao da conta Instagram.
- `validate-signup-code`: libera cadastro.
- `generate-test-content`: exemplos de conteudo.
- `generate-batch-clips` e `process-curated-video`: cortes a partir de fonte externa.
- `generate-story-script`, `search-images-for-video`, `lovable-tts`, `edge-tts`, `huggingface-musicgen`: pipeline de video/narracao.
- `article-to-instagram`: distribuicao de artigos Neural Update em carrossel, reels e snippets.

Outras Edge Functions existem em `supabase/functions/` para RSS, imagens, overlays, TTS, conversao MP4, watermark, fetch de imagens reais e automacoes.

## Publicacao Instagram

Arquivo: `supabase/functions/publish-post/index.ts`.

Comportamento:

- Busca o post em `posts`.
- Busca uma conta em `instagram_accounts`.
- Se nao houver conta conectada, simula publicacao marcando o post como `published`.
- Para carrossel, cria os itens filhos e depois o container `CAROUSEL`.
- Para Reels/video, exige `video_url`; converte WebM para MP4 quando necessario.
- Para imagem, usa `image_url`.
- Redimensiona imagens chamando `resize-image-for-instagram`.
- Depois faz polling de processamento e publica no Graph API.

Importante: para publicar de verdade, precisa haver conta Instagram conectada no workspace.

## Pipeline de video/Reels

Frontend: `src/contexts/VideoRenderingContext.tsx` e `src/hooks/useNarrativeStory.ts`.

Fluxo:

1. Um post de Reels fica em `draft` ou `render_failed` sem `video_url`.
2. A Fila mostra "Gerar Video".
3. `renderVideo(postId)` busca o post e o `overlay_metadata`.
4. Se nao houver roteiro, chama `generate-story-script`.
5. Renderiza segmentos, imagens, narracao e musica no navegador.
6. Ao concluir a gravação em WebM na memória, **converte o WebM para MP4 real com codecs H.264 e AAC via FFmpeg.wasm** no frontend.
7. Grava o MP4 final no Supabase Storage (`video_url`), limpa `overlay_metadata`, agenda em horario bom e marca `status='scheduled'`.

### Banco local de imagens e voz local

O render local de Reels usa primeiro recursos locais para reduzir gasto:

- Manifesto do banco de imagem: `public/image-bank-manifest.json`.
- Gerador do manifesto: `scripts/build-local-image-bank-manifest.mjs`.
- Raizes padrao indexadas:
  - `C:\Users\Mateus Horvat\neural-image-agent\bank`
  - `C:\Users\Mateus Horvat\neural-update-tiktok\exports\video-images`
- Se o banco local nao cobrir todas as cenas, o fluxo antigo `search-images-for-video` entra como fallback.
- Voz local: `D:\Neural Update\neural-voice`, API em `http://localhost:3032`.
- O frontend chama `POST /synthesize` via `src/lib/neural-voice.ts` configurado estritamente com `engine: "kokoro"` para usar o modelo neural local (pt-BR vozes `pf_dora`, `pm_alex` ou `pm_santa`) antes de qualquer TTS remoto.
- Override opcional: `VITE_NEURAL_VOICE_URL`.

Comandos locais:

```powershell
cd "D:\Neural Update\gram-text-wizard"
npm run image-bank:manifest

cd "D:\Neural Update\neural-voice"
npm start

cd "D:\Neural Update\gram-text-wizard"
npm run dev
```

Observacao importante: Supabase Edge Functions nao enxergam o disco local do PC. Para posts de imagem gerados no `ai-agent-core` usarem banco sem chamar `generate-image`, configure uma URL acessivel pela Edge Function no secret `LOCAL_IMAGE_BANK_MANIFEST_URL`. Sem isso, o core tenta banco hospedado, depois cai para `generate-image` e depois imagem RSS.

Para gerar manifesto com URLs publicas de assets hospedados, rode:

```powershell
$env:IMAGE_BANK_PUBLIC_BASE="https://SEU-DOMINIO/image-bank"
npm run image-bank:manifest
```

Esse modo adiciona `publicUrl` em cada item do manifesto.

Automacao para subir o banco para Supabase Storage:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:IMAGE_BANK_BUCKET="image-bank"
npm run image-bank:upload
```

Depois de hospedar o manifesto em uma URL publica, configure os secrets das Edge Functions:

```text
LOCAL_IMAGE_BANK_MANIFEST_URL=https://.../image-bank-manifest.json
IMAGE_BANK_REQUIRED=true
```

`IMAGE_BANK_REQUIRED=true` faz o Instagram usar somente banco de imagem; se faltar manifesto/imagem publica, a funcao falha em vez de cair para Pexels/RSS/IA.

Regras locais:

- Maximo de 3 tentativas de render por post.
- Horarios preferidos em Brasilia: 9h, 12h, 15h, 18h, 20h.
- Gap minimo de 2h.
- Maximo de 4 posts por dia.

Memoria Lovable relevante:

- Reels automaticos ativos 2x/dia: 10h e 18h BRT.
- Prioridade de fonte: Neural Update primeiro.
- `auto-reel-publisher` cria post `generating` e aciona `brand-news-video`.
- Nao pausar Reels sem pedido explicito.

## Neural Update como fonte prioritaria

O blog Neural Update / Atualizacao Neural e fonte prioritaria.

Regras registradas nas memorias Lovable:

- `fetch-rss` inclui o feed do blog no topo.
- `ai-agent-core` prioriza `rss_items.source_name === 'Atualizacao Neural'`.
- Conteudo vindo do blog usa imagem original do RSS como base quando possivel.
- Legendas recebem CTA/fonte oficial do blog.
- `ArticleDistributionPanel` lista artigos do Neural Update e chama `article-to-instagram` para `carousel`, `reels` e `snippet`.

Observacao: em varios arquivos o texto aparece com mojibake no terminal (`AtualizaÃ§Ã£o`, `HistÃ³rico`, etc.). Antes de fazer refator grande de copy, confirme se e problema de exibicao do PowerShell ou conteudo salvo.

## Remotion

Ha um subprojeto em `remotion/`.

Comandos informados no proprio subprojeto:

```powershell
cd "D:\Neural Update\gram-text-wizard\remotion"
bun install
bun run index.ts
```

Ele tem dependencias Remotion 4 e React 19, separadas do app Vite principal. O `CLAUDE.md` do subprojeto pede Bun por padrao.

## Cuidados para proximas mudancas

- Nao editar `src/integrations/supabase/client.ts` manualmente; o arquivo diz que e gerado.
- Preservar isolamento por `workspace_id`.
- Ao mexer em decisoes do agente, manter `agent-chat` e `ai-agent-core` alinhados.
- Ao mexer em agenda semanal, lembrar que a semana comeca segunda-feira em Brasilia.
- Ao mexer em publicacao real, verificar qual conta Instagram esta conectada antes de concluir.
- Ao mexer em Reels, nao quebrar o fluxo de renderizacao no navegador nem a fila de agendamento.
- O app depende de Edge Functions remotas; rodar Vite local nao roda as functions localmente.

## Comandos uteis

```powershell
# instalar deps
npm install

# desenvolvimento
npm run dev

# build
npm run build

# preview do build
npm run preview

# lint
npm run lint
```

Se quiser rodar Edge Functions localmente, o caminho e instalar/configurar Supabase CLI, carregar secrets e servir functions individualmente. Para uso normal do app local, basta Vite apontando para o Supabase remoto via `.env`.
