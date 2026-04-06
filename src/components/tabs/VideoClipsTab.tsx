import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Film, 
  Loader2, 
  Trash2, 
  CalendarDays, 
  Play, 
  RefreshCw,
  Sparkles,
  ExternalLink,
  Clock,
  Eye,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ClipPost {
  id: string;
  caption: string;
  status: string;
  image_url: string | null;
  video_url: string | null;
  hashtags: string[] | null;
  created_at: string;
  scheduled_for: string | null;
  overlay_metadata: any;
}

export default function VideoClipsTab() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [clips, setClips] = useState<ClipPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (user && currentWorkspace) {
      loadClips();
    }
  }, [user, currentWorkspace]);

  const loadClips = async () => {
    if (!currentWorkspace) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('post_type', 'video_curated')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setClips((data as ClipPost[]) || []);
    } catch (e) {
      console.error('Error loading clips:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const generateClips = async () => {
    if (!user || !currentWorkspace) return;
    setIsGenerating(true);
    toast.info('Buscando vídeo e gerando 5 cortes diferentes...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-batch-clips', {
        body: {
          workspace_id: currentWorkspace.id,
          user_id: user.id,
          clips_count: 5,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${data.clips_created} cortes criados de "${data.source_video?.title}"`);
      await loadClips();
    } catch (e: any) {
      console.error('Error generating clips:', e);
      toast.error(e.message || 'Erro ao gerar cortes');
    } finally {
      setIsGenerating(false);
    }
  };

  const scheduleClip = async (clipId: string) => {
    try {
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 1);

      const { error } = await supabase
        .from('posts')
        .update({
          status: 'scheduled',
          scheduled_for: scheduledTime.toISOString(),
        })
        .eq('id', clipId);

      if (error) throw error;
      toast.success('Agendado para daqui 1 hora');
      await loadClips();
    } catch (e: any) {
      toast.error('Erro ao agendar');
    }
  };

  const deleteClip = async (clipId: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', clipId);

      if (error) throw error;
      toast.success('Clip removido');
      setClips(prev => prev.filter(c => c.id !== clipId));
    } catch (e: any) {
      toast.error('Erro ao deletar');
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      draft: { label: 'Rascunho', variant: 'secondary' },
      scheduled: { label: 'Agendado', variant: 'default' },
      published: { label: 'Publicado', variant: 'outline' },
      render_pending: { label: 'Renderizando', variant: 'secondary' },
      render_failed: { label: 'Erro', variant: 'destructive' },
    };
    const info = map[status] || { label: status, variant: 'secondary' as const };
    return <Badge variant={info.variant} className="text-[10px]">{info.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-1.5">
            <Film className="h-4 w-4 text-primary" />
            Vídeo Clips
          </h2>
          <p className="text-xs text-muted-foreground">
            Cortes automáticos de vídeos do YouTube
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={loadClips}
            disabled={isLoading}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs neural-gradient border-0"
            onClick={generateClips}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 mr-1" />
            )}
            Gerar 5 Clips
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && clips.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Film className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">Nenhum clip gerado ainda</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Clique em "Gerar 5 Clips" para criar cortes automáticos
            </p>
            <Button
              size="sm"
              className="neural-gradient border-0"
              onClick={generateClips}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1" />
              )}
              Gerar Clips Agora
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generating state */}
      {isGenerating && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Gerando clips...</p>
              <p className="text-xs text-muted-foreground">
                Buscando vídeo, criando 5 ângulos diferentes e preparando narração
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clips list */}
      {!isLoading && clips.length > 0 && (
        <div className="space-y-3">
          {/* Group by source video */}
          {clips.map((clip) => {
            const meta = clip.overlay_metadata as any;
            const sourceTitle = meta?.source_video?.title || 'Vídeo';
            const angle = meta?.angle || '';
            const headline = meta?.headline || '';
            const clipIndex = meta?.clip_index;
            const totalClips = meta?.total_clips;

            return (
              <Card key={clip.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex gap-3 p-3">
                    {/* Thumbnail */}
                    <div className="shrink-0 w-20 h-28 rounded-md overflow-hidden bg-muted relative">
                      {clip.image_url ? (
                        <img
                          src={clip.image_url}
                          alt={headline}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                      {clip.video_url && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="h-6 w-6 text-white" />
                        </div>
                      )}
                      {clipIndex && (
                        <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1 rounded">
                          {clipIndex}/{totalClips}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{headline || 'Clip'}</p>
                          {angle && (
                            <p className="text-[10px] text-muted-foreground">
                              Ângulo: {angle}
                            </p>
                          )}
                        </div>
                        {getStatusBadge(clip.status)}
                      </div>

                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        {clip.caption?.substring(0, 120)}...
                      </p>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {format(new Date(clip.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        {clip.scheduled_for && (
                          <span className="flex items-center gap-0.5 text-primary">
                            <CalendarDays className="h-2.5 w-2.5" />
                            {format(new Date(clip.scheduled_for), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>

                      {/* Source */}
                      {meta?.source_video?.youtube_url && (
                        <a
                          href={meta.source_video.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 truncate"
                        >
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{sourceTitle}</span>
                        </a>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 pt-1">
                        {clip.status === 'draft' && (
                          <Button
                            variant="default"
                            size="sm"
                            className="h-6 text-[10px] px-2 neural-gradient border-0"
                            onClick={() => scheduleClip(clip.id)}
                          >
                            <CalendarDays className="h-2.5 w-2.5 mr-1" />
                            Agendar
                          </Button>
                        )}
                        {clip.video_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => window.open(clip.video_url!, '_blank')}
                          >
                            <Eye className="h-2.5 w-2.5 mr-1" />
                            Ver
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                          onClick={() => deleteClip(clip.id)}
                        >
                          <Trash2 className="h-2.5 w-2.5 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
