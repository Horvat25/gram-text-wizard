import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  Save, Play, Zap, Timer, Loader2, 
  Fingerprint, Target, Palette,
  Bot, Sparkles, Eye, BookOpen, Flame, Crown, Heart,
  Briefcase, Users, Hash, Shield, Globe,
  MessageCircle, Instagram, Music2, Lightbulb, Megaphone, Layers,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format, setHours, setMinutes, isBefore, differenceInMinutes } from 'date-fns';
import { AgentContext } from '@/hooks/useAgentContext';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentUnifiedSettingsProps {
  context: AgentContext | null;
  onUpdate: (updates: Partial<AgentContext>) => Promise<void>;
  onRunAgent: () => void;
  isRunning: boolean;
}

const PERSONALITY_ARCHETYPES = [
  { id: 'analyst', label: 'Analista', icon: Eye, description: 'Dados e insights' },
  { id: 'creator', label: 'Criador', icon: Sparkles, description: 'Original e inovador' },
  { id: 'educator', label: 'Educador', icon: BookOpen, description: 'Ensina e simplifica' },
  { id: 'entertainer', label: 'Entertainer', icon: Flame, description: 'Humor e carisma' },
  { id: 'authority', label: 'Autoridade', icon: Crown, description: 'Referência no nicho' },
  { id: 'connector', label: 'Conector', icon: Heart, description: 'Comunidade e conexão' },
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
  { value: 'none', label: 'Sem emojis' },
  { value: 'minimal', label: 'Sutil ✨' },
  { value: 'moderate', label: 'Equilibrado 🎯💡' },
  { value: 'heavy', label: 'Expressivo 🔥🚀' },
];

const FORMALITY_LEVELS = [
  { value: 'formal', label: 'Formal' },
  { value: 'semi-formal', label: 'Semi-formal' },
  { value: 'informal', label: 'Informal' },
  { value: 'ultra-casual', label: 'Ultra casual' },
];

const HASHTAG_STRATEGIES = [
  { value: 'minimal', label: 'Sniper (3-5)' },
  { value: 'moderate', label: 'Balanced (5-10)' },
  { value: 'aggressive', label: 'Full Force (10-15)' },
];

export default function AgentUnifiedSettings({ 
  context, 
  onUpdate, 
  onRunAgent,
  isRunning 
}: AgentUnifiedSettingsProps) {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [countdown, setCountdown] = useState<string>('');
  const [newAvoidTopic, setNewAvoidTopic] = useState('');
  
  const [config, setConfig] = useState({
    agent_name: context?.agent_name || 'Aria',
    brand_voice: context?.brand_voice || '',
    personality_traits: context?.personality_traits || ['Analítico', 'Criativo'],
    content_focus: context?.content_focus || ['Notícias', 'Tendências'],
    target_audience: context?.target_audience || '',
    industry_niche: context?.industry_niche || 'Tecnologia',
    hashtag_strategy: context?.hashtag_strategy || 'moderate',
    preferred_platforms: context?.preferred_platforms || ['instagram'],
    auto_post_enabled: context?.auto_post_enabled || false,
    emoji_usage: context?.emoji_usage || 'moderate',
    language_formality: context?.language_formality || 'informal',
    avoid_topics: context?.avoid_topics || [],
    response_style: context?.response_style || 'balanced',
  });

  useEffect(() => {
    if (context) {
      setConfig({
        agent_name: context.agent_name || 'Aria',
        brand_voice: context.brand_voice || '',
        personality_traits: context.personality_traits || ['Analítico', 'Criativo'],
        content_focus: context.content_focus || ['Notícias', 'Tendências'],
        target_audience: context.target_audience || '',
        industry_niche: context.industry_niche || 'Tecnologia',
        hashtag_strategy: context.hashtag_strategy || 'moderate',
        preferred_platforms: context.preferred_platforms || ['instagram'],
        auto_post_enabled: context.auto_post_enabled || false,
        emoji_usage: context.emoji_usage || 'moderate',
        language_formality: context.language_formality || 'informal',
        avoid_topics: context.avoid_topics || [],
        response_style: context.response_style || 'balanced',
      });
    }
  }, [context]);

  // Countdown to next execution
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
      const diff = differenceInMinutes(nextHour, now);
      setCountdown(diff <= 0 ? 'Agora' : `${diff}min`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(config as any);
      toast.success('DNA do agente salvo!');
    } catch (error) {
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
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
    if (updated.length > 0) setConfig(c => ({ ...c, preferred_platforms: updated }));
  };

  const addAvoidTopic = () => {
    if (newAvoidTopic.trim() && !config.avoid_topics.includes(newAvoidTopic.trim())) {
      setConfig(c => ({ ...c, avoid_topics: [...c.avoid_topics, newAvoidTopic.trim()] }));
      setNewAvoidTopic('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Quick Actions Bar */}
      <Card className="border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border flex-1">
                <div className="flex items-center gap-2">
                  <Zap className={cn("h-4 w-4", config.auto_post_enabled ? "text-green-500" : "text-muted-foreground")} />
                  <span className="text-sm font-medium">Automático</span>
                </div>
                <Switch 
                  checked={config.auto_post_enabled}
                  onCheckedChange={(checked) => {
                    setConfig(c => ({ ...c, auto_post_enabled: checked }));
                    onUpdate({ auto_post_enabled: checked });
                  }}
                />
              </div>
              <Badge variant="outline" className="font-mono text-xs gap-1 shrink-0">
                <Timer className="h-3 w-3" />
                {countdown || '...'}
              </Badge>
            </div>
            <Button 
              onClick={onRunAgent} 
              disabled={isRunning}
              className="gap-2 neural-gradient border-0"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isRunning ? 'Executando...' : 'Executar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* DNA Configuration */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl neural-gradient">
              <Fingerprint className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">DNA do Agente</CardTitle>
              <CardDescription>Personalidade, nicho e voz — tudo que define quem ele é</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="dna" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dna" className="text-xs gap-1">
                <Fingerprint className="h-3 w-3" />
                DNA
              </TabsTrigger>
              <TabsTrigger value="niche" className="text-xs gap-1">
                <Target className="h-3 w-3" />
                Nicho
              </TabsTrigger>
              <TabsTrigger value="voice" className="text-xs gap-1">
                <Palette className="h-3 w-3" />
                Voz
              </TabsTrigger>
            </TabsList>

            {/* DNA TAB */}
            <TabsContent value="dna" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nome do Agente</Label>
                <Input
                  value={config.agent_name}
                  onChange={(e) => setConfig(c => ({ ...c, agent_name: e.target.value }))}
                  placeholder="Aria"
                  className="text-lg font-semibold"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Arquétipo</Label>
                  <p className="text-[11px] text-muted-foreground">Até 3 traços que definem o agente</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {PERSONALITY_ARCHETYPES.map(arch => {
                    const isSelected = config.personality_traits.includes(arch.label);
                    return (
                      <button
                        key={arch.id}
                        onClick={() => toggleArchetype(arch.id)}
                        className={cn(
                          "flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left",
                          isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 bg-muted/20"
                        )}
                      >
                        <arch.icon className={cn("h-4 w-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                        <div className="min-w-0">
                          <span className={cn("text-sm font-medium", isSelected && "text-primary")}>{arch.label}</span>
                          <p className="text-[10px] text-muted-foreground">{arch.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Plataformas</Label>
                <div className="flex gap-2">
                  {[
                    { id: 'instagram', label: 'Instagram', icon: Instagram },
                    { id: 'tiktok', label: 'TikTok', icon: Music2 },
                  ].map(p => (
                    <Button
                      key={p.id}
                      variant={config.preferred_platforms.includes(p.id) ? 'default' : 'outline'}
                      className={cn("flex-1 gap-2", config.preferred_platforms.includes(p.id) && "neural-gradient border-0")}
                      onClick={() => togglePlatform(p.id)}
                    >
                      <p.icon className="h-4 w-4" />
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* NICHE TAB */}
            <TabsContent value="niche" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  Nicho / Indústria
                </Label>
                <Input
                  value={config.industry_niche || ''}
                  onChange={(e) => setConfig(c => ({ ...c, industry_niche: e.target.value }))}
                  placeholder="Tecnologia e IA"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Público-Alvo
                </Label>
                <Textarea
                  value={config.target_audience || ''}
                  onChange={(e) => setConfig(c => ({ ...c, target_audience: e.target.value }))}
                  placeholder="Profissionais de TI interessados em automação e IA..."
                  className="resize-none h-16 text-sm"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pilares de Conteúdo</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CONTENT_PILLARS.map(pillar => {
                    const isSelected = config.content_focus.includes(pillar.label);
                    return (
                      <button
                        key={pillar.id}
                        onClick={() => togglePillar(pillar.id)}
                        className={cn(
                          "flex items-center gap-2 p-2.5 rounded-xl border transition-all text-left",
                          isSelected ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/20 bg-muted/20"
                        )}
                      >
                        <pillar.icon className={cn("h-4 w-4 shrink-0", isSelected ? pillar.color : "text-muted-foreground")} />
                        <span className={cn("text-sm", isSelected && "font-medium")}>{pillar.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Tópicos Proibidos
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newAvoidTopic}
                    onChange={(e) => setNewAvoidTopic(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addAvoidTopic()}
                    placeholder="política, religião..."
                    className="text-sm"
                  />
                  <Button variant="outline" size="sm" onClick={addAvoidTopic} disabled={!newAvoidTopic.trim()}>+</Button>
                </div>
                {config.avoid_topics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {config.avoid_topics.map(topic => (
                      <Badge
                        key={topic}
                        variant="secondary"
                        className="gap-1 cursor-pointer hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => setConfig(c => ({ ...c, avoid_topics: c.avoid_topics.filter(t => t !== topic) }))}
                      >
                        {topic} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5" />
                  Hashtags
                </Label>
                <div className="flex gap-2">
                  {HASHTAG_STRATEGIES.map(s => (
                    <Button
                      key={s.value}
                      variant={config.hashtag_strategy === s.value ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setConfig(c => ({ ...c, hashtag_strategy: s.value }))}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* VOICE TAB */}
            <TabsContent value="voice" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Manifesto da Voz
                </Label>
                <Textarea
                  value={config.brand_voice}
                  onChange={(e) => setConfig(c => ({ ...c, brand_voice: e.target.value }))}
                  placeholder="Descreva como o agente deve soar... Ex: Falo como um amigo inteligente que entende de tech."
                  className="resize-none h-20 text-sm"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Estilo</Label>
                <div className="grid grid-cols-3 gap-2">
                  {COMMUNICATION_STYLES.map(style => {
                    const isSelected = config.response_style === style.id;
                    return (
                      <button
                        key={style.id}
                        onClick={() => setConfig(c => ({ ...c, response_style: style.id }))}
                        className={cn(
                          "flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all",
                          isSelected ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/20"
                        )}
                      >
                        <span className="text-lg">{style.emoji}</span>
                        <span className={cn("text-[11px] font-medium", isSelected && "text-primary")}>{style.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Formalidade</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMALITY_LEVELS.map(l => (
                    <Button
                      key={l.value}
                      variant={config.language_formality === l.value ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs"
                      onClick={() => setConfig(c => ({ ...c, language_formality: l.value }))}
                    >
                      {l.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Emojis</Label>
                <div className="grid grid-cols-2 gap-2">
                  {EMOJI_LEVELS.map(l => (
                    <Button
                      key={l.value}
                      variant={config.emoji_usage === l.value ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs"
                      onClick={() => setConfig(c => ({ ...c, emoji_usage: l.value }))}
                    >
                      {l.label}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-4" />

          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="w-full neural-gradient border-0 gap-2"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar DNA
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
