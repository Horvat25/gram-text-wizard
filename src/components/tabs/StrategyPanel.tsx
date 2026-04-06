import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Brain, Video, Newspaper, LayoutGrid, Megaphone,
  Image as ImageIcon, Sparkles, Plus, Minus as MinusIcon,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { cn } from '@/lib/utils';

interface StrategyPanelProps {
  onDistributionChange?: () => void;
}

export default function StrategyPanel({ onDistributionChange }: StrategyPanelProps) {
  const { currentWorkspace } = useWorkspace();
  const [isAutoStrategy, setIsAutoStrategy] = useState(true);
  const [localDist, setLocalDist] = useState({
    videos: 3,
    carousels: 3,
    news: 8,
    news_videos: 2,
    images: 7,
    marketing: 2,
  });
  const [successPatterns, setSuccessPatterns] = useState<string[]>([]);

  useEffect(() => {
    if (!currentWorkspace?.id) return;

    const load = async () => {
      const { data } = await supabase
        .from('agent_context')
        .select('content_distribution_images, content_distribution_carousels, content_distribution_news, content_distribution_videos, content_distribution_news_video, content_distribution_marketing, success_patterns')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      if (data) {
        setLocalDist({
          videos: data.content_distribution_videos || 3,
          carousels: data.content_distribution_carousels || 3,
          news: data.content_distribution_news || 8,
          news_videos: data.content_distribution_news_video || 2,
          images: data.content_distribution_images || 7,
          marketing: (data as any).content_distribution_marketing || 2,
        });
        setSuccessPatterns(data.success_patterns || []);
      }
    };

    load();
  }, [currentWorkspace?.id]);

  const handleDistChange = async (type: keyof typeof localDist, delta: number) => {
    if (!currentWorkspace?.id) return;
    const newVal = Math.max(0, localDist[type] + delta);
    const newDist = { ...localDist, [type]: newVal };
    setLocalDist(newDist);

    const fieldMap: Record<string, string> = {
      videos: 'content_distribution_videos',
      carousels: 'content_distribution_carousels',
      news: 'content_distribution_news',
      news_videos: 'content_distribution_news_video',
      images: 'content_distribution_images',
      marketing: 'content_distribution_marketing',
    };

    await supabase
      .from('agent_context')
      .update({ [fieldMap[type]]: newVal } as any)
      .eq('workspace_id', currentWorkspace.id);

    onDistributionChange?.();
  };

  const totalContent = localDist.videos + localDist.news_videos + localDist.carousels + localDist.news + localDist.images + localDist.marketing;
  const getPercent = (val: number) => totalContent > 0 ? Math.round((val / totalContent) * 100) : 0;

  const getStrategyReason = () => {
    if (successPatterns.length > 0) return successPatterns[0];
    const reelsPercent = getPercent(localDist.videos);
    const newsPercent = getPercent(localDist.news);
    if (reelsPercent >= 40) return 'Reels estão gerando maior alcance orgânico no momento.';
    if (newsPercent >= 40) return 'Conteúdo informativo está gerando mais salvamentos.';
    return 'Distribuição equilibrada para maximizar engajamento geral.';
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-amber-500" />
            Estratégia Atual
            <Badge variant="secondary" className="text-[10px]">{totalContent}/sem</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{isAutoStrategy ? 'Auto' : 'Manual'}</span>
            <Switch checked={isAutoStrategy} onCheckedChange={setIsAutoStrategy} className="scale-75" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <StrategyBarEditable icon={Video} label="Reels Criativos" percent={getPercent(localDist.videos)} color="bg-cyan-500" count={localDist.videos} onIncrement={() => handleDistChange('videos', 1)} onDecrement={() => handleDistChange('videos', -1)} disabled={isAutoStrategy} />
          <StrategyBarEditable icon={Newspaper} label="Reels Notícia" percent={getPercent(localDist.news_videos)} color="bg-orange-500" count={localDist.news_videos} onIncrement={() => handleDistChange('news_videos', 1)} onDecrement={() => handleDistChange('news_videos', -1)} disabled={isAutoStrategy} />
          <StrategyBarEditable icon={LayoutGrid} label="Carrossel" percent={getPercent(localDist.carousels)} color="bg-purple-500" count={localDist.carousels} onIncrement={() => handleDistChange('carousels', 1)} onDecrement={() => handleDistChange('carousels', -1)} disabled={isAutoStrategy} />
          <StrategyBarEditable icon={Newspaper} label="Notícias (Imagem)" percent={getPercent(localDist.news)} color="bg-amber-500" count={localDist.news} onIncrement={() => handleDistChange('news', 1)} onDecrement={() => handleDistChange('news', -1)} disabled={isAutoStrategy} />
          <StrategyBarEditable icon={ImageIcon} label="Imagens" percent={getPercent(localDist.images)} color="bg-pink-500" count={localDist.images} onIncrement={() => handleDistChange('images', 1)} onDecrement={() => handleDistChange('images', -1)} disabled={isAutoStrategy} />
          <StrategyBarEditable icon={Megaphone} label="Marketing" percent={getPercent(localDist.marketing)} color="bg-emerald-500" count={localDist.marketing} onIncrement={() => handleDistChange('marketing', 1)} onDecrement={() => handleDistChange('marketing', -1)} disabled={isAutoStrategy} />
        </div>
        <div className="p-2.5 rounded-lg bg-muted/50 border border-border/50">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
            {getStrategyReason()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StrategyBarEditable({ icon: Icon, label, percent, color, count, onIncrement, onDecrement, disabled }: {
  icon: any; label: string; percent: number; color: string; count: number;
  onIncrement: () => void; onDecrement: () => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-[11px] sm:text-xs w-14 sm:w-16 shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden min-w-0">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[10px] sm:text-xs font-mono w-7 sm:w-8 text-right text-muted-foreground shrink-0">{percent}%</span>
      <div className="flex items-center gap-0 shrink-0">
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onDecrement} disabled={disabled || count <= 0}>
          <MinusIcon className="h-3 w-3" />
        </Button>
        <span className="text-xs font-mono w-4 text-center font-bold">{count}</span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onIncrement} disabled={disabled}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
