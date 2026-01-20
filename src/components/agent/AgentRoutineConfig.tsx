import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { 
  Calendar, 
  Play, 
  Timer, 
  Zap, 
  ChevronDown, 
  ChevronUp, 
  Target,
  Video,
  Image,
  Newspaper,
  Loader2,
  Clock,
  Repeat,
  Layers
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format, setHours, setMinutes, isBefore, differenceInMinutes } from 'date-fns';
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

const CRON_FREQUENCIES = [
  { value: '1', label: '1 hora', short: '1h' },
  { value: '2', label: '2 horas', short: '2h' },
  { value: '3', label: '3 horas', short: '3h' },
  { value: '4', label: '4 horas', short: '4h' },
  { value: '6', label: '6 horas', short: '6h' },
  { value: '12', label: '12 horas', short: '12h' },
  { value: '24', label: '24 horas', short: '24h' },
];

// Default distribution percentages (must sum to 100)
const DEFAULT_DISTRIBUTION: ContentDistribution = {
  videos: 20,
  carousels: 15,
  news: 30,
  images: 35
};

export default function AgentRoutineConfig({ 
  context, 
  onUpdate, 
  onRunAgent,
  isRunning 
}: AgentRoutineConfigProps) {
  const [cronFrequency, setCronFrequency] = useState('6');
  const [countdown, setCountdown] = useState<string>('');
  const [distribution, setDistribution] = useState<ContentDistribution>(DEFAULT_DISTRIBUTION);
  const [showGoals, setShowGoals] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  const [localConfig, setLocalConfig] = useState({
    auto_post_enabled: context?.auto_post_enabled || false,
    daily_post_limit: context?.daily_post_limit || 2,
    min_hours_between_posts: context?.min_hours_between_posts || 4,
  });

  // Calculate weekly goals based on daily limit and distribution
  const weeklyTotal = localConfig.daily_post_limit * 7;
  const calculatedGoals = {
    totalPosts: weeklyTotal,
    videos: Math.round(weeklyTotal * (distribution.videos / 100)),
    carousels: Math.round(weeklyTotal * (distribution.carousels / 100)),
    news: Math.round(weeklyTotal * (distribution.news / 100)),
    images: Math.round(weeklyTotal * (distribution.images / 100)),
  };

  // Sync with context
  useEffect(() => {
    if (context) {
      setLocalConfig({
        auto_post_enabled: context.auto_post_enabled || false,
        daily_post_limit: context.daily_post_limit || 2,
        min_hours_between_posts: context.min_hours_between_posts || 4,
      });
    }
  }, [context]);

  // Adjust distribution to maintain 100% total
  const adjustDistribution = (type: keyof ContentDistribution, newValue: number) => {
    const oldValue = distribution[type];
    const diff = newValue - oldValue;
    
    // Get other types
    const otherTypes = (Object.keys(distribution) as Array<keyof ContentDistribution>)
      .filter(t => t !== type);
    
    // Distribute the difference among other types proportionally
    const otherTotal = otherTypes.reduce((sum, t) => sum + distribution[t], 0);
    
    if (otherTotal === 0) return;
    
    const newDistribution = { ...distribution, [type]: newValue };
    
    otherTypes.forEach(t => {
      const proportion = distribution[t] / otherTotal;
      newDistribution[t] = Math.max(0, Math.round(distribution[t] - (diff * proportion)));
    });
    
    // Ensure total is 100
    const total = Object.values(newDistribution).reduce((a, b) => a + b, 0);
    if (total !== 100) {
      const largest = otherTypes.reduce((a, b) => 
        newDistribution[a] > newDistribution[b] ? a : b
      );
      newDistribution[largest] += (100 - total);
    }
    
    setDistribution(newDistribution);
  };

  // Calculate countdown
  useEffect(() => {
    const frequency = parseInt(cronFrequency);
    
    const updateCountdown = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const nextHour = Math.ceil((currentHour + 1) / frequency) * frequency;
      const next = setMinutes(setHours(new Date(), nextHour >= 24 ? nextHour - 24 : nextHour), 0);
      
      if (isBefore(next, now)) {
        next.setDate(next.getDate() + 1);
      }

      const diff = differenceInMinutes(next, now);
      
      if (diff <= 0) {
        setCountdown('Executando...');
      } else if (diff < 60) {
        setCountdown(`${diff}min`);
      } else {
        const hours = Math.floor(diff / 60);
        const mins = diff % 60;
        setCountdown(`${hours}h${mins > 0 ? ` ${mins}m` : ''}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, [cronFrequency]);

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
                <Timer className="h-3 w-3" />
                {countdown || '...'}
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

          {/* Frequency Selector */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
            <Repeat className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Executar a cada</span>
            <Select value={cronFrequency} onValueChange={setCronFrequency}>
              <SelectTrigger className="w-32 h-9">
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
          {/* Weekly Goals - Collapsible */}
          <Collapsible open={showGoals} onOpenChange={setShowGoals}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-green-500" />
                  Metas Semanais
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {calculatedGoals.totalPosts} posts/semana
                  </Badge>
                </span>
                {showGoals ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              {/* Calculated Goals Display */}
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 sm:grid-cols-5 gap-2"
              >
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-primary">{calculatedGoals.totalPosts}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-pink-500">{calculatedGoals.videos}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Video className="h-3 w-3" /> Vídeos
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-purple-500">{calculatedGoals.carousels}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Layers className="h-3 w-3" /> Carrosséis
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-blue-500">{calculatedGoals.news}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Newspaper className="h-3 w-3" /> Notícias
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border text-center">
                  <div className="text-2xl font-bold text-green-500">{calculatedGoals.images}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Image className="h-3 w-3" /> Imagens
                  </div>
                </div>
              </motion.div>

              {/* Content Distribution Sliders */}
              <div className="p-4 rounded-lg bg-muted/30 border space-y-4">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Distribuição de Conteúdo
                  <span className="text-xs text-muted-foreground font-normal">(ajuste a prioridade)</span>
                </Label>
                
                <div className="space-y-3">
                  {/* Videos */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1.5">
                        <Video className="h-3 w-3 text-pink-500" /> Vídeos/Reels
                      </span>
                      <span className="text-xs font-mono text-pink-500">{distribution.videos}%</span>
                    </div>
                    <Slider
                      value={[distribution.videos]}
                      onValueChange={([v]) => adjustDistribution('videos', v)}
                      min={0}
                      max={80}
                      step={5}
                      className="[&_[role=slider]]:bg-pink-500"
                    />
                  </div>

                  {/* Carousels */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-purple-500" /> Carrosséis
                      </span>
                      <span className="text-xs font-mono text-purple-500">{distribution.carousels}%</span>
                    </div>
                    <Slider
                      value={[distribution.carousels]}
                      onValueChange={([v]) => adjustDistribution('carousels', v)}
                      min={0}
                      max={80}
                      step={5}
                      className="[&_[role=slider]]:bg-purple-500"
                    />
                  </div>

                  {/* News */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1.5">
                        <Newspaper className="h-3 w-3 text-blue-500" /> Notícias
                      </span>
                      <span className="text-xs font-mono text-blue-500">{distribution.news}%</span>
                    </div>
                    <Slider
                      value={[distribution.news]}
                      onValueChange={([v]) => adjustDistribution('news', v)}
                      min={0}
                      max={80}
                      step={5}
                      className="[&_[role=slider]]:bg-blue-500"
                    />
                  </div>

                  {/* Images */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs flex items-center gap-1.5">
                        <Image className="h-3 w-3 text-green-500" /> Imagens
                      </span>
                      <span className="text-xs font-mono text-green-500">{distribution.images}%</span>
                    </div>
                    <Slider
                      value={[distribution.images]}
                      onValueChange={([v]) => adjustDistribution('images', v)}
                      min={0}
                      max={80}
                      step={5}
                      className="[&_[role=slider]]:bg-green-500"
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Mova os sliders para priorizar tipos de conteúdo. O total sempre será 100%.
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
                O agente executa automaticamente a cada <strong>{CRON_FREQUENCIES.find(f => f.value === cronFrequency)?.label}</strong>:
                analisa métricas, busca notícias, cria conteúdo e publica. 
                Cada execução gera um relatório na aba "Relatórios".
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
