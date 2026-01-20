import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Settings, 
  Save,
  Instagram,
  Music2,
  Clock,
  Gauge,
  Bot,
  Sparkles,
  Target,
  Hash,
  Ban,
  Upload,
  Brain,
  Users,
  Briefcase,
  Loader2,
  Check,
  X,
  Play,
  Timer,
  Zap,
  Calendar,
  Video,
  Image,
  Newspaper,
  ChevronDown,
  ChevronUp,
  Settings2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { format, setHours, setMinutes, isBefore, differenceInMinutes } from 'date-fns';
import { AgentContext } from '@/hooks/useAgentContext';

interface AgentUnifiedSettingsProps {
  context: AgentContext | null;
  onUpdate: (updates: Partial<AgentContext>) => Promise<void>;
  onRunAgent: () => void;
  isRunning: boolean;
}

interface WeeklyGoals {
  totalPosts: number;
  videos: number;
  carousels: number;
  news: number;
  images: number;
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

const DEFAULT_GOALS: WeeklyGoals = {
  totalPosts: 14,
  videos: 3,
  carousels: 2,
  news: 4,
  images: 5
};

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
  const [goals, setGoals] = useState<WeeklyGoals>(DEFAULT_GOALS);
  const [showGoals, setShowGoals] = useState(false);
  
  // Config state
  const [config, setConfig] = useState({
    agent_name: context?.agent_name || 'Aria',
    agent_avatar_url: context?.agent_avatar_url || null,
    brand_voice: context?.brand_voice || 'Autêntico e valioso',
    personality_traits: context?.personality_traits || ['Analítico', 'Criativo'],
    content_focus: context?.content_focus || ['Notícias', 'Tendências'],
    target_audience: context?.target_audience || '',
    industry_niche: context?.industry_niche || 'Tecnologia',
    hashtag_strategy: context?.hashtag_strategy || 'moderate',
    daily_post_limit: context?.daily_post_limit || 2,
    min_hours_between_posts: context?.min_hours_between_posts || 4,
    preferred_platforms: context?.preferred_platforms || ['instagram'],
    auto_post_enabled: context?.auto_post_enabled || false,
  });

  // Update local state when context changes
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
        daily_post_limit: context.daily_post_limit || 2,
        min_hours_between_posts: context.min_hours_between_posts || 4,
        preferred_platforms: context.preferred_platforms || ['instagram'],
        auto_post_enabled: context.auto_post_enabled || false,
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
      await onUpdate(config);
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

          {/* Weekly Goals - Collapsible */}
          <Collapsible open={showGoals} onOpenChange={setShowGoals}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-500" />
                  Metas Semanais
                </span>
                {showGoals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-primary">{goals.totalPosts}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-pink-500">{goals.videos}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Video className="h-3 w-3" /> Vídeos
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-purple-500">{goals.carousels}</div>
                  <div className="text-xs text-muted-foreground">Carrosséis</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-blue-500">{goals.news}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Newspaper className="h-3 w-3" /> Notícias
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-green-500">{goals.images}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Image className="h-3 w-3" /> Imagens
                  </div>
                </div>
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
              {/* Agent Name */}
              <div className="space-y-2">
                <Label>Nome do Agente</Label>
                <Input
                  value={config.agent_name}
                  onChange={(e) => setConfig(c => ({ ...c, agent_name: e.target.value }))}
                  placeholder="Aria"
                />
              </div>

              {/* Brand Voice */}
              <div className="space-y-2">
                <Label>Tom de Voz</Label>
                <Textarea
                  value={config.brand_voice}
                  onChange={(e) => setConfig(c => ({ ...c, brand_voice: e.target.value }))}
                  placeholder="Como o agente deve se comunicar..."
                  className="resize-none h-20"
                />
              </div>

              {/* Personality Traits */}
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
              {/* Niche */}
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

              {/* Target Audience */}
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

              {/* Content Focus */}
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

              {/* Hashtag Strategy */}
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
              {/* Platforms */}
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

              {/* Posting Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Gauge className="h-4 w-4" />
                    Posts/Dia
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
                    Intervalo (h)
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
            </TabsContent>
          </Tabs>

          <Separator className="my-6" />

          {/* Save Button */}
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
