import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { 
  Settings, 
  Save,
  Instagram,
  Music2,
  Clock,
  Gauge,
  Bot,
  Sparkles,
  MessageSquare,
  Target,
  Hash,
  Ban,
  Upload,
  Camera,
  Wand2,
  Brain,
  Palette,
  Users,
  Briefcase,
  Loader2,
  Check,
  X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface AgentConfig {
  agent_name: string;
  agent_avatar_url: string | null;
  brand_voice: string;
  system_prompt_template: string | null;
  personality_traits: string[];
  response_style: string;
  language_formality: string;
  emoji_usage: string;
  content_focus: string[];
  target_audience: string | null;
  industry_niche: string | null;
  avoid_topics: string[];
  hashtag_strategy: string;
  posting_style: string;
  daily_post_limit: number;
  min_hours_between_posts: number;
  preferred_platforms: string[];
  auto_post_enabled: boolean;
}

// CONFIGURAÇÕES OTIMIZADAS BASEADAS EM PESQUISA DE MERCADO 2025
// - Frequência ideal: 3-5 posts/semana (Buffer Research)
// - Hashtags: 5-10 relevantes, não para alcance mas categorização (Adam Mosseri)
// - Foco em Shares > Saves > Likes (algoritmo 2025)
// - Hook de 3 segundos para reels
// - Trial Reels para testes sem risco

const DEFAULT_CONFIG: AgentConfig = {
  agent_name: 'Aria', // Nome memorável e amigável
  agent_avatar_url: null,
  brand_voice: 'Autêntico, provocador e valioso. Fala como um amigo especialista que compartilha insights exclusivos. Usa linguagem conversacional mas nunca perde a autoridade. Cada post deve fazer o seguidor pensar "preciso compartilhar isso".',
  system_prompt_template: `## FÓRMULA VIRAL (seguir em TODOS os posts)

### ESTRUTURA HOOK-VALUE-CTA
1. **HOOK (3 segundos)**: A primeira frase DEVE parar o scroll
   - Use: Open Loops ("O que acontece quando..."), Contrarian ("Todo mundo acha X, mas...")
   - Dados específicos ("98% das pessoas não sabem...")
   - Provocação direta ("Você está fazendo isso errado")

2. **VALOR (Corpo)**: Entregue insight acionável
   - Transforme conceitos abstratos em passos concretos
   - Use listas numeradas para facilitar saves
   - Inclua "proof points" (dados, resultados, casos)

3. **CTA (Encerramento)**: Otimize para SHARES
   - "Marca alguém que precisa ver isso"
   - "Envia pro grupo do trabalho"
   - Perguntas que geram debate nos comentários

### REGRAS DE ALGORITMO 2025
- SHARES valem mais que SAVES (sinalizam conversa)
- Consistência de tópico > quantidade de posts
- Reels: primeiros 3s decidem tudo
- Carrosséis: capa deve funcionar sozinha
- Stories: não geram alcance, apenas nutrem

### ESTRATÉGIA DE HASHTAGS
- Use 5-8 hashtags RELEVANTES ao tópico
- Categorização > Descoberta
- Evite hashtags genéricas (#love, #instagood)
- Inclua 2-3 hashtags de nicho específico

### HORÁRIOS ÓTIMOS (pesquisa Buffer 2025)
- Ter-Qui: 11h-18h (pico de engajamento)
- Seg: 13h-14h, 16h-17h
- Sex: 10h-17h
- Dom: 16h (único horário viável)
- EVITE: Sábados (pior dia)`,
  personality_traits: ['provocador', 'estratégico', 'autêntico', 'data-driven', 'inspirador'],
  response_style: 'storytelling', // Narrativas engajam mais
  language_formality: 'informal', // Conexão > Autoridade distante
  emoji_usage: 'moderate', // Emojis estratégicos, não decorativos
  content_focus: ['compartilhamento', 'autoridade', 'comunidade', 'viral'],
  target_audience: 'Empreendedores digitais e criadores de conteúdo 25-40 anos que buscam crescer no Instagram de forma autêntica e estratégica',
  industry_niche: 'Marketing Digital & Criação de Conteúdo',
  avoid_topics: ['política', 'religião', 'polêmicas pessoais', 'ataques a concorrentes', 'promessas irrealistas'],
  hashtag_strategy: 'nicho-focado', // Categorização > Descoberta
  posting_style: 'strategic-bursts', // 3-5x/semana com qualidade
  daily_post_limit: 1, // Qualidade > Quantidade
  min_hours_between_posts: 8, // Espaçamento para não saturar
  preferred_platforms: ['instagram', 'tiktok'],
  auto_post_enabled: false
};

// Traços baseados em pesquisa de content marketing
const PERSONALITY_OPTIONS = [
  'provocador', 'autêntico', 'estratégico', 'data-driven', 'inspirador', 
  'educador', 'storyteller', 'minimalista', 'humorista', 'especialista',
  'acolhedor', 'ousado', 'analítico', 'criativo', 'prático'
];

// Focos alinhados ao algoritmo 2025 (Shares > Saves > Likes)
const CONTENT_FOCUS_OPTIONS = [
  'compartilhamento', 'autoridade', 'comunidade', 'viral', 'educação',
  'entretenimento', 'relacionamento', 'vendas', 'tendências', 'nicho'
];

interface AgentConfigPanelProps {
  trigger?: React.ReactNode;
  onConfigChange?: (config: AgentConfig) => void;
}

export default function AgentConfigPanel({ trigger, onConfigChange }: AgentConfigPanelProps) {
  const { user } = useAuth();
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [newTrait, setNewTrait] = useState('');
  const [newFocus, setNewFocus] = useState('');
  const [newAvoidTopic, setNewAvoidTopic] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && isOpen) {
      loadConfig();
    }
  }, [user, isOpen]);

  const loadConfig = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('agent_context')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setConfig({
          agent_name: data.agent_name || DEFAULT_CONFIG.agent_name,
          agent_avatar_url: data.agent_avatar_url,
          brand_voice: data.brand_voice || DEFAULT_CONFIG.brand_voice,
          system_prompt_template: data.system_prompt_template,
          personality_traits: data.personality_traits || DEFAULT_CONFIG.personality_traits,
          response_style: data.response_style || DEFAULT_CONFIG.response_style,
          language_formality: data.language_formality || DEFAULT_CONFIG.language_formality,
          emoji_usage: data.emoji_usage || DEFAULT_CONFIG.emoji_usage,
          content_focus: data.content_focus || DEFAULT_CONFIG.content_focus,
          target_audience: data.target_audience,
          industry_niche: data.industry_niche,
          avoid_topics: data.avoid_topics || [],
          hashtag_strategy: data.hashtag_strategy || DEFAULT_CONFIG.hashtag_strategy,
          posting_style: data.posting_style || DEFAULT_CONFIG.posting_style,
          daily_post_limit: data.daily_post_limit || DEFAULT_CONFIG.daily_post_limit,
          min_hours_between_posts: data.min_hours_between_posts || DEFAULT_CONFIG.min_hours_between_posts,
          preferred_platforms: data.preferred_platforms || DEFAULT_CONFIG.preferred_platforms,
          auto_post_enabled: data.auto_post_enabled || false
        });
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    try {
      const { data: existing } = await supabase
        .from('agent_context')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      const updateData = {
        user_id: user.id,
        agent_name: config.agent_name,
        agent_avatar_url: config.agent_avatar_url,
        brand_voice: config.brand_voice,
        system_prompt_template: config.system_prompt_template,
        personality_traits: config.personality_traits,
        response_style: config.response_style,
        language_formality: config.language_formality,
        emoji_usage: config.emoji_usage,
        content_focus: config.content_focus,
        target_audience: config.target_audience,
        industry_niche: config.industry_niche,
        avoid_topics: config.avoid_topics,
        hashtag_strategy: config.hashtag_strategy,
        posting_style: config.posting_style,
        daily_post_limit: config.daily_post_limit,
        min_hours_between_posts: config.min_hours_between_posts,
        preferred_platforms: config.preferred_platforms,
        auto_post_enabled: config.auto_post_enabled,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        const { error } = await supabase
          .from('agent_context')
          .update(updateData)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_context')
          .insert(updateData as any);
        if (error) throw error;
      }

      toast.success('Configurações salvas com sucesso!');
      onConfigChange?.(config);
    } catch (error) {
      console.error('Error saving config:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/agent-avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('post-images')
        .getPublicUrl(fileName);

      setConfig(c => ({ ...c, agent_avatar_url: publicUrl }));
      toast.success('Avatar atualizado!');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Erro ao fazer upload do avatar');
    }
  };

  const addTrait = (trait: string) => {
    if (trait && !config.personality_traits.includes(trait)) {
      setConfig(c => ({ ...c, personality_traits: [...c.personality_traits, trait] }));
    }
    setNewTrait('');
  };

  const removeTrait = (trait: string) => {
    setConfig(c => ({ ...c, personality_traits: c.personality_traits.filter(t => t !== trait) }));
  };

  const addFocus = (focus: string) => {
    if (focus && !config.content_focus.includes(focus)) {
      setConfig(c => ({ ...c, content_focus: [...c.content_focus, focus] }));
    }
    setNewFocus('');
  };

  const removeFocus = (focus: string) => {
    setConfig(c => ({ ...c, content_focus: c.content_focus.filter(f => f !== focus) }));
  };

  const addAvoidTopic = () => {
    if (newAvoidTopic && !config.avoid_topics.includes(newAvoidTopic)) {
      setConfig(c => ({ ...c, avoid_topics: [...c.avoid_topics, newAvoidTopic] }));
      setNewAvoidTopic('');
    }
  };

  const removeAvoidTopic = (topic: string) => {
    setConfig(c => ({ ...c, avoid_topics: c.avoid_topics.filter(t => t !== topic) }));
  };

  const togglePlatform = (platform: string) => {
    const updated = config.preferred_platforms.includes(platform)
      ? config.preferred_platforms.filter(p => p !== platform)
      : [...config.preferred_platforms, platform];
    if (updated.length > 0) {
      setConfig(c => ({ ...c, preferred_platforms: updated }));
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="flex items-center gap-3">
            <div className="p-2 rounded-xl neural-gradient">
              <Settings className="h-5 w-5 text-white" />
            </div>
            Configurações do Agente
          </SheetTitle>
          <SheetDescription>
            Personalize a aparência, comportamento e estratégia do seu agente
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-4 -mr-4">
            <Tabs defaultValue="identity" className="mt-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="identity" className="text-xs">
                  <Bot className="h-3 w-3 mr-1" />
                  Identidade
                </TabsTrigger>
                <TabsTrigger value="personality" className="text-xs">
                  <Brain className="h-3 w-3 mr-1" />
                  Persona
                </TabsTrigger>
                <TabsTrigger value="content" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Conteúdo
                </TabsTrigger>
                <TabsTrigger value="automation" className="text-xs">
                  <Gauge className="h-3 w-3 mr-1" />
                  Automação
                </TabsTrigger>
              </TabsList>

              {/* IDENTITY TAB */}
              <TabsContent value="identity" className="space-y-6 mt-6">
                {/* Avatar & Name */}
                <div className="flex items-start gap-4">
                  <div className="relative group">
                    <Avatar className="h-20 w-20 border-2 border-primary/20">
                      <AvatarImage src={config.agent_avatar_url || undefined} />
                      <AvatarFallback className="neural-gradient text-white text-2xl">
                        <Bot className="h-8 w-8" />
                      </AvatarFallback>
                    </Avatar>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Camera className="h-6 w-6 text-white" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Label>Nome do Agente</Label>
                    <Input
                      value={config.agent_name}
                      onChange={(e) => setConfig(c => ({ ...c, agent_name: e.target.value }))}
                      placeholder="Ex: Alex, Aria, Max..."
                    />
                    <p className="text-xs text-muted-foreground">
                      O nome que aparecerá no chat
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Industry & Audience */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Nicho/Indústria
                    </Label>
                    <Input
                      value={config.industry_niche || ''}
                      onChange={(e) => setConfig(c => ({ ...c, industry_niche: e.target.value }))}
                      placeholder="Ex: Fitness, Tech, Moda..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Público-Alvo
                    </Label>
                    <Input
                      value={config.target_audience || ''}
                      onChange={(e) => setConfig(c => ({ ...c, target_audience: e.target.value }))}
                      placeholder="Ex: Jovens 18-25..."
                    />
                  </div>
                </div>

                <Separator />

                {/* Brand Voice */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Voz da Marca
                  </Label>
                  <Textarea
                    value={config.brand_voice}
                    onChange={(e) => setConfig(c => ({ ...c, brand_voice: e.target.value }))}
                    placeholder="Descreva o tom e estilo de comunicação..."
                    className="min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Descreva como sua marca se comunica (ex: "descontraído mas profissional")
                  </p>
                </div>
              </TabsContent>

              {/* PERSONALITY TAB */}
              <TabsContent value="personality" className="space-y-6 mt-6">
                {/* Personality Traits */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Traços de Personalidade
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {config.personality_traits.map(trait => (
                      <Badge key={trait} variant="secondary" className="gap-1">
                        {trait}
                        <X 
                          className="h-3 w-3 cursor-pointer hover:text-destructive" 
                          onClick={() => removeTrait(trait)}
                        />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {PERSONALITY_OPTIONS.filter(p => !config.personality_traits.includes(p)).map(trait => (
                      <Button
                        key={trait}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => addTrait(trait)}
                      >
                        + {trait}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Response Style */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Estilo de Resposta</Label>
                    <Select
                      value={config.response_style}
                      onValueChange={(v) => setConfig(c => ({ ...c, response_style: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="concise">Conciso</SelectItem>
                        <SelectItem value="balanced">Equilibrado</SelectItem>
                        <SelectItem value="detailed">Detalhado</SelectItem>
                        <SelectItem value="storytelling">Narrativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Formalidade</Label>
                    <Select
                      value={config.language_formality}
                      onValueChange={(v) => setConfig(c => ({ ...c, language_formality: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="informal">Informal</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="professional">Profissional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Uso de Emojis</Label>
                  <Select
                    value={config.emoji_usage}
                    onValueChange={(v) => setConfig(c => ({ ...c, emoji_usage: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      <SelectItem value="minimal">Mínimo</SelectItem>
                      <SelectItem value="moderate">Moderado</SelectItem>
                      <SelectItem value="frequent">Frequente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Custom System Prompt */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4" />
                    Prompt do Sistema (Avançado)
                  </Label>
                  <Textarea
                    value={config.system_prompt_template || ''}
                    onChange={(e) => setConfig(c => ({ ...c, system_prompt_template: e.target.value }))}
                    placeholder="Deixe vazio para usar o padrão. Ou customize instruções específicas para o agente..."
                    className="min-h-[120px] font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Instruções personalizadas que serão adicionadas ao prompt do agente
                  </p>
                </div>
              </TabsContent>

              {/* CONTENT TAB */}
              <TabsContent value="content" className="space-y-6 mt-6">
                {/* Content Focus */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Foco do Conteúdo
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {config.content_focus.map(focus => (
                      <Badge key={focus} variant="secondary" className="gap-1">
                        {focus}
                        <X 
                          className="h-3 w-3 cursor-pointer hover:text-destructive" 
                          onClick={() => removeFocus(focus)}
                        />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {CONTENT_FOCUS_OPTIONS.filter(f => !config.content_focus.includes(f)).map(focus => (
                      <Button
                        key={focus}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => addFocus(focus)}
                      >
                        + {focus}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Hashtag & Posting Strategy */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      Estratégia de Hashtags
                    </Label>
                    <Select
                      value={config.hashtag_strategy}
                      onValueChange={(v) => setConfig(c => ({ ...c, hashtag_strategy: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minimal">Mínimo (3-5 ultra-específicas)</SelectItem>
                        <SelectItem value="nicho-focado">Nicho-Focado (5-8 categorização)</SelectItem>
                        <SelectItem value="mixed">Misto (8-10 balanceado)</SelectItem>
                        <SelectItem value="aggressive">Agressivo (15-20 descoberta)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      2025: Hashtags = categorização, não descoberta
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Estilo de Postagem</Label>
                    <Select
                      value={config.posting_style}
                      onValueChange={(v) => setConfig(c => ({ ...c, posting_style: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strategic-bursts">Bursts Estratégicos (3-5/sem)</SelectItem>
                        <SelectItem value="consistent">Consistente Diário</SelectItem>
                        <SelectItem value="quality-focused">Qualidade sobre Quantidade</SelectItem>
                        <SelectItem value="trend-reactive">Reativo a Tendências</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Buffer: 3-5 posts/semana = 2x crescimento
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Avoid Topics */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Ban className="h-4 w-4" />
                    Tópicos a Evitar
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {config.avoid_topics.map(topic => (
                      <Badge key={topic} variant="destructive" className="gap-1">
                        {topic}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => removeAvoidTopic(topic)}
                        />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newAvoidTopic}
                      onChange={(e) => setNewAvoidTopic(e.target.value)}
                      placeholder="Adicionar tópico..."
                      onKeyDown={(e) => e.key === 'Enter' && addAvoidTopic()}
                    />
                    <Button variant="outline" size="icon" onClick={addAvoidTopic}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* AUTOMATION TAB */}
              <TabsContent value="automation" className="space-y-6 mt-6">
                {/* Platforms */}
                <div className="space-y-3">
                  <Label>Plataformas Ativas</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={config.preferred_platforms.includes('instagram') ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => togglePlatform('instagram')}
                      className={config.preferred_platforms.includes('instagram') ? 'neural-gradient border-0' : ''}
                    >
                      <Instagram className="h-4 w-4 mr-2" />
                      Instagram
                    </Button>
                    <Button
                      variant={config.preferred_platforms.includes('tiktok') ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => togglePlatform('tiktok')}
                      className={config.preferred_platforms.includes('tiktok') ? 'neural-gradient border-0' : ''}
                    >
                      <Music2 className="h-4 w-4 mr-2" />
                      TikTok
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Posting Limits */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      Posts por Dia
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={config.daily_post_limit}
                      onChange={(e) => setConfig(c => ({ 
                        ...c, 
                        daily_post_limit: parseInt(e.target.value) || 2 
                      }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Intervalo (horas)
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={config.min_hours_between_posts}
                      onChange={(e) => setConfig(c => ({ 
                        ...c, 
                        min_hours_between_posts: parseInt(e.target.value) || 4 
                      }))}
                    />
                  </div>
                </div>

                <Separator />

                {/* Auto Post Toggle */}
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                  <div>
                    <Label className="text-base">Auto-Post</Label>
                    <p className="text-sm text-muted-foreground">
                      Permitir que o agente publique automaticamente
                    </p>
                  </div>
                  <Button
                    variant={config.auto_post_enabled ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setConfig(c => ({ ...c, auto_post_enabled: !c.auto_post_enabled }))}
                    className={config.auto_post_enabled ? 'neural-gradient border-0' : ''}
                  >
                    {config.auto_post_enabled ? 'Ativado' : 'Desativado'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>
        )}

        {/* Save Button */}
        <div className="shrink-0 pt-4 border-t mt-4">
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="w-full neural-gradient border-0"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
