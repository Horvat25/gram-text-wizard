import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { 
  Settings, 
  Save,
  Instagram,
  Music2,
  Clock,
  Gauge
} from 'lucide-react';
import { AgentContext } from '@/hooks/useAgentContext';
import { toast } from 'sonner';

interface AgentSettingsProps {
  context: AgentContext | null;
  onUpdate: (updates: Partial<AgentContext>) => Promise<void>;
}

export default function AgentSettings({ context, onUpdate }: AgentSettingsProps) {
  const [settings, setSettings] = useState({
    daily_post_limit: context?.daily_post_limit || 2,
    min_hours_between_posts: context?.min_hours_between_posts || 4,
    brand_voice: context?.brand_voice || 'profissional e envolvente',
    preferred_platforms: context?.preferred_platforms || ['instagram']
  });

  useEffect(() => {
    if (context) {
      setSettings({
        daily_post_limit: context.daily_post_limit || 2,
        min_hours_between_posts: context.min_hours_between_posts || 4,
        brand_voice: context.brand_voice || 'profissional e envolvente',
        preferred_platforms: context.preferred_platforms || ['instagram']
      });
    }
  }, [context]);

  const handleSave = async () => {
    await onUpdate(settings);
  };

  const togglePlatform = (platform: string) => {
    const current = settings.preferred_platforms;
    const updated = current.includes(platform)
      ? current.filter(p => p !== platform)
      : [...current, platform];
    
    // Ensure at least one platform is selected
    if (updated.length > 0) {
      setSettings(s => ({ ...s, preferred_platforms: updated }));
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-lg bg-muted">
            <Settings className="h-4 w-4" />
          </div>
          Configurações do Agente
        </CardTitle>
        <CardDescription>
          Personalize como o agente toma decisões
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Brand Voice */}
        <div className="space-y-2">
          <Label htmlFor="brand-voice" className="text-sm font-medium">
            Tom de Voz da Marca
          </Label>
          <Textarea
            id="brand-voice"
            value={settings.brand_voice}
            onChange={(e) => setSettings(s => ({ ...s, brand_voice: e.target.value }))}
            placeholder="Ex: profissional, amigável, informativo..."
            className="resize-none h-20"
          />
          <p className="text-xs text-muted-foreground">
            Como o agente deve se comunicar nas legendas
          </p>
        </div>

        <Separator />

        {/* Posting Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="daily-limit" className="text-sm font-medium flex items-center gap-2">
              <Gauge className="h-4 w-4" />
              Posts por Dia
            </Label>
            <Input
              id="daily-limit"
              type="number"
              min={1}
              max={10}
              value={settings.daily_post_limit}
              onChange={(e) => setSettings(s => ({ 
                ...s, 
                daily_post_limit: parseInt(e.target.value) || 2 
              }))}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="min-hours" className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Intervalo (horas)
            </Label>
            <Input
              id="min-hours"
              type="number"
              min={1}
              max={24}
              value={settings.min_hours_between_posts}
              onChange={(e) => setSettings(s => ({ 
                ...s, 
                min_hours_between_posts: parseInt(e.target.value) || 4 
              }))}
            />
          </div>
        </div>

        <Separator />

        {/* Platforms */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Plataformas</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={settings.preferred_platforms.includes('instagram') ? 'default' : 'outline'}
              size="sm"
              onClick={() => togglePlatform('instagram')}
              className={settings.preferred_platforms.includes('instagram') 
                ? 'neural-gradient border-0' 
                : ''
              }
            >
              <Instagram className="h-4 w-4 mr-2" />
              Instagram
            </Button>
            <Button
              type="button"
              variant={settings.preferred_platforms.includes('tiktok') ? 'default' : 'outline'}
              size="sm"
              onClick={() => togglePlatform('tiktok')}
              className={settings.preferred_platforms.includes('tiktok') 
                ? 'neural-gradient border-0' 
                : ''
              }
            >
              <Music2 className="h-4 w-4 mr-2" />
              TikTok
            </Button>
          </div>
        </div>

        <Separator />

        <Button onClick={handleSave} className="w-full neural-gradient border-0">
          <Save className="h-4 w-4 mr-2" />
          Salvar Configurações
        </Button>
      </CardContent>
    </Card>
  );
}
