import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { 
  Settings, 
  Bot,
  Loader2,
  Trash2,
  Zap,
  Clock,
  Target,
  Video,
  Newspaper,
  Image as ImageIcon,
  Layers,
  Save,
  Instagram,
  Music2,
  Sparkles,
  Users,
  Briefcase,
  Hash
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';
import { cn } from '@/lib/utils';

interface AgentSettingsPanelProps {
  trigger?: React.ReactNode;
  onConfigChange?: (config: any) => void;
  onClearChat?: () => void;
}

const PERSONALITY_TRAITS = [
  'Analítico', 'Criativo', 'Estratégico', 'Empático', 
  'Direto', 'Humorístico', 'Inspirador', 'Educador'
];

const CONTENT_FOCUS_OPTIONS = [
  'Tutoriais', 'Notícias', 'Tendências', 'Bastidores',
  'Dicas', 'Reviews', 'Análises', 'Entretenimento'
];

export default function AgentSettingsPanel({ trigger, onConfigChange, onClearChat }: AgentSettingsPanelProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [context, setContext] = useState<AgentContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSection, setActiveSection] = useState<'automation' | 'personality' | 'content'>('automation');
  
  // Config state
  const [config, setConfig] = useState({
    agent_name: 'Agente IA',
    agent_avatar_url: null as string | null,
    brand_voice: 'Autêntico e valioso',
    personality_traits: ['Analítico', 'Criativo'] as string[],
    content_focus: ['Notícias', 'Tendências'] as string[],
    target_audience: '',
    industry_niche: 'Tecnologia',
    hashtag_strategy: 'moderate',
    daily_post_limit: 2,
    min_hours_between_posts: 4,
    preferred_platforms: ['instagram'] as string[],
    auto_post_enabled: false,
    content_distribution_videos: 3,
    content_distribution_carousels: 2,
    content_distribution_news: 4,
    content_distribution_images: 5,
  });

  useEffect(() => {
    if (user && currentWorkspace && isOpen) {
      loadContext();
    }
  }, [user, currentWorkspace, isOpen]);

  const loadContext = async () => {
    if (!user || !currentWorkspace) return;
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('agent_context')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setContext(data as AgentContext);
        setConfig({
          agent_name: data.agent_name || 'Agente IA',
          agent_avatar_url: data.agent_avatar_url || null,
          brand_voice: data.brand_voice || 'Autêntico e valioso',
          personality_traits: data.personality_traits || ['Analítico', 'Criativo'],
          content_focus: data.content_focus || ['Notícias', 'Tendências'],
          target_audience: data.target_audience || '',
          industry_niche: data.industry_niche || 'Tecnologia',
          hashtag_strategy: data.hashtag_strategy || 'moderate',
          daily_post_limit: data.daily_post_limit || 2,
          min_hours_between_posts: data.min_hours_between_posts || 4,
          preferred_platforms: data.preferred_platforms || ['instagram'],
          auto_post_enabled: data.auto_post_enabled || false,
          content_distribution_videos: data.content_distribution_videos ?? 3,
          content_distribution_carousels: data.content_distribution_carousels ?? 2,
          content_distribution_news: data.content_distribution_news ?? 4,
          content_distribution_images: data.content_distribution_images ?? 5,
        });
      }
    } catch (error) {
      console.error('Error loading context:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !currentWorkspace) return;
    setIsSaving(true);

    try {
      const { data: existing } = await supabase
        .from('agent_context')
        .select('id')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      const updates = {
        ...config,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        await supabase
          .from('agent_context')
          .update(updates)
          .eq('workspace_id', currentWorkspace.id);
      } else {
        await supabase
          .from('agent_context')
          .insert({ user_id: user.id, workspace_id: currentWorkspace.id, ...updates });
      }

      toast.success('Configurações salvas!');
      onConfigChange?.({ ...context, ...config });
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunAgent = async () => {
    if (!user || !currentWorkspace) return;
    setIsRunning(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-core', {
        body: { 
          userId: user.id, 
          workspaceId: currentWorkspace.id,
          trigger: 'manual' 
        }
      });

      if (error) throw error;
      toast.success(`Agente executado! Decisão: ${data.decision}`);
    } catch (error) {
      console.error('Error running agent:', error);
      toast.error('Erro ao executar agente');
    } finally {
      setIsRunning(false);
    }
  };

  const handleClearChat = async () => {
    if (!user || !currentWorkspace) return;

    try {
      await supabase
        .from('agent_chat_messages')
        .delete()
        .eq('workspace_id', currentWorkspace.id);
      
      toast.success('Histórico limpo!');
      onClearChat?.();
    } catch (error) {
      console.error('Error clearing chat:', error);
      toast.error('Erro ao limpar histórico');
    }
  };

  const toggleTrait = (trait: string) => {
    const updated = config.personality_traits.includes(trait)
      ? config.personality_traits.filter(t => t !== trait)
      : [...config.personality_traits, trait];
    setConfig(c => ({ ...c, personality_traits: updated }));
  };

  const toggleFocus = (focus: string) => {
    const updated = config.content_focus.includes(focus)
      ? config.content_focus.filter(f => f !== focus)
      : [...config.content_focus, focus];
    setConfig(c => ({ ...c, content_focus: updated }));
  };

  const togglePlatform = (platform: string) => {
    const updated = config.preferred_platforms.includes(platform)
      ? config.preferred_platforms.filter(p => p !== platform)
      : [...config.preferred_platforms, platform];
    if (updated.length > 0) {
      setConfig(c => ({ ...c, preferred_platforms: updated }));
    }
  };

  const weeklyTotal = config.daily_post_limit * 7;
  const assignedTotal = config.content_distribution_videos + config.content_distribution_carousels + 
                        config.content_distribution_news + config.content_distribution_images;

  const sections = [
    { id: 'automation', label: 'Automação', icon: Zap },
    { id: 'personality', label: 'Identidade', icon: Bot },
    { id: 'content', label: 'Conteúdo', icon: Sparkles },
  ] as const;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg neural-gradient">
              <Settings className="h-4 w-4 text-white" />
            </div>
            Configurações
          </SheetTitle>
          <SheetDescription>Configure o comportamento do seu agente</SheetDescription>
        </SheetHeader>
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Section Tabs */}
            <div className="px-4 pt-4">
              <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                      activeSection === section.id 
                        ? "bg-background shadow-sm text-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <section.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{section.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1 px-4">
              <div className="py-4 space-y-6">
                {/* Automation Section */}
                {activeSection === 'automation' && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    {/* Auto Mode Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg transition-colors",
                          config.auto_post_enabled ? "bg-green-500/20" : "bg-muted"
                        )}>
                          <Zap className={cn(
                            "h-5 w-5",
                            config.auto_post_enabled ? "text-green-500" : "text-muted-foreground"
                          )} />
                        </div>
                        <div>
                          <span className="font-medium">Piloto Automático</span>
                          <p className="text-xs text-muted-foreground">
                            Publicação automática nas redes
                          </p>
                        </div>
                      </div>
                      <Switch 
                        checked={config.auto_post_enabled}
                        onCheckedChange={(checked) => setConfig(c => ({ ...c, auto_post_enabled: checked }))}
                      />
                    </div>

                    {/* Run Now */}
                    <Button 
                      onClick={handleRunAgent} 
                      disabled={isRunning}
                      className="w-full gap-2 neural-gradient border-0"
                      size="lg"
                    >
                      {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      {isRunning ? 'Executando...' : 'Executar Agente Agora'}
                    </Button>

                    <Separator />

                    {/* Limits */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        Limites de Postagem
                      </h4>
                      
                      <div className="space-y-4 p-4 rounded-xl bg-muted/30 border">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Posts por dia</Label>
                            <span className="text-lg font-bold text-primary">{config.daily_post_limit}</span>
                          </div>
                          <Slider
                            value={[config.daily_post_limit]}
                            onValueChange={([v]) => setConfig(c => ({ ...c, daily_post_limit: v }))}
                            min={1}
                            max={10}
                            step={1}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Intervalo mínimo</Label>
                            <span className="text-lg font-bold text-primary">{config.min_hours_between_posts}h</span>
                          </div>
                          <Slider
                            value={[config.min_hours_between_posts]}
                            onValueChange={([v]) => setConfig(c => ({ ...c, min_hours_between_posts: v }))}
                            min={1}
                            max={12}
                            step={1}
                          />
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Distribution */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <Target className="h-4 w-4 text-green-500" />
                          Metas Semanais
                        </h4>
                        <Badge variant="secondary">{assignedTotal}/{weeklyTotal}</Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'content_distribution_videos', icon: Video, label: 'Reels/Vídeos', color: 'text-pink-500' },
                          { key: 'content_distribution_images', icon: ImageIcon, label: 'Posts Imagem', color: 'text-green-500' },
                          { key: 'content_distribution_news', icon: Newspaper, label: 'Notícias', color: 'text-blue-500' },
                          { key: 'content_distribution_carousels', icon: Layers, label: 'Carrosséis', color: 'text-purple-500' },
                        ].map((item) => (
                          <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                            <div className="flex items-center gap-2">
                              <item.icon className={cn("h-4 w-4", item.color)} />
                              <span className="text-xs text-muted-foreground">{item.label}</span>
                            </div>
                            <div className={cn("text-lg font-bold", item.color)}>
                              {config[item.key as keyof typeof config] as number}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Personality Section */}
                {activeSection === 'personality' && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label>Nome do Agente</Label>
                      <Input
                        value={config.agent_name}
                        onChange={(e) => setConfig(c => ({ ...c, agent_name: e.target.value }))}
                        placeholder="Ex: Aria"
                      />
                    </div>

                    {/* Agent Avatar Info */}
                    <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-violet-500/5 border border-primary/20">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl neural-gradient">
                          <Bot className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Avatar 3D</p>
                          <p className="text-xs text-muted-foreground">O visual do agente é exibido na tela principal</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Tom de Voz</Label>
                      <Textarea
                        value={config.brand_voice}
                        onChange={(e) => setConfig(c => ({ ...c, brand_voice: e.target.value }))}
                        placeholder="Como o agente deve se comunicar..."
                        className="resize-none h-20"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Traços de Personalidade</Label>
                      <div className="flex flex-wrap gap-2">
                        {PERSONALITY_TRAITS.map(trait => (
                          <Badge
                            key={trait}
                            variant={config.personality_traits.includes(trait) ? 'default' : 'outline'}
                            className={cn(
                              "cursor-pointer transition-all",
                              config.personality_traits.includes(trait) && "neural-gradient border-0"
                            )}
                            onClick={() => toggleTrait(trait)}
                          >
                            {trait}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Plataformas Ativas</Label>
                      <div className="flex gap-2">
                        <Button
                          variant={config.preferred_platforms.includes('instagram') ? 'default' : 'outline'}
                          className={cn(
                            "flex-1 gap-2",
                            config.preferred_platforms.includes('instagram') && "neural-gradient border-0"
                          )}
                          onClick={() => togglePlatform('instagram')}
                        >
                          <Instagram className="h-4 w-4" />
                          Instagram
                        </Button>
                        <Button
                          variant={config.preferred_platforms.includes('tiktok') ? 'default' : 'outline'}
                          className={cn(
                            "flex-1 gap-2",
                            config.preferred_platforms.includes('tiktok') && "neural-gradient border-0"
                          )}
                          onClick={() => togglePlatform('tiktok')}
                        >
                          <Music2 className="h-4 w-4" />
                          TikTok
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Content Section */}
                {activeSection === 'content' && (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Nicho/Indústria
                      </Label>
                      <Input
                        value={config.industry_niche}
                        onChange={(e) => setConfig(c => ({ ...c, industry_niche: e.target.value }))}
                        placeholder="Tecnologia, IA, Inovação..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Público-Alvo
                      </Label>
                      <Input
                        value={config.target_audience}
                        onChange={(e) => setConfig(c => ({ ...c, target_audience: e.target.value }))}
                        placeholder="Profissionais de TI, entusiastas..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Foco de Conteúdo</Label>
                      <div className="flex flex-wrap gap-2">
                        {CONTENT_FOCUS_OPTIONS.map(focus => (
                          <Badge
                            key={focus}
                            variant={config.content_focus.includes(focus) ? 'default' : 'outline'}
                            className={cn(
                              "cursor-pointer transition-all",
                              config.content_focus.includes(focus) && "bg-primary/20 text-primary border-primary/30"
                            )}
                            onClick={() => toggleFocus(focus)}
                          >
                            {focus}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        Estratégia de Hashtags
                      </Label>
                      <div className="flex gap-2">
                        {[
                          { value: 'minimal', label: '3-5' },
                          { value: 'moderate', label: '5-10' },
                          { value: 'aggressive', label: '10-15' },
                        ].map(opt => (
                          <Button
                            key={opt.value}
                            variant={config.hashtag_strategy === opt.value ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1"
                            onClick={() => setConfig(c => ({ ...c, hashtag_strategy: opt.value }))}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </ScrollArea>

            {/* Footer Actions */}
            <div className="p-4 border-t space-y-2">
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                className="w-full gap-2 neural-gradient border-0"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Configurações
              </Button>
              
              <Button 
                variant="ghost" 
                className="w-full gap-2 text-muted-foreground hover:text-destructive"
                onClick={handleClearChat}
              >
                <Trash2 className="h-4 w-4" />
                Limpar Histórico do Chat
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
