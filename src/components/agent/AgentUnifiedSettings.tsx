import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Slider } from '@/components/ui/slider';
import { 
  Settings, Save, Instagram, Music2, Clock, Gauge, Bot, Sparkles,
  Target, Hash, Play, Timer, Zap, Calendar, ChevronDown, ChevronUp,
  Settings2, Loader2, Eye, Users, TrendingUp, Briefcase, Brain
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format, setHours, setMinutes, isBefore, differenceInMinutes } from 'date-fns';
import { AgentContext } from '@/hooks/useAgentContext';

interface AgentUnifiedSettingsProps {
  context: AgentContext | null;
  onUpdate: (updates: Partial<AgentContext>) => Promise<void>;
  onRunAgent: () => void;
  isRunning: boolean;
}

const CRON_FREQUENCIES = [
  { value: '1', label: '1h' },
  { value: '2', label: '2h' },
  { value: '3', label: '3h' },
  { value: '4', label: '4h' },
  { value: '6', label: '6h' },
  { value: '12', label: '12h' },
  { value: '24', label: '24h' },
];

const PERSONALITY_TRAITS = [
  'Analítico', 'Criativo', 'Estratégico', 'Empático', 
  'Direto', 'Humorístico', 'Inspirador', 'Educador'
];

const CONTENT_FOCUS_OPTIONS = [
  'Tutoriais', 'Notícias', 'Tendências', 'Bastidores',
  'Dicas', 'Reviews', 'Análises', 'Entretenimento'
];

export default function AgentUnifiedSettings({ 
  context, 
  onUpdate, 
  onRunAgent,
  isRunning 
}: AgentUnifiedSettingsProps) {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [cronFrequency, setCronFrequency] = useState('6');
  const [countdown, setCountdown] = useState<string>('');
  const [showGoals, setShowGoals] = useState(false);
  
  const [config, setConfig] = useState({
    agent_name: context?.agent_name || 'Aria',
    agent_avatar_url: context?.agent_avatar_url || null,
    brand_voice: context?.brand_voice || 'Autêntico e valioso',
    personality_traits: context?.personality_traits || ['Analítico', 'Criativo'],
    content_focus: context?.content_focus || ['Notícias', 'Tendências'],
    target_audience: context?.target_audience || '',
    industry_niche: context?.industry_niche || 'Tecnologia',
    hashtag_strategy: context?.hashtag_strategy || 'moderate',
    min_hours_between_posts: context?.min_hours_between_posts || 4,
    preferred_platforms: context?.preferred_platforms || ['instagram'],
    auto_post_enabled: context?.auto_post_enabled || false,
    // Macro objectives
    goal_weekly_views: (context as any)?.goal_weekly_views || 10000,
    goal_weekly_followers: (context as any)?.goal_weekly_followers || 100,
    goal_weekly_engagement: (context as any)?.goal_weekly_engagement || 5.0,
  });

  useEffect(() => {
    if (context) {
      setConfig({
        agent_name: context.agent_name || 'Aria',
        agent_avatar_url: context.agent_avatar_url || null,
        brand_voice: context.brand_voice || 'Autêntico e valioso',
        personality_traits: context.personality_traits || ['Analítico', 'Criativo'],
        content_focus: context.content_focus || ['Notícias', 'Tendências'],
        target_audience: context.target_audience || '',
        industry_niche: context.industry_niche || 'Tecnologia',
        hashtag_strategy: context.hashtag_strategy || 'moderate',
        min_hours_between_posts: context.min_hours_between_posts || 4,
        preferred_platforms: context.preferred_platforms || ['instagram'],
        auto_post_enabled: context.auto_post_enabled || false,
        goal_weekly_views: (context as any)?.goal_weekly_views || 10000,
        goal_weekly_followers: (context as any)?.goal_weekly_followers || 100,
        goal_weekly_engagement: (context as any)?.goal_weekly_engagement || 5.0,
      });
    }
  }, [context]);

  // Calculate countdown
  useEffect(() => {
    const frequency = parseInt(cronFrequency);
    const now = new Date();
    const currentHour = now.getHours();
    const nextHour = Math.ceil(currentHour / frequency) * frequency;
    const next = setMinutes(setHours(new Date(), nextHour >= 24 ? nextHour - 24 : nextHour), 0);
    
    if (isBefore(next, now)) {
      next.setDate(next.getDate() + 1);
    }

    const interval = setInterval(() => {
      const now = new Date();
      const diff = differenceInMinutes(next, now);
      
      if (diff <= 0) {
        setCountdown('Agora');
      } else if (diff < 60) {
        setCountdown(`${diff}min`);
      } else {
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        setCountdown(`${hours}h${mins > 0 ? ` ${mins}m` : ''}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cronFrequency]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(config as any);
      toast.success('Configurações salvas!');
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const togglePlatform = (platform: string) => {
    const updated = config.preferred_platforms.includes(platform)
      ? config.preferred_platforms.filter(p => p !== platform)
      : [...config.preferred_platforms, platform];
    if (updated.length > 0) {
      setConfig(c => ({ ...c, preferred_platforms: updated }));
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

  return (
    <div className="space-y-6">
      {/* Main Automation Card */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl neural-gradient">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Rotina Automática</CardTitle>
                <CardDescription>Controle a execução do agente</CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-xs gap-1">
              <Timer className="h-3 w-3" />
              {countdown || '...'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Automation Toggle + Frequency */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">Modo Automático</span>
              </div>
              <Switch 
                checked={config.auto_post_enabled}
                onCheckedChange={(checked) => {
                  setConfig(c => ({ ...c, auto_post_enabled: checked }));
                  onUpdate({ auto_post_enabled: checked });
                }}
              />
            </div>
            
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Executar a cada</span>
              <Select value={cronFrequency} onValueChange={setCronFrequency}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRON_FREQUENCIES.map(freq => (
                    <SelectItem key={freq.value} value={freq.value}>
                      {freq.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Run Now */}
          <Button 
            onClick={onRunAgent} 
            disabled={isRunning}
            className="w-full gap-2 neural-gradient border-0"
            size="lg"
          >
            <Play className="h-4 w-4" />
            {isRunning ? 'Executando...' : 'Executar Agora'}
          </Button>

          {/* Macro Objectives */}
          <Collapsible open={showGoals} onOpenChange={setShowGoals}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-500" />
                  Objetivos Macro (Semanal)
                </span>
                {showGoals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              <p className="text-xs text-muted-foreground">
                O agente decide automaticamente quantos posts criar com base nesses objetivos. Quanto mais distante da meta, mais posts ele cria por dia.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Views Goal */}
                <div className="p-4 rounded-lg bg-muted/30 border space-y-3">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Visualizações</span>
                  </div>
                  <Input
                    type="number"
                    min={1000}
                    step={1000}
                    value={config.goal_weekly_views}
                    onChange={(e) => setConfig(c => ({ ...c, goal_weekly_views: parseInt(e.target.value) || 10000 }))}
                    className="text-center text-lg font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground text-center">alcance semanal</p>
                </div>

                {/* Followers Goal */}
                <div className="p-4 rounded-lg bg-muted/30 border space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium">Seguidores</span>
                  </div>
                  <Input
                    type="number"
                    min={10}
                    step={10}
                    value={config.goal_weekly_followers}
                    onChange={(e) => setConfig(c => ({ ...c, goal_weekly_followers: parseInt(e.target.value) || 100 }))}
                    className="text-center text-lg font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground text-center">novos por semana</p>
                </div>

                {/* Engagement Goal */}
                <div className="p-4 rounded-lg bg-muted/30 border space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Engajamento</span>
                  </div>
                  <Input
                    type="number"
                    min={0.5}
                    step={0.5}
                    max={20}
                    value={config.goal_weekly_engagement}
                    onChange={(e) => setConfig(c => ({ ...c, goal_weekly_engagement: parseFloat(e.target.value) || 5.0 }))}
                    className="text-center text-lg font-bold"
                  />
                  <p className="text-[10px] text-muted-foreground text-center">% taxa de engajamento</p>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Brain className="h-3 w-3" />
                  <span className="font-medium">Modo Inteligente</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  O agente ajusta automaticamente: se está longe das metas → até 4 posts/dia. Se já atingiu → 1 post/dia (manutenção).
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Config Tabs */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-muted">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Personalização do Agente</CardTitle>
              <CardDescription>Identidade, comportamento e estratégia</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="identity" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="identity" className="text-xs gap-1">
                <Bot className="h-3 w-3" />
                <span className="hidden sm:inline">Identidade</span>
              </TabsTrigger>
              <TabsTrigger value="content" className="text-xs gap-1">
                <Sparkles className="h-3 w-3" />
                <span className="hidden sm:inline">Conteúdo</span>
              </TabsTrigger>
              <TabsTrigger value="limits" className="text-xs gap-1">
                <Gauge className="h-3 w-3" />
                <span className="hidden sm:inline">Limites</span>
              </TabsTrigger>
            </TabsList>

            {/* IDENTITY TAB */}
            <TabsContent value="identity" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nome do Agente</Label>
                <Input
                  value={config.agent_name}
                  onChange={(e) => setConfig(c => ({ ...c, agent_name: e.target.value }))}
                  placeholder="Aria"
                />
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
                      className={`cursor-pointer ${config.personality_traits.includes(trait) ? 'neural-gradient border-0' : ''}`}
                      onClick={() => toggleTrait(trait)}
                    >
                      {trait}
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* CONTENT TAB */}
            <TabsContent value="content" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Nicho/Indústria
                </Label>
                <Input
                  value={config.industry_niche || ''}
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
                  value={config.target_audience || ''}
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
                      className={`cursor-pointer ${config.content_focus.includes(focus) ? 'bg-primary/20 text-primary border-primary/30' : ''}`}
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
                <Select 
                  value={config.hashtag_strategy} 
                  onValueChange={(v) => setConfig(c => ({ ...c, hashtag_strategy: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Mínimo (3-5)</SelectItem>
                    <SelectItem value="moderate">Moderado (5-10)</SelectItem>
                    <SelectItem value="aggressive">Agressivo (10-15)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* LIMITS TAB */}
            <TabsContent value="limits" className="space-y-4 mt-4">
              <div className="space-y-2">
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

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Intervalo mínimo entre posts (horas)
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
                <p className="text-xs text-muted-foreground">
                  O número de posts por dia é decidido automaticamente pelo agente com base nos objetivos macro.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <Separator className="my-6" />

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
        </CardContent>
      </Card>
    </div>
  );
}
