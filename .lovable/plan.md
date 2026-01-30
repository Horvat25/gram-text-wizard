
# Plano: Unificar Criação de Vídeo e Reorganizar Interface do Agente

## Resumo

Vamos fazer duas melhorias principais:
1. **Sincronizar a criação de vídeo do agente** com o mesmo fluxo que já funciona no TikTokContentCreation (usando ElevenLabs, Gemini, e FFmpeg)
2. **Reorganizar a interface do Agente** com tabs separadas para TikTok e Instagram, com visual temático para cada plataforma

---

## 1. Problema Atual com Vídeos

O agente autônomo cria vídeos com `status: 'draft'` porque:
- Os vídeos precisam de renderização no navegador (FFmpeg.wasm)
- O agente roda no backend e não pode executar FFmpeg

**Solução**: Manter o sistema atual mas melhorar a experiência:
- Quando o agente criar um vídeo, ele já inclui todos os dados prontos (script, imagens, metadata)
- Na interface, quando o usuário acessar a aba de chat, vídeos pendentes aparecem com botão "Renderizar" 
- Auto-renderização quando o usuário estiver ativo

---

## 2. Nova Interface do Agente com Plataformas

### Estrutura Proposta

```text
+-----------------------------------+
|  [TikTok]  [Instagram]            |  <- Seletor de Plataforma
+-----------------------------------+
|  [Chat]  [Respostas]              |  <- Tabs internos
+-----------------------------------+
|                                   |
|   Chat com o Agente               |
|   (Tema visual da plataforma)     |
|                                   |
+-----------------------------------+
```

### Visual por Plataforma

**TikTok Theme:**
- Gradiente: Preto → Cyan (#25F4EE) → Rosa (#FE2C55)
- Borda: Cyan com glow
- Icone TikTok no avatar do agente

**Instagram Theme:**
- Gradiente: Rosa → Roxo → Laranja
- Borda: Primária com glow
- Icone Instagram no avatar

---

## Mudanças Técnicas

### Arquivo 1: `src/components/tabs/AgentTab.tsx`

**Antes:**
```typescript
<Tabs value={activeTab}>
  <TabsTrigger value="chat">Chat</TabsTrigger>
  <TabsTrigger value="respostas">Respostas</TabsTrigger>
</Tabs>
```

**Depois:**
```typescript
// Adicionar seletor de plataforma no topo
const [platform, setPlatform] = useState<'tiktok' | 'instagram'>('tiktok');

<div className="flex items-center gap-2 mb-2">
  <Button 
    variant={platform === 'tiktok' ? 'default' : 'outline'}
    onClick={() => setPlatform('tiktok')}
    className={platform === 'tiktok' ? 'tiktok-gradient' : ''}
  >
    <TikTokIcon /> TikTok
  </Button>
  <Button 
    variant={platform === 'instagram' ? 'default' : 'outline'}
    onClick={() => setPlatform('instagram')}
    className={platform === 'instagram' ? 'instagram-gradient' : ''}
  >
    <Instagram /> Instagram
  </Button>
</div>

// Passar plataforma para o chat
<AgentHeroChat platform={platform} />
```

### Arquivo 2: `src/components/agent/AgentHeroChat.tsx`

**Mudanças:**
1. Aceitar prop `platform: 'tiktok' | 'instagram'`
2. Mudar tema visual baseado na plataforma
3. Filtrar mensagens por plataforma (novo campo `platform` na tabela)
4. Adaptar ações rápidas por plataforma
5. Adicionar seção de vídeos pendentes para renderização

**Novo Header:**
```typescript
<div className={cn(
  "flex items-center gap-3 p-3 rounded-xl",
  platform === 'tiktok' 
    ? "bg-gradient-to-r from-black/50 via-[#25F4EE]/20 to-[#FE2C55]/20 border-[#25F4EE]/30"
    : "bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-orange-500/20 border-primary/30"
)}>
  <Avatar className={cn(
    "h-10 w-10",
    platform === 'tiktok' ? "ring-2 ring-[#25F4EE]" : "ring-2 ring-pink-500"
  )}>
    {platform === 'tiktok' ? <TikTokIcon /> : <Instagram />}
  </Avatar>
  <div>
    <h2>Agente {platform === 'tiktok' ? 'TikTok' : 'Instagram'}</h2>
    <Badge>{platform === 'tiktok' ? 'Drafts/Inbox' : 'Auto-post'}</Badge>
  </div>
</div>
```

**Ações Rápidas TikTok:**
```typescript
const TIKTOK_ACTIONS = [
  { label: 'Criar Reels', prompt: 'Crie um vídeo viral sobre IA para TikTok' },
  { label: 'Tendências', prompt: 'Quais são as tendências do TikTok hoje?' },
  { label: 'Rodar Agente', prompt: 'Execute o agente focado em TikTok' },
];

const INSTAGRAM_ACTIONS = [
  { label: 'Criar 5 posts', prompt: 'Crie 5 posts para Instagram' },
  { label: 'Carrossel', prompt: 'Crie um carrossel educativo' },
  { label: 'Analytics', prompt: 'Mostre analytics do Instagram' },
];
```

### Arquivo 3: `src/index.css`

**Adicionar estilos TikTok:**
```css
.tiktok-gradient {
  background: linear-gradient(135deg, #25F4EE, #FE2C55);
  border-color: #25F4EE;
}

.tiktok-glow {
  box-shadow: 0 0 20px rgba(37, 244, 238, 0.3),
              0 0 40px rgba(254, 44, 85, 0.2);
}

.instagram-gradient {
  background: linear-gradient(135deg, #F58529, #DD2A7B, #8134AF);
}
```

### Arquivo 4: Notificação de Vídeos Pendentes

**Novo componente no Chat:**
```typescript
// Buscar posts com needs_processing
const { data: pendingVideos } = useQuery({
  queryKey: ['pending-videos', platform],
  queryFn: async () => {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('status', 'draft')
      .not('overlay_metadata->needs_processing', 'is', null)
      .contains('platforms', [platform]);
    return data;
  }
});

// Mostrar badge no topo do chat
{pendingVideos?.length > 0 && (
  <div className="bg-yellow-500/10 border-yellow-500/30 p-3 rounded-lg">
    <p>🎬 {pendingVideos.length} vídeo(s) aguardando renderização</p>
    <Button onClick={() => renderNextVideo()}>
      Renderizar Agora
    </Button>
  </div>
)}
```

---

## Arquivos que Serão Modificados

1. **`src/components/tabs/AgentTab.tsx`** - Adicionar seletor de plataforma
2. **`src/components/agent/AgentHeroChat.tsx`** - Tema dinâmico, ações por plataforma, vídeos pendentes
3. **`src/index.css`** - Estilos TikTok e Instagram
4. **`src/components/agent/AgentReportsTab.tsx`** - Filtrar relatórios por plataforma

---

## Resultado Final

- Interface unificada com foco em TikTok (primeira aba)
- Visual temático bonito que muda conforme a plataforma
- Vídeos do agente aparecem como "pendentes" e podem ser renderizados com 1 clique
- Separação clara entre conversas TikTok e Instagram
- Experiência mais profissional e organizada
