import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { 
  Calendar, 
  Play, 
  Zap, 
  ChevronDown, 
  ChevronUp, 
  Target,
  Video,
  Image,
  Newspaper,
  Loader2,
  Clock,
  Layers
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';

interface AgentRoutineConfigProps {
  context: AgentContext | null;
  onUpdate: (updates: Partial<AgentContext>) => Promise<void>;
  onRunAgent: () => void;
  isRunning: boolean;
}

interface ContentDistribution {
  videos: number;
  carousels: number;
  news: number;
  images: number;
}

// Removed: CRON_FREQUENCIES - Agent now works towards goals, not fixed intervals

// Default distribution (absolute numbers, not percentages)
const DEFAULT_DISTRIBUTION: ContentDistribution = {
  videos: 3,
  carousels: 2,
  news: 4,
  images: 5
};

export default function AgentRoutineConfig({ 
  context, 
  onUpdate, 
  onRunAgent,
  isRunning 
}: AgentRoutineConfigProps) {
  // Removed cronFrequency - agent works by goals now
  const [distribution, setDistribution] = useState<ContentDistribution>({
    videos: context?.content_distribution_videos ?? 3,
    carousels: context?.content_distribution_carousels ?? 2,
    news: context?.content_distribution_news ?? 4,
    images: context?.content_distribution_images ?? 5
  });
  const [showGoals, setShowGoals] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  const [localConfig, setLocalConfig] = useState({
    auto_post_enabled: context?.auto_post_enabled || false,
    daily_post_limit: context?.daily_post_limit || 2,
    min_hours_between_posts: context?.min_hours_between_posts || 4,
  });

  // Calculate weekly total and remaining points
  const weeklyTotal = localConfig.daily_post_limit * 7;
  const assignedTotal = distribution.videos + distribution.carousels + distribution.news + distribution.images;
  const remainingPoints = weeklyTotal - assignedTotal;

  // Sync with context
  useEffect(() => {
    if (context) {
      setLocalConfig({
        auto_post_enabled: context.auto_post_enabled || false,
        daily_post_limit: context.daily_post_limit || 2,
        min_hours_between_posts: context.min_hours_between_posts || 4,
      });
      setDistribution({
        videos: context.content_distribution_videos ?? 3,
        carousels: context.content_distribution_carousels ?? 2,
        news: context.content_distribution_news ?? 4,
        images: context.content_distribution_images ?? 5
      });
    }
  }, [context]);

  // Update single content type independently and save to DB
  const updateDistribution = async (type: keyof ContentDistribution, newValue: number) => {
    const newDistribution = { ...distribution, [type]: newValue };
    setDistribution(newDistribution);
    
    // Save to database
    await onUpdate({
      content_distribution_videos: newDistribution.videos,
      content_distribution_carousels: newDistribution.carousels,
      content_distribution_news: newDistribution.news,
      content_distribution_images: newDistribution.images
    });
  };

  // Agent now works by daily goals, not fixed intervals

  const handleToggleAuto = async (enabled: boolean) => {
    setLocalConfig(c => ({ ...c, auto_post_enabled: enabled }));
    await onUpdate({ auto_post_enabled: enabled });
  };

  const handleUpdateLimits = async () => {
    await onUpdate({
      daily_post_limit: localConfig.daily_post_limit,
      min_hours_between_posts: localConfig.min_hours_between_posts,
    });
  };

  return (
    <div className="space-y-4">
      {/* Main Automation Card */}
      <Card className="border-primary/20 overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl neural-gradient">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Rotina Automática</CardTitle>
                <CardDescription>O agente trabalha sozinho no piloto automático</CardDescription>
              </div>
            </div>
            {localConfig.auto_post_enabled && (
              <Badge variant="outline" className="font-mono text-xs gap-1 border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300">
                <Target className="h-3 w-3" />
                {localConfig.daily_post_limit}/dia
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {/* Main Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${localConfig.auto_post_enabled ? 'bg-green-500/20' : 'bg-muted'}`}>
                <Zap className={`h-5 w-5 ${localConfig.auto_post_enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <span className="font-medium">Modo Piloto Automático</span>
                <p className="text-xs text-muted-foreground">
                  {localConfig.auto_post_enabled 
                    ? 'O agente está trabalhando automaticamente' 
                    : 'Ative para o agente trabalhar sozinho'}
                </p>
              </div>
            </div>
            <Switch 
              checked={localConfig.auto_post_enabled}
              onCheckedChange={handleToggleAuto}
            />
          </div>

          {/* Goal-based info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm">
              Meta diária: <strong>{localConfig.daily_post_limit} posts</strong> · 
              Publicação automática direto nas redes
            </span>
          </div>

          {/* Run Now Button */}
          <Button 
            onClick={onRunAgent} 
            disabled={isRunning}
            className="w-full gap-2 neural-gradient border-0"
            size="lg"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isRunning ? 'Agente Executando...' : 'Executar Agente Agora'}
          </Button>

          {/* Limits Section */}
          <Collapsible open={showLimits} onOpenChange={setShowLimits}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Limites de Postagem
                </span>
                {showLimits ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 p-4 rounded-lg bg-muted/30 border"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Posts por dia</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={localConfig.daily_post_limit}
                      onChange={(e) => setLocalConfig(c => ({ 
                        ...c, 
                        daily_post_limit: parseInt(e.target.value) || 2 
                      }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Horas entre posts</Label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={localConfig.min_hours_between_posts}
                      onChange={(e) => setLocalConfig(c => ({ 
                        ...c, 
                        min_hours_between_posts: parseInt(e.target.value) || 4 
                      }))}
                      className="h-9"
                    />
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleUpdateLimits}
                  className="w-full"
                >
                  Salvar Limites
                </Button>
              </motion.div>
            </CollapsibleContent>
          </Collapsible>

          {/* Weekly Goals - Collapsible */}
          <Collapsible open={showGoals} onOpenChange={setShowGoals}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-500" />
                  Metas Semanais
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {assignedTotal}/{weeklyTotal} posts
                  </Badge>
                </span>
                {showGoals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              {/* Remaining Points Alert */}
              {remainingPoints !== 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-3 rounded-lg border flex items-center gap-2 ${
                    remainingPoints > 0 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                  }`}
                >
                  <Target className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {remainingPoints > 0 
                      ? `Você tem ${remainingPoints} ${remainingPoints === 1 ? 'ponto' : 'pontos'} para distribuir`
                      : `Você está ${Math.abs(remainingPoints)} ${Math.abs(remainingPoints) === 1 ? 'ponto' : 'pontos'} acima do limite`
                    }
                  </span>
                </motion.div>
              )}

              {/* Current Distribution Display */}
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 sm:grid-cols-5 gap-2"
              >
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-primary">{weeklyTotal}</div>
                  <div className="text-xs text-muted-foreground">Meta</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-pink-500">{distribution.videos}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Video className="h-3 w-3" /> Vídeos
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-purple-500">{distribution.carousels}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Layers className="h-3 w-3" /> Carrosséis
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-blue-500">{distribution.news}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Newspaper className="h-3 w-3" /> Notícias
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-green-500">{distribution.images}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Image className="h-3 w-3" /> Imagens
                  </div>
                </div>
              </motion.div>

              {/* Content Distribution Sliders - Independent */}
              <div className="p-4 rounded-lg bg-muted/30 border space-y-4">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Distribuir Pontos
                  <span className="text-xs text-muted-foreground font-normal">(cada slider é independente)</span>
                </Label>
                
                <div className="space-y-3">
                  {/* Videos */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1.5">
                        <Video className="h-3 w-3 text-pink-500" /> Vídeos/Reels
                      </span>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => updateDistribution('videos', Math.max(0, distribution.videos - 1))}
                        >
                          -
                        </Button>
                        <span className="text-sm font-mono text-pink-500 w-6 text-center">{distribution.videos}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => updateDistribution('videos', distribution.videos + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <Slider
                      value={[distribution.videos]}
                      onValueChange={([v]) => updateDistribution('videos', v)}
                      min={0}
                      max={weeklyTotal}
                      step={1}
                      className="[&_[role=slider]]:bg-pink-500"
                    />
                  </div>

                  {/* Carousels */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-purple-500" /> Carrosséis
                      </span>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => updateDistribution('carousels', Math.max(0, distribution.carousels - 1))}
                        >
                          -
                        </Button>
                        <span className="text-sm font-mono text-purple-500 w-6 text-center">{distribution.carousels}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => updateDistribution('carousels', distribution.carousels + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <Slider
                      value={[distribution.carousels]}
                      onValueChange={([v]) => updateDistribution('carousels', v)}
                      min={0}
                      max={weeklyTotal}
                      step={1}
                      className="[&_[role=slider]]:bg-purple-500"
                    />
                  </div>

                  {/* News */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1.5">
                        <Newspaper className="h-3 w-3 text-blue-500" /> Notícias
                      </span>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => updateDistribution('news', Math.max(0, distribution.news - 1))}
                        >
                          -
                        </Button>
                        <span className="text-sm font-mono text-blue-500 w-6 text-center">{distribution.news}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => updateDistribution('news', distribution.news + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <Slider
                      value={[distribution.news]}
                      onValueChange={([v]) => updateDistribution('news', v)}
                      min={0}
                      max={weeklyTotal}
                      step={1}
                      className="[&_[role=slider]]:bg-blue-500"
                    />
                  </div>

                  {/* Images */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1.5">
                        <Image className="h-3 w-3 text-green-500" /> Imagens
                      </span>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => updateDistribution('images', Math.max(0, distribution.images - 1))}
                        >
                          -
                        </Button>
                        <span className="text-sm font-mono text-green-500 w-6 text-center">{distribution.images}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => updateDistribution('images', distribution.images + 1)}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <Slider
                      value={[distribution.images]}
                      onValueChange={([v]) => updateDistribution('images', v)}
                      min={0}
                      max={weeklyTotal}
                      step={1}
                      className="[&_[role=slider]]:bg-green-500"
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Distribua os {weeklyTotal} posts semanais entre os tipos de conteúdo.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-border/50 bg-muted/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Como funciona?</p>
              <p>
                O agente trabalha de forma autônoma para cumprir suas metas diárias ({localConfig.daily_post_limit} posts/dia):
                analisa o mercado, cria conteúdo e publica diretamente nas redes. 
                Cada ação gera um relatório na aba "Relatórios".
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
