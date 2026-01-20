import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  Loader2,
  Play,
  Timer,
  Zap,
  Calendar,
  Video,
  Image,
  Newspaper,
  ChevronDown,
  ChevronUp,
  Settings2,
  Trash2,
  Users,
  Briefcase
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format, setHours, setMinutes, isBefore, differenceInMinutes } from 'date-fns';

interface AgentUnifiedSettingsSheetProps {
  trigger?: React.ReactNode;
  onConfigChange?: (config: { agent_name: string; agent_avatar_url: string | null }) => void;
  onClearChat?: () => void;
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

export default function AgentUnifiedSettingsSheet({ 
  trigger, 
  onConfigChange,
  onClearChat 
}: AgentUnifiedSettingsSheetProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [cronFrequency, setCronFrequency] = useState('6');
  const [countdown, setCountdown] = useState<string>('');
  const [goals, setGoals] = useState<WeeklyGoals>(DEFAULT_GOALS);
  const [showGoals, setShowGoals] = useState(false);
  
  // Config state
  const [config, setConfig] = useState({
    agent_name: 'Aria',
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
  });

  // Load config when opened
  useEffect(() => {
    if (user && isOpen) {
      loadConfig();
    }
  }, [user, isOpen]);

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
          agent_name: data.agent_name || 'Aria',
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
        personality_traits: config.personality_traits,
        content_focus: config.content_focus,
        target_audience: config.target_audience,
        industry_niche: config.industry_niche,
        hashtag_strategy: config.hashtag_strategy,
        daily_post_limit: config.daily_post_limit,
        min_hours_between_posts: config.min_hours_between_posts,
        preferred_platforms: config.preferred_platforms,
        auto_post_enabled: config.auto_post_enabled,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        await supabase
          .from('agent_context')
          .update(updateData)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('agent_context')
          .insert(updateData);
      }

      onConfigChange?.({
        agent_name: config.agent_name,
        agent_avatar_url: config.agent_avatar_url
      });
      
      toast.success('Configurações salvas!');
    } catch (error) {
      console.error('Error saving config:', error);
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

  const handleClearChat = () => {
    onClearChat?.();
    toast.success('Histórico do chat limpo!');
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-hidden p-0">
        <SheetHeader className="p-6 pb-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl neural-gradient">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <SheetTitle>Configurações do Agente</SheetTitle>
              <p className="text-sm text-muted-foreground">Rotina, personalidade e estratégia</p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Routine Section */}
              <div className="space-y-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <span className="font-medium">Rotina Automática</span>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs gap-1">
                    <Timer className="h-3 w-3" />
                    {countdown || '...'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Auto</span>
                    </div>
                    <Switch 
                      checked={config.auto_post_enabled}
                      onCheckedChange={(checked) => setConfig(c => ({ ...c, auto_post_enabled: checked }))}
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-background/50 border">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    <Select value={cronFrequency} onValueChange={setCronFrequency}>
                      <SelectTrigger className="h-7 w-16 text-xs">
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

                {/* Weekly Goals - Collapsible */}
                <Collapsible open={showGoals} onOpenChange={setShowGoals}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
                      <span className="flex items-center gap-2 text-xs">
                        <Target className="h-3 w-3 text-green-500" />
                        Metas Semanais
                      </span>
                      {showGoals ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="grid grid-cols-5 gap-1">
                      <div className="p-2 rounded-lg bg-background/50 border text-center">
                        <div className="text-lg font-bold text-primary">{goals.totalPosts}</div>
                        <div className="text-[10px] text-muted-foreground">Total</div>
                      </div>
                      <div className="p-2 rounded-lg bg-background/50 border text-center">
                        <div className="text-lg font-bold text-pink-500">{goals.videos}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Video className="h-2 w-2" />
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-background/50 border text-center">
                        <div className="text-lg font-bold text-purple-500">{goals.carousels}</div>
                        <div className="text-[10px] text-muted-foreground">Carr.</div>
                      </div>
                      <div className="p-2 rounded-lg bg-background/50 border text-center">
                        <div className="text-lg font-bold text-blue-500">{goals.news}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Newspaper className="h-2 w-2" />
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-background/50 border text-center">
                        <div className="text-lg font-bold text-green-500">{goals.images}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                          <Image className="h-2 w-2" />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Config Tabs */}
              <Tabs defaultValue="identity" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="identity" className="text-xs gap-1">
                    <Bot className="h-3 w-3" />
                    Identidade
                  </TabsTrigger>
                  <TabsTrigger value="content" className="text-xs gap-1">
                    <Sparkles className="h-3 w-3" />
                    Conteúdo
                  </TabsTrigger>
                  <TabsTrigger value="limits" className="text-xs gap-1">
                    <Gauge className="h-3 w-3" />
                    Limites
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
                      className="resize-none h-16"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Traços de Personalidade</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {PERSONALITY_TRAITS.map(trait => (
                        <Badge
                          key={trait}
                          variant={config.personality_traits.includes(trait) ? 'default' : 'outline'}
                          className={`cursor-pointer text-xs ${config.personality_traits.includes(trait) ? 'neural-gradient border-0' : ''}`}
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
                    <Label className="flex items-center gap-2 text-sm">
                      <Briefcase className="h-3 w-3" />
                      Nicho/Indústria
                    </Label>
                    <Input
                      value={config.industry_niche || ''}
                      onChange={(e) => setConfig(c => ({ ...c, industry_niche: e.target.value }))}
                      placeholder="Tecnologia, IA, Inovação..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Users className="h-3 w-3" />
                      Público-Alvo
                    </Label>
                    <Input
                      value={config.target_audience || ''}
                      onChange={(e) => setConfig(c => ({ ...c, target_audience: e.target.value }))}
                      placeholder="Profissionais de TI..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Foco de Conteúdo</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {CONTENT_FOCUS_OPTIONS.map(focus => (
                        <Badge
                          key={focus}
                          variant={config.content_focus.includes(focus) ? 'default' : 'outline'}
                          className={`cursor-pointer text-xs ${config.content_focus.includes(focus) ? 'bg-primary/20 text-primary border-primary/30' : ''}`}
                          onClick={() => toggleFocus(focus)}
                        >
                          {focus}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Hash className="h-3 w-3" />
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
                        <Instagram className="h-4 w-4 mr-1" />
                        Instagram
                      </Button>
                      <Button
                        variant={config.preferred_platforms.includes('tiktok') ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => togglePlatform('tiktok')}
                        className={config.preferred_platforms.includes('tiktok') ? 'neural-gradient border-0' : ''}
                      >
                        <Music2 className="h-4 w-4 mr-1" />
                        TikTok
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm">
                        <Gauge className="h-3 w-3" />
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
                      <Label className="flex items-center gap-2 text-sm">
                        <Clock className="h-3 w-3" />
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

              <Separator />

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

              {/* Clear Chat Button */}
              <Button 
                variant="outline" 
                onClick={handleClearChat}
                className="w-full text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Histórico do Chat
              </Button>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
