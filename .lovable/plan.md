

# Relatório: Neural Update vs Olhar Digital / Tecnoblog / Canaltech

## Diagnóstico — o que falta no Neural Update

Comparando o site atual com os 3 maiores portais brasileiros de tech, identifiquei **8 lacunas críticas de profissionalismo**:

### 1. Header sem densidade informacional
- **Eles:** Header com barra de "AGORA" / breaking news em tempo real, ícones sociais visíveis, hora atualizada, navegação com 7-8 categorias visíveis.
- **Nós:** Header limpo demais, só 5 categorias, sem indicador de "última atualização", sem breaking ticker.

### 2. Falta o "feed AGORA" cronológico (timestamp)
- **Olhar Digital** tem uma seção "AGORA" com timestamps (`14:34`, `14:33`, `14:16`) listando as últimas 10 notícias do dia em formato compacto. É o componente mais consultado por leitores recorrentes.
- **Nós** só temos cards visuais grandes — falta o feed denso "última hora".

### 3. Hero ocupa espaço demais e não mostra 2-3 manchetes
- **Olhar Digital** mostra **4 manchetes simultâneas** acima da dobra (1 grande + 3 médias na coluna direita).
- **Nós** mostramos só **1 hero gigante** que ocupa 100% da dobra — perde-se densidade editorial.

### 4. Cards sem "selo PRO/MANCHETE/EXCLUSIVO"
- Portais profissionais usam selos coloridos (verde "PRO", vermelho "EXCLUSIVO", "AO VIVO") sobre a thumb. Cria hierarquia visual.
- Nós só temos a categoria — falta o "tag editorial" do tipo de conteúdo.

### 5. Falta sidebar de "Mais lidas / Em alta"
- Todos os 3 portais têm uma coluna lateral (desktop) ou seção dedicada com "Top 5 mais lidas hoje" usando o `view_count` (que já temos no banco!).
- Nós **temos o dado**, mas não exibimos.

### 6. Tipografia do artigo: largura e ritmo
- **Tecnoblog/Canaltech** usam coluna de leitura ~720px com lead paragraph (1ª frase em destaque maior), drop cap e separadores `· · ·` entre seções.
- **Nós** já melhoramos mas falta lead paragraph e separadores visuais entre blocos.

### 7. Footer pobre
- **Olhar Digital** tem footer com colunas: Categorias / Sobre / Newsletter / Redes Sociais / Apps / Política.
- **Nós** temos footer mínimo — falta newsletter e organização em colunas.

### 8. Falta "data atualizada" e autor com foto
- Sites profissionais mostram avatar do autor, bio curta no fim do artigo e "Atualizado em DD/MM HH:MM".
- Nós só dizemos "Por Agente Horvat" sem destaque visual.

---

## Plano de implementação (1 ciclo, ~7 arquivos)

### A. Header reforçado (`PortalHeader.tsx`)
- Adicionar **mini-ticker "AO VIVO"** acima do header com as 3 últimas manchetes em scroll horizontal (só desktop)
- Mostrar **hora atual de Brasília** ao lado do logo
- Adicionar 7ª categoria visível (compactando padding)

### B. Hero + Side Manchetes (`Home.tsx`)
- Trocar layout: hero ocupa **2/3 da largura** (desktop) + coluna direita com **3 manchetes secundárias** empilhadas
- Mobile mantém o hero full-width atual

### C. Novo componente `LiveNewsFeed.tsx`
- Lista compacta tipo "AGORA" com `HH:MM | CATEGORIA | Título`
- Renderizado em 2 colunas no desktop, 1 no mobile
- Atualiza a cada 60s (sem reload, busca novas via Supabase)

### D. Sidebar "Mais lidas" (`MostReadSidebar.tsx`)
- Top 5 artigos por `view_count` da última semana
- Numerados 01-05 em estilo grande tipo Olhar Digital
- Aparece na home (sticky no desktop) e na página de artigo

### E. Selos editoriais (`ArticleCard.tsx` + `HeroArticle.tsx`)
- Suportar badge customizado: `MANCHETE` (gradiente primary), `EXCLUSIVO` (âmbar), `EM ALTA` (vermelho), `AO VIVO` (animado)
- Lógica automática: artigos `is_featured` = MANCHETE; `view_count > 100` = EM ALTA; publicado < 1h = AO VIVO

### F. Página de artigo profissional (`ArticlePage.tsx` + `index.css`)
- **Lead paragraph**: primeiro `<p>` com font-size 1.25rem, peso 500, cor mais clara
- **Drop cap** opcional na primeira letra
- **Separadores `· · ·`** automáticos entre H2 (alternativa visual aos blocos)
- **Bloco do autor** no final: avatar + bio curta do Agente Horvat + link "Ver mais matérias"
- **"Atualizado em"** ao lado da data quando `updated_at != published_at`
- **Compartilhamento social** (WhatsApp, X, Copiar link) sticky lateral no desktop

### G. Footer profissional (`PortalFooter.tsx`)
- 4 colunas: Editorias / Sobre o portal / Siga o agente / Legal
- Inscrição em **newsletter** (form simples → tabela `newsletter_subscribers`)
- Logo + tagline + "© 2026 Neural Update"

### H. Banco — nova tabela
```sql
create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  workspace_id uuid,
  subscribed_at timestamptz default now(),
  active boolean default true
);
```
RLS: insert público (qualquer um se inscreve), select só admin.

---

## Resultado esperado

Antes: site bonito mas com "ar de blog pessoal" — hero gigante, pouca densidade.
Depois: cara de **portal de notícias profissional** comparável a Olhar Digital, com ticker ao vivo, feed denso "AGORA", mais lidas, selos editoriais, leitura premium e newsletter.

**Custo estimado:** 1 ciclo de implementação. Nenhum custo de IA recorrente (tudo é UI/UX + 1 tabela simples).

