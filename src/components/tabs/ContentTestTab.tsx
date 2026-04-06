import { useState } from 'react';
import CostSummaryPanel from './CostSummaryPanel';
import StrategyPanel from './StrategyPanel';
import { DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Image as ImageIcon,
  Film,
  Layers,
  Newspaper,
  Tv,
  Loader2,
  CalendarDays,
  Trash2,
  ChevronDown,
  Sparkles,
  AlertCircle,
  Megaphone,
  Video,
  MessageSquare,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TestResult {
  post: any;
  agentResponse: any;
}

const CONTENT_TYPES = [
  {
    type: 'image',
    label: 'Imagem',
    icon: ImageIcon,
    description: 'Post com imagem gerada por IA + headline + legenda',
    color: 'from-violet-500 to-purple-600',
  },
  {
    type: 'carousel',
    label: 'Carrossel',
    icon: Layers,
    description: '4 slides educacionais sobre 1 tema (RSS)',
    color: 'from-blue-500 to-cyan-600',
  },
  {
    type: 'news',
    label: 'Notícia',
    icon: Newspaper,
    description: 'Post de notícia com imagem do artigo + headline',
    color: 'from-amber-500 to-orange-600',
  },
  {
    type: 'video',
    label: 'Reels Criativo',
    icon: Film,
    description: 'Vídeo narrado com imagens IA (rascunho p/ render)',
    color: 'from-pink-500 to-rose-600',
  },
  {
    type: 'news_video',
    label: 'Reels Notícia',
    icon: Tv,
    description: 'Vídeo estilo telejornal a partir de RSS',
    color: 'from-emerald-500 to-green-600',
  },
  {
    type: 'marketing_image',
    label: 'Marketing Imagem',
    icon: Megaphone,
    description: 'Post de marketing com imagem do produto + link afiliado',
    color: 'from-yellow-500 to-amber-600',
  },
  {
    type: 'marketing_video',
    label: 'Marketing Vídeo',
    icon: Video,
    description: 'VSL / Reels de marketing com narração + link afiliado',
    color: 'from-red-500 to-pink-600',
  },
] as const;

export default function ContentTestTab() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [generating, setGenerating] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState<Record<string, string>>({});
  const [showDeleteReason, setShowDeleteReason] = useState<string | null>(null);

  const generateTest = async (contentType: string) => {
    if (!user || !currentWorkspace) return;

    setGenerating(contentType);
    toast.info(`Gerando teste de ${contentType}...`);

    try {
      const { data, error } = await supabase.functions.invoke('generate-test-content', {
        body: {
          workspace_id: currentWorkspace.id,
          content_type: contentType,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResults((prev) => ({
        ...prev,
        [contentType]: {
          post: data.post,
          agentResponse: data.agent_response,
        },
      }));

      setExpandedType(contentType);
      toast.success(`Teste de ${contentType} criado!`);
    } catch (e: any) {
      console.error(`Error generating ${contentType}:`, e);
      toast.error(e.message || `Erro ao gerar ${contentType}`);
    } finally {
      setGenerating(null);
    }
  };

  const schedulePost = async (postId: string, contentType: string) => {
    try {
      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 1);

      const { error } = await supabase
        .from('posts')
        .update({ status: 'scheduled', scheduled_for: scheduledTime.toISOString() })
        .eq('id', postId);

      if (error) throw error;

      setResults((prev) => ({
        ...prev,
        [contentType]: {
          ...prev[contentType],
          post: { ...prev[contentType].post, status: 'scheduled' },
        },
      }));

      toast.success('Agendado para daqui 1 hora');
    } catch (e) {
      toast.error('Erro ao agendar');
    }
  };

  const deletePost = async (postId: string, contentType: string) => {
    const reason = deleteReason[contentType]?.trim() || '';

    try {
      // If there's a reason, save it as a note on agent_decisions for future learning
      if (reason) {
        await supabase.from('agent_decisions').insert({
          user_id: user!.id,
          workspace_id: currentWorkspace!.id,
          post_id: postId,
          decision: 'test_rejected',
          decision_reason: reason,
          learning: `Teste de ${contentType} rejeitado: ${reason}`,
        });
      }

      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;

      setResults((prev) => {
        const copy = { ...prev };
        delete copy[contentType];
        return copy;
      });
      setShowDeleteReason(null);
      setDeleteReason((prev) => {
        const copy = { ...prev };
        delete copy[contentType];
        return copy;
      });

      toast.success(reason ? 'Post removido — motivo salvo para melhorar' : 'Post de teste removido');
    } catch (e) {
      toast.error('Erro ao deletar');
    }
  };

  const [subTab, setSubTab] = useState<'teste' | 'custo'>('teste');

  return (
    <div className="space-y-4">
      {/* Sub-tab toggle */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setSubTab('teste')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            subTab === 'teste'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Teste
        </button>
        <button
          onClick={() => setSubTab('custo')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            subTab === 'custo'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <DollarSign className="h-3.5 w-3.5" />
          Custo
        </button>
      </div>

      {subTab === 'custo' ? (
        <div className="space-y-4">
          <CostSummaryPanel />
          <StrategyPanel />
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Teste de Conteúdo
            </h2>
            <p className="text-xs text-muted-foreground">
              Gere 1 exemplo de cada tipo para conferir qualidade, legenda, imagem e roteiro.
            </p>
          </div>

          <div className="space-y-3">
            {CONTENT_TYPES.map(({ type, label, icon: Icon, description, color }) => {
          const isGenerating = generating === type;
          const result = results[type];
          const post = result?.post;
          const isExpanded = expandedType === type;
          const isShowingDeleteReason = showDeleteReason === type;

          return (
            <Card key={type} className="overflow-hidden">
              <CardContent className="p-0">
                {/* Header row */}
                <div className="flex items-center gap-3 p-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white', color)}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{description}</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {post?.cost_estimate != null && post.cost_estimate > 0 && (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        ~${post.cost_estimate.toFixed(3)}
                      </span>
                    )}
                    {post && (
                      <Badge
                        variant={post.status === 'failed' ? 'destructive' : post.status === 'scheduled' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {post.status === 'draft' ? '✓ OK' : post.status === 'failed' ? 'Erro' : post.status === 'scheduled' ? 'Agendado' : post.status}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => generateTest(type)}
                      disabled={isGenerating || generating !== null}
                    >
                      {isGenerating ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 h-3 w-3" />
                      )}
                      {post ? 'Refazer' : 'Gerar'}
                    </Button>
                  </div>
                </div>

                {/* Inline mini preview (always visible when result exists) */}
                {post && !isExpanded && (
                  <div
                    className="flex cursor-pointer items-center gap-3 border-t bg-muted/20 px-3 py-2"
                    onClick={() => setExpandedType(type)}
                  >
                    {/* Thumbnail */}
                    {post.image_url && (
                      <img
                        src={post.image_url}
                        alt="Preview"
                        className="h-12 w-12 shrink-0 rounded-md object-cover"
                      />
                    )}
                    {!post.image_url && post.carousel_images?.[0] && (
                      <img
                        src={post.carousel_images[0]}
                        alt="Preview"
                        className="h-12 w-12 shrink-0 rounded-md object-cover"
                      />
                    )}

                    <p className="line-clamp-2 flex-1 text-[11px] text-muted-foreground">
                      {post.caption?.substring(0, 120)}...
                    </p>

                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </div>
                )}

                {/* Expanded result */}
                {post && (
                  <Collapsible open={isExpanded} onOpenChange={(open) => setExpandedType(open ? type : null)}>
                    {isExpanded && (
                      <div className="border-t px-3 py-1.5">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-full justify-between px-2 text-xs">
                            <span>Resultado</span>
                            <ChevronDown className="h-3 w-3 rotate-180 transition-transform" />
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    )}

                    <CollapsibleContent className="border-t bg-muted/30 p-3">
                      <div className="space-y-3">
                        {/* Error */}
                        {post.status === 'failed' && (
                          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                            <p className="text-xs text-destructive">{post.error_message || 'Erro desconhecido'}</p>
                          </div>
                        )}

                        {/* Video preview */}
                        {post.video_url && (
                          <video
                            src={post.video_url}
                            controls
                            className="w-full rounded-lg"
                            style={{ maxHeight: 300 }}
                          />
                        )}

                        {/* Carousel preview */}
                        {!post.video_url && post.carousel_images && post.carousel_images.length > 0 && (
                          <div className="grid grid-cols-2 gap-1.5">
                            {post.carousel_images.slice(0, 8).map((img: string, i: number) => (
                              <img
                                key={`carousel-${type}-${i}`}
                                src={img}
                                alt={`Slide ${i + 1}`}
                                className="aspect-[4/5] w-full rounded-md object-cover"
                              />
                            ))}
                          </div>
                        )}

                        {/* Single image preview */}
                        {!post.video_url && !post.carousel_images?.length && post.image_url && (
                          <img
                            src={post.image_url}
                            alt="Preview"
                            className="w-full rounded-lg object-cover"
                            style={{ maxHeight: 320 }}
                          />
                        )}

                        {/* Caption */}
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Legenda</p>
                          <p className="whitespace-pre-wrap text-xs">{post.caption}</p>
                        </div>

                        {/* Hashtags */}
                        {post.hashtags && post.hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {post.hashtags.map((tag: string, i: number) => (
                              <Badge key={`tag-${type}-${i}`} variant="secondary" className="text-[10px]">
                                #{tag.replace(/^#/, '')}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Script / overlay metadata */}
                        {post.overlay_metadata && (
                          <div className="space-y-2">
                            {post.overlay_metadata.script?.segments && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Roteiro</p>
                                {post.overlay_metadata.script.segments.map((seg: any, i: number) => (
                                  <div key={`script-${type}-${i}`} className="rounded-md border bg-background p-2">
                                    <p className="text-xs">{seg.text}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {post.overlay_metadata.headline && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Headline</p>
                                <p className="text-sm font-bold">{post.overlay_metadata.headline}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Meta info */}
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Tipo: {post.media_type}</span>
                          <span>•</span>
                          <span>AI: {post.ai_model_used || 'N/A'}</span>
                          {post.cost_estimate > 0 && (
                            <>
                              <span>•</span>
                              <span>Custo: ~${post.cost_estimate?.toFixed(3)}</span>
                            </>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {post.status === 'draft' && (
                            <Button
                              size="sm"
                              className="h-7 px-3 text-[11px] neural-gradient border-0"
                              onClick={() => schedulePost(post.id, type)}
                            >
                              <CalendarDays className="mr-1 h-3 w-3" />
                              Agendar (1h)
                            </Button>
                          )}

                          {!isShowingDeleteReason ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-3 text-[11px] text-destructive hover:text-destructive"
                              onClick={() => setShowDeleteReason(type)}
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Excluir
                            </Button>
                          ) : (
                            <div className="flex w-full items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                              <MessageSquare className="h-4 w-4 shrink-0 text-destructive" />
                              <Input
                                placeholder="O que ficou ruim? (opcional)"
                                value={deleteReason[type] || ''}
                                onChange={(e) =>
                                  setDeleteReason((prev) => ({ ...prev, [type]: e.target.value }))
                                }
                                className="h-7 flex-1 text-xs"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') deletePost(post.id, type);
                                }}
                              />
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => deletePost(post.id, type)}
                              >
                                Confirmar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => setShowDeleteReason(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
            </Card>
          );
        })}
          </div>
        </>
      )}
    </div>
  );
}
