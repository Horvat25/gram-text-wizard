import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { 
  Target, TrendingUp, Users, Eye, Brain, Lightbulb,
  Video, Newspaper, Image as ImageIcon, LayoutGrid,
  Zap, ChevronRight, Sparkles
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';
import { cn } from '@/lib/utils';

interface AgentGrowthDashboardProps {
  context: AgentContext | null;
  onUpdate?: (updates: Partial<AgentContext>) => Promise<void>;
}

const GOAL_OPTIONS = [
  { value: 'growth', label: 'Crescimento de seguidores', icon: Users, color: 'text-purple-500' },
  { value: 'reach', label: 'Alcance máximo', icon: Eye, color: 'text-blue-500' },
  { value: 'authority', label: 'Autoridade no nicho', icon: Brain, color: 'text-amber-500' },
  { value: 'conversion', label: 'Cliques / conversão', icon: TrendingUp, color: 'text-emerald-500' },
];

export default function AgentGrowthDashboard({ context, onUpdate }: AgentGrowthDashboardProps) {
  const [isAutoStrategy, setIsAutoStrategy] = useState(true);

  const goalType = context?.goal_type || 'macro';
  const weeklyViews = context?.current_weekly_views || 0;
  const goalViews = context?.goal_weekly_views || 10000;
  const weeklyFollowers = context?.current_weekly_followers || 0;
  const goalFollowers = context?.goal_weekly_followers || 100;
  const weeklyEngagement = context?.current_weekly_engagement || 0;
  const goalEngagement = context?.goal_weekly_engagement || 5;

  const viewsProgress = Math.min((weeklyViews / goalViews) * 100, 100);
  const followersProgress = Math.min((weeklyFollowers / goalFollowers) * 100, 100);
  const engagementProgress = Math.min((weeklyEngagement / goalEngagement) * 100, 100);

  // Calculate strategy distribution from context
  const totalContent = (context?.content_distribution_videos || 3) + 
    (context?.content_distribution_carousels || 2) + 
    (context?.content_distribution_news || 4) + 
    (context?.content_distribution_images || 5);
  
  const reelsPercent = Math.round(((context?.content_distribution_videos || 3) / totalContent) * 100);
  const carouselPercent = Math.round(((context?.content_distribution_carousels || 2) / totalContent) * 100);
  const newsPercent = Math.round(((context?.content_distribution_news || 4) / totalContent) * 100);
  const imagesPercent = Math.round(((context?.content_distribution_images || 5) / totalContent) * 100);

  // Generate strategy reasoning based on patterns
  const getStrategyReason = () => {
    if (context?.success_patterns && context.success_patterns.length > 0) {
      return context.success_patterns[0];
    }
    if (reelsPercent >= 40) return 'Reels estão gerando maior alcance orgânico no momento.';
    if (newsPercent >= 40) return 'Conteúdo informativo está gerando mais salvamentos.';
    return 'Distribuição balanceada para maximizar diferentes métricas.';
  };

  // Agent insights
  const insights = context?.success_patterns?.slice(0, 3) || [];
  const topTopics = context?.top_topics?.slice(0, 3) || [];

  return (
    <div className="space-y-4 pb-4">
      {/* 1. Macro Goal */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-primary/20 overflow-hidden">
          <div className="h-1 w-full neural-gradient" />
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              Objetivo do Agente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {GOAL_OPTIONS.map((goal) => (
                <button
                  key={goal.value}
                  onClick={() => onUpdate?.({ goal_type: goal.value } as any)}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-lg border text-left text-xs transition-all",
                    goalType === goal.value 
                      ? "border-primary/50 bg-primary/10 shadow-sm" 
                      : "border-border/50 bg-card/50 hover:border-primary/30"
                  )}
                >
                  <goal.icon className={cn("h-3.5 w-3.5 shrink-0", goal.color)} />
                  <span className="font-medium">{goal.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 2. Growth Progress */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Progresso Semanal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Views */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Eye className="h-3 w-3 text-blue-500" /> Alcance
                </span>
                <span className="font-mono font-bold">
                  {weeklyViews.toLocaleString()} <span className="text-muted-foreground font-normal">/ {goalViews.toLocaleString()}</span>
                </span>
              </div>
              <Progress value={viewsProgress} className="h-2" />
            </div>

            {/* Followers */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3 w-3 text-purple-500" /> Seguidores
                </span>
                <span className="font-mono font-bold">
                  +{weeklyFollowers} <span className="text-muted-foreground font-normal">/ +{goalFollowers}</span>
                </span>
              </div>
              <Progress value={followersProgress} className="h-2" />
            </div>

            {/* Engagement */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3 w-3 text-emerald-500" /> Engajamento
                </span>
                <span className="font-mono font-bold">
                  {weeklyEngagement.toFixed(1)}% <span className="text-muted-foreground font-normal">/ {goalEngagement}%</span>
                </span>
              </div>
              <Progress value={engagementProgress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* 3. Current Strategy */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-amber-500" />
                Estratégia Atual
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {isAutoStrategy ? 'Auto' : 'Manual'}
                </span>
                <Switch 
                  checked={isAutoStrategy} 
                  onCheckedChange={setIsAutoStrategy}
                  className="scale-75"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Distribution bars */}
            <div className="space-y-2">
              <StrategyBar icon={Video} label="Reels" percent={reelsPercent} color="bg-cyan-500" count={context?.content_distribution_videos || 3} />
              <StrategyBar icon={LayoutGrid} label="Carrossel" percent={carouselPercent} color="bg-purple-500" count={context?.content_distribution_carousels || 2} />
              <StrategyBar icon={Newspaper} label="Notícias" percent={newsPercent} color="bg-amber-500" count={context?.content_distribution_news || 4} />
              <StrategyBar icon={ImageIcon} label="Imagens" percent={imagesPercent} color="bg-pink-500" count={context?.content_distribution_images || 5} />
            </div>

            {/* Strategy reasoning */}
            <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
                {getStrategyReason()}
              </p>
            </div>

            {isAutoStrategy && (
              <p className="text-[10px] text-center text-muted-foreground/70">
                Definido automaticamente pelo agente com base no desempenho
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* 4. Agent Insights */}
      {(insights.length > 0 || topTopics.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="border-border/50">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                Insights do Agente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {insights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
                  <Zap className="h-3 w-3 text-yellow-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground/80">{insight}</p>
                </div>
              ))}
              {topTopics.length > 0 && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                  <TrendingUp className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <p className="text-xs text-foreground/80">
                    Tópicos fortes: <strong>{topTopics.join(', ')}</strong>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function StrategyBar({ icon: Icon, label, percent, color, count }: {
  icon: any; label: string; percent: number; color: string; count: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right text-muted-foreground">{percent}%</span>
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">{count}/sem</Badge>
    </div>
  );
}
