import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, 
  Sparkles, 
  Save,
  Loader2,
  Briefcase,
  Users,
  Hash,
  Instagram,
  Music2
} from 'lucide-react';
import { toast } from 'sonner';
import { AgentContext } from '@/hooks/useAgentContext';

interface AgentPersonalityConfigProps {
  context: AgentContext | null;
  onUpdate: (updates: Partial<AgentContext>) => Promise<void>;
}

const PERSONALITY_TRAITS = [
  'Analítico', 'Criativo', 'Estratégico', 'Empático', 
  'Direto', 'Humorístico', 'Inspirador', 'Educador'
];

const CONTENT_FOCUS_OPTIONS = [
  'Tutoriais', 'Notícias', 'Tendências', 'Bastidores',
  'Dicas', 'Reviews', 'Análises', 'Entretenimento'
];

export default function AgentPersonalityConfig({ 
  context, 
  onUpdate 
}: AgentPersonalityConfigProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState({
    agent_name: context?.agent_name || 'Aria',
    brand_voice: context?.brand_voice || 'Autêntico e valioso',
    personality_traits: context?.personality_traits || ['Analítico', 'Criativo'],
    content_focus: context?.content_focus || ['Notícias', 'Tendências'],
    target_audience: context?.target_audience || '',
    industry_niche: context?.industry_niche || 'Tecnologia',
    hashtag_strategy: context?.hashtag_strategy || 'moderate',
    preferred_platforms: context?.preferred_platforms || ['instagram'],
  });

  useEffect(() => {
    if (context) {
      setConfig({
        agent_name: context.agent_name || 'Aria',
        brand_voice: context.brand_voice || 'Autêntico e valioso',
        personality_traits: context.personality_traits || ['Analítico', 'Criativo'],
        content_focus: context.content_focus || ['Notícias', 'Tendências'],
        target_audience: context.target_audience || '',
        industry_niche: context.industry_niche || 'Tecnologia',
        hashtag_strategy: context.hashtag_strategy || 'moderate',
        preferred_platforms: context.preferred_platforms || ['instagram'],
      });
    }
  }, [context]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(config);
      toast.success('Personalidade do agente salva!');
    } catch (error) {
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
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

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-muted">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Personalidade do Agente</CardTitle>
            <CardDescription>Defina como o agente se comporta e cria conteúdo</CardDescription>
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
            <TabsTrigger value="platforms" className="text-xs gap-1">
              <Instagram className="h-3 w-3" />
              <span className="hidden sm:inline">Plataformas</span>
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
                    className={`cursor-pointer transition-all ${
                      config.personality_traits.includes(trait) 
                        ? 'neural-gradient border-0' 
                        : 'hover:border-primary/50'
                    }`}
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
                    className={`cursor-pointer transition-all ${
                      config.content_focus.includes(focus) 
                        ? 'bg-primary/20 text-primary border-primary/30' 
                        : 'hover:border-primary/50'
                    }`}
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

          {/* PLATFORMS TAB */}
          <TabsContent value="platforms" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Plataformas Ativas</Label>
              <div className="flex gap-3">
                <Button
                  variant={config.preferred_platforms.includes('instagram') ? 'default' : 'outline'}
                  className={`flex-1 gap-2 ${config.preferred_platforms.includes('instagram') ? 'neural-gradient border-0' : ''}`}
                  onClick={() => togglePlatform('instagram')}
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </Button>
                <Button
                  variant={config.preferred_platforms.includes('tiktok') ? 'default' : 'outline'}
                  className={`flex-1 gap-2 ${config.preferred_platforms.includes('tiktok') ? 'neural-gradient border-0' : ''}`}
                  onClick={() => togglePlatform('tiktok')}
                >
                  <Music2 className="h-4 w-4" />
                  TikTok
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O agente só publicará nas plataformas selecionadas
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="w-full mt-6 gap-2"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar Configurações
        </Button>
      </CardContent>
    </Card>
  );
}
