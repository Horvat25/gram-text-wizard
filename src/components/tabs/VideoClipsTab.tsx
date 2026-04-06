import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
  ChevronDown,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

const PRESET_SOURCES = [
  {
    value: 'realidade-impressionante',
    label: 'Realidade Impressionante',
    query: '@REALIDADEIMPRESSIONANTE',
  },
  {
    value: 'custom',
    label: 'Outro perfil',
    query: '',
  },
] as const;

export default function VideoClipsTab() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [clips, setClips] = useState<ClipPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [renderingClipId, setRenderingClipId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('realidade-impressionante');
  const [customSource, setCustomSource] = useState('');
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [lastGeneratedSource, setLastGeneratedSource] = useState<{
    title: string;
    channel: string;
    youtube_url?: string;
  } | null>(null);

  const activeSource = useMemo(() => {
    if (selectedSource === 'custom') {
      return customSource.trim();
    }

    return PRESET_SOURCES.find((source) => source.value === selectedSource)?.query ?? '';
  }, [customSource, selectedSource]);

  const activeSourceLabel = useMemo(() => {
    if (selectedSource === 'custom') {
      return customSource.trim() || 'Perfil customizado';
    }

    return PRESET_SOURCES.find((source) => source.value === selectedSource)?.label ?? 'Fonte';
  }, [customSource, selectedSource]);

  const clipGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      title: string;
      channel: string;
      youtubeUrl: string | null;
      clips: ClipPost[];
    }>();

    for (const clip of clips) {
      const meta = (clip.overlay_metadata as any) || {};
      const groupKey = meta?.source_video?.video_id || clip.id;
      const current = groups.get(groupKey);

      if (current) {
        current.clips.push(clip);
        continue;
      }

      groups.set(groupKey, {
        key: groupKey,
        title: meta?.source_video?.title || 'Vídeo fonte',
        channel: meta?.source_video?.channel || meta?.source_label || 'Fonte',
        youtubeUrl: meta?.source_video?.youtube_url || null,
        clips: [clip],
      });
    }

    return Array.from(groups.values());
  }, [clips]);

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

      const filtered = ((data as ClipPost[]) || []).filter((post) => {
        const meta = (post.overlay_metadata as any) || {};
        return meta?.type === 'curated_clip' || meta?.source_video || meta?.narration;
      });

      setClips(filtered);
    } catch (e) {
      console.error('Error loading clips:', e);
      toast.error('Erro ao carregar os clips');
    } finally {
      setIsLoading(false);
    }
  };

  const generateClips = async () => {
    if (!user || !currentWorkspace || !activeSource) return;

    setIsGenerating(true);
    toast.info(`Buscando o último vídeo de ${activeSourceLabel} e criando 1 corte...`);

    try {
      const { data, error } = await supabase.functions.invoke('generate-batch-clips', {
        body: {
          workspace_id: currentWorkspace.id,
          clips_count: 1,
          source_profile: activeSource,
          source_label: activeSourceLabel,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setLastGeneratedSource(data?.source_video ?? null);
      toast.success(`Corte criado de "${data.source_video?.title}"`);
      await loadClips();
    } catch (e: any) {
      console.error('Error generating clips:', e);
      toast.error(e.message || 'Erro ao gerar corte');
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
      toast.success('Clip colocado na fila para daqui 1 hora');
      await loadClips();
    } catch (e) {
      console.error('Error scheduling clip:', e);
      toast.error('Erro ao colocar o clip na fila');
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
      setClips((prev) => prev.filter((clip) => clip.id !== clipId));
    } catch (e) {
      console.error('Error deleting clip:', e);
      toast.error('Erro ao deletar clip');
    }
  };

  const renderClip = async (clipId: string) => {
    if (renderingClipId) {
      toast.warning('Já existe uma renderização em andamento.');
      return;
    }

    setRenderingClipId(clipId);
    toast.info('Processando clip: gerando narração e preparando vídeo...');

    try {
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) throw new Error('Clip não encontrado');

      const meta = (clip.overlay_metadata as any) || {};
      const sourceVideo = meta?.source_video || {};

      const { data, error } = await supabase.functions.invoke('process-curated-video', {
        body: {
          post_id: clipId,
          video_source: {
            youtube_url: sourceVideo.youtube_url,
            video_id: sourceVideo.video_id,
            title: sourceVideo.title,
            description: '',
            channel: sourceVideo.channel,
            duration: sourceVideo.duration,
            thumbnail: sourceVideo.thumbnail,
            platform: 'youtube_authorized',
          },
          headline: meta?.headline || '',
          workspace_id: currentWorkspace?.id,
          user_id: user?.id,
          clip_script: {
            angle: meta?.angle || '',
            headline: meta?.headline || '',
            narration: typeof meta?.narration === 'string' ? meta.narration : meta?.narration?.script || '',
            segments: Array.isArray(meta?.segments) ? meta.segments : (meta?.narration?.segments || []),
            source_profile: meta?.source_profile,
            source_label: meta?.source_label,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(
        data?.narration_generated
          ? '✅ Narração gerada e clip processado!'
          : '✅ Clip processado (sem narração).',
      );
      await loadClips();
    } catch (e: any) {
      console.error('Error rendering clip:', e);
      toast.error(e.message || 'Erro ao processar clip');
    } finally {
      setRenderingClipId(null);
    }
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      draft: { label: 'Rascunho', variant: 'secondary' },
      scheduled: { label: 'Na fila', variant: 'default' },
      published: { label: 'Publicado', variant: 'outline' },
      render_pending: { label: 'Renderizando', variant: 'secondary' },
      render_failed: { label: 'Erro', variant: 'destructive' },
    };

    const info = map[status] || { label: status, variant: 'secondary' as const };
    return <Badge variant={info.variant} className="text-[10px]">{info.label}</Badge>;
  };

  const getScriptText = (clip: ClipPost) => {
    const meta = (clip.overlay_metadata as any) || {};

    if (typeof meta?.narration?.script === 'string') return meta.narration.script;
    if (typeof meta?.narration === 'string') return meta.narration;
    return '';
  };

  const getSegments = (clip: ClipPost) => {
    const meta = (clip.overlay_metadata as any) || {};

    if (Array.isArray(meta?.narration?.segments)) return meta.narration.segments;
    if (Array.isArray(meta?.segments)) return meta.segments;
    return [];
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            <div>
              <h2 className="font-semibold text-sm">Clips por fonte</h2>
              <p className="text-xs text-muted-foreground">
                Escolha um perfil do YouTube e gere 1 corte do vídeo mais recente.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[220px,1fr,auto] md:items-end">
            <div className="space-y-2">
              <Label>Fonte</Label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a fonte" />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_SOURCES.map((source) => (
                    <SelectItem key={source.value} value={source.value}>
                      {source.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{selectedSource === 'custom' ? 'Canal / @handle' : 'Perfil selecionado'}</Label>
              {selectedSource === 'custom' ? (
                <Input
                  value={customSource}
                  onChange={(event) => setCustomSource(event.target.value)}
                  placeholder="@REALIDADEIMPRESSIONANTE"
                />
              ) : (
                <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                  {activeSource}
                </div>
              )}
            </div>

            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-10 text-xs"
                onClick={loadClips}
                disabled={isLoading}
              >
                <RefreshCw className={cn('mr-1 h-3 w-3', isLoading && 'animate-spin')} />
                Atualizar
              </Button>
              <Button
                size="sm"
                className="h-10 text-xs neural-gradient border-0"
                onClick={generateClips}
                disabled={isGenerating || !activeSource}
              >
                {isGenerating ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" />
                )}
                Gerar 1 clip
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {lastGeneratedSource && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Último vídeo usado
                </p>
                <p className="text-sm font-medium">{lastGeneratedSource.title}</p>
                <p className="text-xs text-muted-foreground">{lastGeneratedSource.channel}</p>
              </div>
              {lastGeneratedSource.youtube_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => window.open(lastGeneratedSource.youtube_url, '_blank')}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Original
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isGenerating && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Gerando o corte...</p>
              <p className="text-xs text-muted-foreground">
                Indo até a fonte, pegando o último vídeo e montando o roteiro.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!isLoading && clipGroups.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <Film className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhum clip gerado ainda</p>
            <p className="mb-4 mt-1 text-xs text-muted-foreground">
              Escolha uma fonte e gere 1 corte para analisar o roteiro antes de processar.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && clipGroups.length > 0 && (
        <div className="space-y-4">
          {clipGroups.map((group) => (
            <Card key={group.key}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{group.channel}</Badge>
                      <span className="text-[11px] text-muted-foreground">{group.clips.length} cortes</span>
                    </div>
                    <p className="truncate text-sm font-semibold">{group.title}</p>
                  </div>
                  {group.youtubeUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => window.open(group.youtubeUrl!, '_blank')}
                    >
                      <ExternalLink className="mr-1 h-3 w-3" />
                      Fonte
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  {group.clips.map((clip) => {
                    const meta = (clip.overlay_metadata as any) || {};
                    const headline = meta?.headline || 'Clip';
                    const angle = meta?.angle || '';
                    const clipIndex = meta?.clip_index;
                    const totalClips = meta?.total_clips;
                    const scriptText = getScriptText(clip);
                    const segments = getSegments(clip);
                    const isExpanded = expandedClipId === clip.id;

                    return (
                      <div key={clip.id} className="overflow-hidden rounded-lg border bg-card">
                        <div className="flex gap-3 p-3">
                          <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                            {clip.image_url ? (
                              <img
                                src={clip.image_url}
                                alt={headline}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Film className="h-6 w-6 text-muted-foreground/50" />
                              </div>
                            )}

                            {clip.video_url && (
                              <div className="absolute inset-0 flex items-center justify-center bg-foreground/35">
                                <Play className="h-6 w-6 text-background" />
                              </div>
                            )}

                            {clipIndex && (
                              <div className="absolute left-1 top-1 rounded bg-foreground/70 px-1 text-[9px] text-background">
                                {clipIndex}/{totalClips}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold">{headline}</p>
                                {angle && (
                                  <p className="text-[10px] text-muted-foreground">Ângulo: {angle}</p>
                                )}
                              </div>
                              {getStatusBadge(clip.status)}
                            </div>

                            <p className="line-clamp-2 text-[11px] text-muted-foreground">
                              {clip.caption?.substring(0, 140)}...
                            </p>

                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {format(new Date(clip.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                              </span>
                              {clip.scheduled_for && (
                                <span className="flex items-center gap-0.5 text-primary">
                                  <CalendarDays className="h-2.5 w-2.5" />
                                  {format(new Date(clip.scheduled_for), 'dd/MM HH:mm', { locale: ptBR })}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {!clip.video_url && clip.status === 'draft' && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] neural-gradient border-0"
                                  onClick={() => renderClip(clip.id)}
                                  disabled={renderingClipId === clip.id}
                                >
                                  {renderingClipId === clip.id ? (
                                    <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                                  ) : (
                                    <Play className="mr-1 h-2.5 w-2.5" />
                                  )}
                                  {renderingClipId === clip.id ? 'Processando...' : 'Processar clip'}
                                </Button>
                              )}

                              {clip.video_url && (
                                <>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] neural-gradient border-0"
                                    onClick={() => scheduleClip(clip.id)}
                                  >
                                    <CalendarDays className="mr-1 h-2.5 w-2.5" />
                                    Agendar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => window.open(clip.video_url!, '_blank')}
                                  >
                                    <Eye className="mr-1 h-2.5 w-2.5" />
                                    Ver vídeo
                                  </Button>
                                </>
                              )}

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                                onClick={() => deleteClip(clip.id)}
                              >
                                <Trash2 className="mr-1 h-2.5 w-2.5" />
                                Excluir
                              </Button>
                            </div>
                          </div>
                        </div>

                        <Collapsible open={isExpanded} onOpenChange={(open) => setExpandedClipId(open ? clip.id : null)}>
                          <div className="border-t px-3 py-2">
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                Ver roteiro
                                <ChevronDown className={cn('ml-1 h-3 w-3 transition-transform', isExpanded && 'rotate-180')} />
                              </Button>
                            </CollapsibleTrigger>
                          </div>

                          <CollapsibleContent className="border-t bg-muted/30 px-3 py-3">
                            <div className="space-y-3">
                              {scriptText && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Roteiro completo
                                  </p>
                                  <p className="whitespace-pre-wrap text-sm">{scriptText}</p>
                                </div>
                              )}

                              {segments.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Segmentos
                                  </p>
                                  <div className="space-y-2">
                                    {segments.map((segment: any, index: number) => (
                                      <div key={`${clip.id}-segment-${index}`} className="rounded-md border bg-background p-2">
                                        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                          <span>Bloco {index + 1}</span>
                                          <span>{segment?.duration || 0}s</span>
                                        </div>
                                        <p className="text-xs whitespace-pre-wrap">{segment?.text}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
