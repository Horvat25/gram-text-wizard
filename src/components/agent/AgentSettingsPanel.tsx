import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  Settings, 
  Bot,
  Loader2,
  Trash2,
  Zap,
  Save,
  Instagram,
  Music2,
  Sparkles,
  Users,
  Briefcase,
  Hash,
  Palette,
  Globe,
  MessageCircle,
  Shield,
  Flame,
  Eye,
  Heart,
  Megaphone,
  Lightbulb,
  BookOpen,
  Target,
  Layers,
  Crown,
  Fingerprint,
  Link2,
  Plus,
  RefreshCw,
  Video,
  Mic,
  Play,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';
import { useTikTokAccounts } from '@/hooks/useTikTokAccounts';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';
import { cn } from '@/lib/utils';

interface AgentSettingsPanelProps {
  trigger?: React.ReactNode;
  onConfigChange?: (config: any) => void;
  onClearChat?: () => void;
}

const PERSONALITY_ARCHETYPES = [
  { id: 'analyst', label: 'Analista', icon: Eye, description: 'Dados e insights profundos' },
  { id: 'creator', label: 'Criador', icon: Sparkles, description: 'Conteúdo original e inovador' },
  { id: 'educator', label: 'Educador', icon: BookOpen, description: 'Ensina e simplifica' },
  { id: 'entertainer', label: 'Entertainer', icon: Flame, description: 'Engaja com humor e carisma' },
  { id: 'authority', label: 'Autoridade', icon: Crown, description: 'Referência no nicho' },
  { id: 'connector', label: 'Conector', icon: Heart, description: 'Cria comunidade e conexão' },
];

const COMMUNICATION_STYLES = [
  { id: 'direct', label: 'Direto', emoji: '🎯' },
  { id: 'storytelling', label: 'Storytelling', emoji: '📖' },
  { id: 'provocative', label: 'Provocativo', emoji: '🔥' },
  { id: 'empathetic', label: 'Empático', emoji: '💙' },
  { id: 'data-driven', label: 'Data-driven', emoji: '📊' },
  { id: 'inspirational', label: 'Inspirador', emoji: '✨' },
];

const CONTENT_PILLARS = [
  { id: 'trends', label: 'Tendências', icon: Flame, color: 'text-orange-500' },
  { id: 'tutorials', label: 'Tutoriais', icon: BookOpen, color: 'text-blue-500' },
  { id: 'news', label: 'Notícias', icon: Globe, color: 'text-green-500' },
  { id: 'reviews', label: 'Reviews', icon: Eye, color: 'text-purple-500' },
  { id: 'insights', label: 'Insights', icon: Lightbulb, color: 'text-yellow-500' },
  { id: 'behind-scenes', label: 'Bastidores', icon: Layers, color: 'text-pink-500' },
  { id: 'opinion', label: 'Opinião', icon: Megaphone, color: 'text-red-500' },
  { id: 'entertainment', label: 'Entretenimento', icon: Sparkles, color: 'text-cyan-500' },
];

const EMOJI_LEVELS = [
  { value: 'none', label: 'Sem emojis', preview: 'Texto limpo e profissional' },
  { value: 'minimal', label: 'Sutil', preview: 'Um ou dois por post ✨' },
  { value: 'moderate', label: 'Equilibrado', preview: 'Pontuação visual 🎯💡' },
  { value: 'heavy', label: 'Expressivo', preview: '🔥🚀✨ Em cada frase!' },
];

const FORMALITY_LEVELS = [
  { value: 'formal', label: 'Formal', description: 'Vocabulário técnico e estruturado' },
  { value: 'semi-formal', label: 'Semi-formal', description: 'Profissional mas acessível' },
  { value: 'informal', label: 'Informal', description: 'Conversa entre amigos' },
  { value: 'ultra-casual', label: 'Ultra casual', description: 'Gírias e linguagem da internet' },
];

const HASHTAG_STRATEGIES = [
  { value: 'minimal', label: 'Sniper', count: '3-5', description: 'Poucos e altamente relevantes' },
  { value: 'moderate', label: 'Balanced', count: '5-10', description: 'Mix de alcance e nicho' },
  { value: 'aggressive', label: 'Full Force', count: '10-15', description: 'Máxima descobribilidade' },
];

export default function AgentSettingsPanel({ trigger, onConfigChange, onClearChat }: AgentSettingsPanelProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { accounts: igAccounts, fetchAccounts: fetchIgAccounts, disconnectAccount: disconnectIg, getTokenStatus: getIgTokenStatus, getDaysUntilExpiry: getIgDaysUntilExpiry } = useInstagramAccounts();
  const { accounts: tiktokAccounts, fetchAccounts: fetchTkAccounts, disconnectAccount: disconnectTk, getTokenStatus: getTkTokenStatus, getDaysUntilExpiry: getTkDaysUntilExpiry } = useTikTokAccounts();
  const { settings: brandSettings, updateSettings: updateBrandSettings } = useBrandSettings();
  
  const [context, setContext] = useState<AgentContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'dna' | 'niche' | 'voice' | 'connections'>('dna');
  const [connecting, setConnecting] = useState(false);
  const [connectingTikTok, setConnectingTikTok] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("camila");
  const [testingVoice, setTestingVoice] = useState<string | null>(null);
  
  const [config, setConfig] = useState({
    agent_name: 'Agente IA',
    agent_avatar_url: null as string | null,
    brand_voice: '',
    personality_traits: ['Analítico', 'Criativo'] as string[],
    content_focus: ['Notícias', 'Tendências'] as string[],
    target_audience: '',
    industry_niche: 'Tecnologia',
    hashtag_strategy: 'moderate',
    preferred_platforms: ['instagram'] as string[],
    auto_post_enabled: false,
    emoji_usage: 'moderate',
    language_formality: 'informal',
    avoid_topics: [] as string[],
    response_style: 'balanced',
  });

  const [newAvoidTopic, setNewAvoidTopic] = useState('');

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
          brand_voice: data.brand_voice || '',
          personality_traits: data.personality_traits || ['Analítico', 'Criativo'],
          content_focus: data.content_focus || ['Notícias', 'Tendências'],
          target_audience: data.target_audience || '',
          industry_niche: data.industry_niche || 'Tecnologia',
          hashtag_strategy: data.hashtag_strategy || 'moderate',
          preferred_platforms: data.preferred_platforms || ['instagram'],
          auto_post_enabled: data.auto_post_enabled || false,
          emoji_usage: data.emoji_usage || 'moderate',
          language_formality: data.language_formality || 'informal',
          avoid_topics: data.avoid_topics || [],
          response_style: data.response_style || 'balanced',
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

      toast.success('DNA do agente atualizado!');
      onConfigChange?.({ ...context, ...config });
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
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
      toast.error('Erro ao limpar histórico');
    }
  };

  const toggleArchetype = (id: string) => {
    const trait = PERSONALITY_ARCHETYPES.find(a => a.id === id)?.label || id;
    const updated = config.personality_traits.includes(trait)
      ? config.personality_traits.filter(t => t !== trait)
      : config.personality_traits.length < 3
        ? [...config.personality_traits, trait]
        : config.personality_traits;
    setConfig(c => ({ ...c, personality_traits: updated }));
  };

  const togglePillar = (id: string) => {
    const label = CONTENT_PILLARS.find(p => p.id === id)?.label || id;
    const updated = config.content_focus.includes(label)
      ? config.content_focus.filter(f => f !== label)
      : [...config.content_focus, label];
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

  const addAvoidTopic = () => {
    if (newAvoidTopic.trim() && !config.avoid_topics.includes(newAvoidTopic.trim())) {
      setConfig(c => ({ ...c, avoid_topics: [...c.avoid_topics, newAvoidTopic.trim()] }));
      setNewAvoidTopic('');
    }
  };

  const removeAvoidTopic = (topic: string) => {
    setConfig(c => ({ ...c, avoid_topics: c.avoid_topics.filter(t => t !== topic) }));
  };

  const sections = [
    { id: 'dna' as const, label: 'DNA', icon: Fingerprint },
    { id: 'niche' as const, label: 'Nicho', icon: Target },
    { id: 'voice' as const, label: 'Voz', icon: Palette },
  ];

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
              <Fingerprint className="h-4 w-4 text-white" />
            </div>
            DNA do Agente
          </SheetTitle>
          <SheetDescription>Defina quem o agente é, como pensa e como se comunica</SheetDescription>
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
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1 px-4">
              <div className="py-4 space-y-6">
                <AnimatePresence mode="wait">
                  {/* DNA Section — Personality & Identity */}
                  {activeSection === 'dna' && (
                    <motion.div 
                      key="dna"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-5"
                    >
                      {/* Agent Name */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nome do Agente</Label>
                        <Input
                          value={config.agent_name}
                          onChange={(e) => setConfig(c => ({ ...c, agent_name: e.target.value }))}
                          placeholder="Ex: Aria, Nova, Atlas..."
                          className="text-lg font-semibold"
                        />
                      </div>

                      {/* Personality Archetype — pick up to 3 */}
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Arquétipo de Personalidade</Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Escolha até 3 que definem o DNA do agente</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {PERSONALITY_ARCHETYPES.map(arch => {
                            const isSelected = config.personality_traits.includes(arch.label);
                            return (
                              <button
                                key={arch.id}
                                onClick={() => toggleArchetype(arch.id)}
                                className={cn(
                                  "flex items-start gap-3 p-3 rounded-xl border transition-all text-left",
                                  isSelected 
                                    ? "border-primary bg-primary/5 shadow-sm shadow-primary/10" 
                                    : "border-border hover:border-primary/30 bg-muted/20"
                                )}
                              >
                                <div className={cn(
                                  "p-1.5 rounded-lg mt-0.5",
                                  isSelected ? "bg-primary/20" : "bg-muted"
                                )}>
                                  <arch.icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                                </div>
                                <div className="min-w-0">
                                  <span className={cn("text-sm font-medium block", isSelected && "text-primary")}>{arch.label}</span>
                                  <span className="text-[10px] text-muted-foreground leading-tight">{arch.description}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Platforms */}
                      <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Plataformas</Label>
                        <div className="flex gap-2">
                          {[
                            { id: 'instagram', label: 'Instagram', icon: Instagram },
                            { id: 'tiktok', label: 'TikTok', icon: Music2 },
                          ].map(p => (
                            <Button
                              key={p.id}
                              variant={config.preferred_platforms.includes(p.id) ? 'default' : 'outline'}
                              className={cn(
                                "flex-1 gap-2",
                                config.preferred_platforms.includes(p.id) && "neural-gradient border-0"
                              )}
                              onClick={() => togglePlatform(p.id)}
                            >
                              <p.icon className="h-4 w-4" />
                              {p.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      {/* Auto Mode */}
                      <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg transition-colors",
                            config.auto_post_enabled ? "bg-green-500/20" : "bg-muted"
                          )}>
                            <Zap className={cn("h-5 w-5", config.auto_post_enabled ? "text-green-500" : "text-muted-foreground")} />
                          </div>
                          <div>
                            <span className="font-medium text-sm">Piloto Automático</span>
                            <p className="text-[11px] text-muted-foreground">Publica sozinho nas plataformas ativas</p>
                          </div>
                        </div>
                        <Switch 
                          checked={config.auto_post_enabled}
                          onCheckedChange={(checked) => setConfig(c => ({ ...c, auto_post_enabled: checked }))}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* NICHE Section — Strategy & Content Pillars */}
                  {activeSection === 'niche' && (
                    <motion.div 
                      key="niche"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-5"
                    >
                      {/* Industry */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Briefcase className="h-3.5 w-3.5" />
                          Nicho / Indústria
                        </Label>
                        <Input
                          value={config.industry_niche || ''}
                          onChange={(e) => setConfig(c => ({ ...c, industry_niche: e.target.value }))}
                          placeholder="Tecnologia e Inteligência Artificial"
                          className="font-medium"
                        />
                        <p className="text-[11px] text-muted-foreground">O universo temático de todo conteúdo gerado</p>
                      </div>

                      {/* Target Audience */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          Público-Alvo
                        </Label>
                        <Textarea
                          value={config.target_audience || ''}
                          onChange={(e) => setConfig(c => ({ ...c, target_audience: e.target.value }))}
                          placeholder="Ex: Profissionais de TI entre 25-40 anos, interessados em automação, IA e produtividade. Buscam conteúdo prático para aplicar no dia a dia."
                          className="resize-none h-20 text-sm"
                        />
                      </div>

                      {/* Content Pillars */}
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pilares de Conteúdo</Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">O que o agente vai priorizar na criação</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {CONTENT_PILLARS.map(pillar => {
                            const isSelected = config.content_focus.includes(pillar.label);
                            return (
                              <button
                                key={pillar.id}
                                onClick={() => togglePillar(pillar.id)}
                                className={cn(
                                  "flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left",
                                  isSelected 
                                    ? "border-primary/40 bg-primary/5" 
                                    : "border-border hover:border-primary/20 bg-muted/20"
                                )}
                              >
                                <pillar.icon className={cn("h-4 w-4 shrink-0", isSelected ? pillar.color : "text-muted-foreground")} />
                                <span className={cn("text-sm", isSelected ? "font-medium" : "text-muted-foreground")}>{pillar.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Avoid Topics */}
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5" />
                            Tópicos Proibidos
                          </Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Assuntos que o agente nunca deve mencionar</p>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={newAvoidTopic}
                            onChange={(e) => setNewAvoidTopic(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addAvoidTopic()}
                            placeholder="Ex: política, religião..."
                            className="text-sm"
                          />
                          <Button variant="outline" size="sm" onClick={addAvoidTopic} disabled={!newAvoidTopic.trim()}>
                            +
                          </Button>
                        </div>
                        {config.avoid_topics.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {config.avoid_topics.map(topic => (
                              <Badge
                                key={topic}
                                variant="secondary"
                                className="gap-1 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors"
                                onClick={() => removeAvoidTopic(topic)}
                              >
                                {topic} ×
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Hashtag Strategy */}
                      <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5" />
                          Estratégia de Hashtags
                        </Label>
                        <div className="space-y-2">
                          {HASHTAG_STRATEGIES.map(strat => (
                            <button
                              key={strat.value}
                              onClick={() => setConfig(c => ({ ...c, hashtag_strategy: strat.value }))}
                              className={cn(
                                "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                                config.hashtag_strategy === strat.value 
                                  ? "border-primary/40 bg-primary/5" 
                                  : "border-border hover:border-primary/20"
                              )}
                            >
                              <div>
                                <span className="text-sm font-medium">{strat.label}</span>
                                <p className="text-[11px] text-muted-foreground">{strat.description}</p>
                              </div>
                              <Badge variant={config.hashtag_strategy === strat.value ? 'default' : 'secondary'} className="text-xs">
                                {strat.count}
                              </Badge>
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* VOICE Section — Tone, Style, Communication */}
                  {activeSection === 'voice' && (
                    <motion.div 
                      key="voice"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-5"
                    >
                      {/* Brand Voice */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <MessageCircle className="h-3.5 w-3.5" />
                          Manifesto da Voz
                        </Label>
                        <Textarea
                          value={config.brand_voice}
                          onChange={(e) => setConfig(c => ({ ...c, brand_voice: e.target.value }))}
                          placeholder="Ex: Falo como um amigo inteligente que entende de tech. Uso analogias do dia a dia para explicar coisas complexas. Sou otimista sobre o futuro mas realista sobre os desafios."
                          className="resize-none h-24 text-sm"
                        />
                        <p className="text-[11px] text-muted-foreground">Descreva em palavras livres como o agente deve soar</p>
                      </div>

                      {/* Communication Style */}
                      <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Estilo de Comunicação</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {COMMUNICATION_STYLES.map(style => {
                            const isSelected = config.response_style === style.id;
                            return (
                              <button
                                key={style.id}
                                onClick={() => setConfig(c => ({ ...c, response_style: style.id }))}
                                className={cn(
                                  "flex flex-col items-center gap-1 p-3 rounded-xl border transition-all",
                                  isSelected 
                                    ? "border-primary/40 bg-primary/5 shadow-sm" 
                                    : "border-border hover:border-primary/20"
                                )}
                              >
                                <span className="text-lg">{style.emoji}</span>
                                <span className={cn("text-xs font-medium", isSelected && "text-primary")}>{style.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Formality Level */}
                      <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nível de Formalidade</Label>
                        <div className="space-y-2">
                          {FORMALITY_LEVELS.map(level => (
                            <button
                              key={level.value}
                              onClick={() => setConfig(c => ({ ...c, language_formality: level.value }))}
                              className={cn(
                                "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                                config.language_formality === level.value 
                                  ? "border-primary/40 bg-primary/5" 
                                  : "border-border hover:border-primary/20"
                              )}
                            >
                              <div>
                                <span className="text-sm font-medium">{level.label}</span>
                                <p className="text-[11px] text-muted-foreground">{level.description}</p>
                              </div>
                              {config.language_formality === level.value && (
                                <div className="h-2 w-2 rounded-full bg-primary" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Emoji Usage */}
                      <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Uso de Emojis</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {EMOJI_LEVELS.map(level => {
                            const isSelected = config.emoji_usage === level.value;
                            return (
                              <button
                                key={level.value}
                                onClick={() => setConfig(c => ({ ...c, emoji_usage: level.value }))}
                                className={cn(
                                  "flex flex-col items-start p-3 rounded-xl border transition-all text-left",
                                  isSelected 
                                    ? "border-primary/40 bg-primary/5" 
                                    : "border-border hover:border-primary/20"
                                )}
                              >
                                <span className={cn("text-sm font-medium", isSelected && "text-primary")}>{level.label}</span>
                                <span className="text-[10px] text-muted-foreground">{level.preview}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t space-y-2">
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                className="w-full gap-2 neural-gradient border-0"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar DNA
              </Button>
              
              <Button 
                variant="ghost" 
                className="w-full gap-2 text-muted-foreground hover:text-destructive text-xs"
                onClick={handleClearChat}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar Histórico do Chat
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
