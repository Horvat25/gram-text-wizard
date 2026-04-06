import { useState } from 'react';
import CostSummaryPanel from './CostSummaryPanel';
import StrategyPanel from './StrategyPanel';
import { DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  ChevronUp,
  Sparkles,
  AlertCircle,
  Megaphone,
  Video,
  MessageSquare,
  Settings2,
  Star,
  Send,
  ThumbsUp,
  ThumbsDown,
  Rss,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CustomFeedsManager } from '@/components/CustomFeedsManager';
import AgentMarketingPanel from '@/components/agent/AgentMarketingPanel';
import VideoClipsTab from '@/components/tabs/VideoClipsTab';

interface TestResult {
  post: any;
  agentResponse: any;
}

const CONTENT_TYPES = [
  {
    type: 'image',
    label: 'Imagem IA',
    icon: ImageIcon,
    description: 'Imagem gerada por IA + headline + legenda',
    color: 'from-violet-500 to-purple-600',
    editType: null,
  },
  {
    type: 'carousel',
    label: 'Carrossel',
    icon: Layers,
    description: '4 slides educacionais sobre 1 tema (RSS)',
    color: 'from-blue-500 to-cyan-600',
    editType: null,
  },
  {
    type: 'news',
    label: 'Notícia',
    icon: Newspaper,
    description: 'Post de notícia com imagem do artigo + headline',
    color: 'from-amber-500 to-orange-600',
    editType: 'rss' as const,
  },
  {
    type: 'video',
    label: 'Reels Criativo',
    icon: Film,
    description: 'Vídeo narrado com imagens IA',
    color: 'from-pink-500 to-rose-600',
    editType: null,
  },
  {
    type: 'news_video',
    label: 'Reels Notícia',
    icon: Tv,
    description: 'Vídeo estilo telejornal a partir de RSS',
    color: 'from-emerald-500 to-green-600',
    editType: 'clips' as const,
  },
  {
    type: 'marketing_image',
    label: 'Marketing Imagem',
    icon: Megaphone,
    description: 'Post de marketing com imagem + link afiliado',
    color: 'from-yellow-500 to-amber-600',
    editType: 'marketing' as const,
  },
  {
    type: 'marketing_video',
    label: 'Marketing Vídeo',
    icon: Video,
    description: 'VSL / Reels de marketing com narração',
    color: 'from-red-500 to-pink-600',
    editType: 'marketing' as const,
  },
] as const;

export default function ContentTestTab() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [generating, setGenerating] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});

  const [subTab, setSubTab] = useState<'teste' | 'custo'>('teste');

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

      // Ensure post is draft (not published)
      const post = data.post;
      if (post && post.status === 'published') {
        await supabase
          .from('posts')
          .update({ status: 'draft', published_at: null })
          .eq('id', post.id);
        post.status = 'draft';
        post.published_at = null;
      }

      setResults((prev) => ({
        ...prev,
        [contentType]: {
          post,
          agentResponse: data.agent_response,
        },
      }));

      setExpandedType(contentType);
      toast.success(`Teste de ${contentType} gerado! Revise antes de publicar.`);
    } catch (e: any) {
      console.error(`Error generating ${contentType}:`, e);
      toast.error(e.message || `Erro ao gerar ${contentType}`);
    } finally {
      setGenerating(null);
    }
  };

  const approveAndPublish = async (postId: string, contentType: string) => {
    try {
      const feedbackText = feedback[contentType]?.trim() || '';
      const rating = ratings[contentType] || 0;

      // Save approval feedback
      if (feedbackText || rating) {
        await supabase.from('agent_decisions').insert({
          user_id: user!.id,
          workspace_id: currentWorkspace!.id,
          post_id: postId,
          decision: 'test_approved',
          decision_reason: feedbackText || `Aprovado com nota ${rating}/5`,
          expected_engagement: rating,
          learning: `Teste de ${contentType} aprovado (${rating}/5): ${feedbackText}`,
        });
      }

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

      toast.success('Aprovado! Agendado para daqui 1 hora');
    } catch (e) {
      toast.error('Erro ao agendar');
    }
  };

  const rejectPost = async (postId: string, contentType: string) => {
    const feedbackText = feedback[contentType]?.trim() || '';
    const rating = ratings[contentType] || 0;

    try {
      if (feedbackText || rating) {
        await supabase.from('agent_decisions').insert({
          user_id: user!.id,
          workspace_id: currentWorkspace!.id,
          post_id: postId,
          decision: 'test_rejected',
          decision_reason: feedbackText || 'Rejeitado sem motivo específico',
          expected_engagement: rating,
          learning: `Teste de ${contentType} rejeitado (${rating}/5): ${feedbackText}`,
        });
      }

      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) throw error;

      setResults((prev) => {
        const copy = { ...prev };
        delete copy[contentType];
        return copy;
      });
      setFeedback((prev) => {
        const copy = { ...prev };
        delete copy[contentType];
        return copy;
      });
      setRatings((prev) => {
        const copy = { ...prev };
        delete copy[contentType];
        return copy;
      });

      toast.success(feedbackText ? 'Rejeitado — feedback salvo para melhorar' : 'Post de teste removido');
    } catch (e) {
      toast.error('Erro ao deletar');
    }
  };

  const StarRating = ({ type }: { type: string }) => {
    const currentRating = ratings[type] || 0;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRatings((prev) => ({ ...prev, [type]: star }))}
            className="p-0.5"
          >
            <Star
              className={cn(
                'h-4 w-4 transition-colors',
                star <= currentRating
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-muted-foreground/30'
              )}
            />
          </button>
        ))}
      </div>
    );
  };

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
              Gere, revise e dê feedback antes de publicar.
            </p>
          </div>

          <div className="space-y-3">
            {CONTENT_TYPES.map(({ type, label, icon: Icon, description, color, editType }) => {
              const isGenerating = generating === type;
              const result = results[type];
              const post = result?.post;
              const isExpanded = expandedType === type;
              const isEditing = editingType === type;

              return (
                <Card key={type} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header row */}
                    <div className="flex items-center gap-3 p-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white',
                          color
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{description}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {post && (
                          <Badge
                            variant={
                              post.status === 'failed'
                                ? 'destructive'
                                : post.status === 'scheduled'
                                ? 'default'
                                : 'secondary'
                            }
                            className="text-[10px]"
                          >
                            {post.status === 'draft'
                              ? 'Rascunho'
                              : post.status === 'failed'
                              ? 'Erro'
                              : post.status === 'scheduled'
                              ? 'Agendado'
                              : post.status}
                          </Badge>
                        )}

                        {/* Edit button */}
                        {editType && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setEditingType(isEditing ? null : type)}
                          >
                            {isEditing ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <Settings2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
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

                    {/* Edit Panel (RSS or Marketing) */}
                    {isEditing && editType && (
                      <div className="border-t bg-muted/20 p-3">
                        {editType === 'rss' && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Rss className="h-4 w-4 text-primary" />
                              <p className="text-xs font-semibold">Fontes RSS</p>
                            </div>
                            <CustomFeedsManager />
                          </div>
                        )}
                        {editType === 'marketing' && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Megaphone className="h-4 w-4 text-primary" />
                              <p className="text-xs font-semibold">Links de Afiliados</p>
                            </div>
                            <AgentMarketingPanel />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mini preview (collapsed) */}
                    {post && !isExpanded && (
                      <div
                        className="flex cursor-pointer items-center gap-3 border-t bg-muted/20 px-3 py-2"
                        onClick={() => setExpandedType(type)}
                      >
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

                    {/* Expanded result with preview + feedback */}
                    {post && (
                      <Collapsible
                        open={isExpanded}
                        onOpenChange={(open) => setExpandedType(open ? type : null)}
                      >
                        {isExpanded && (
                          <div className="border-t px-3 py-1.5">
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-full justify-between px-2 text-xs"
                              >
                                <span>Preview</span>
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
                                <p className="text-xs text-destructive">
                                  {post.error_message || 'Erro desconhecido'}
                                </p>
                              </div>
                            )}

                            {/* Video */}
                            {post.video_url && (
                              <video
                                src={post.video_url}
                                controls
                                className="w-full rounded-lg"
                                style={{ maxHeight: 300 }}
                              />
                            )}

                            {/* Carousel */}
                            {!post.video_url &&
                              post.carousel_images &&
                              post.carousel_images.length > 0 && (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {post.carousel_images
                                    .slice(0, 8)
                                    .map((img: string, i: number) => (
                                      <img
                                        key={`carousel-${type}-${i}`}
                                        src={img}
                                        alt={`Slide ${i + 1}`}
                                        className="aspect-[4/5] w-full rounded-md object-cover"
                                      />
                                    ))}
                                </div>
                              )}

                            {/* Single image */}
                            {!post.video_url &&
                              !post.carousel_images?.length &&
                              post.image_url && (
                                <img
                                  src={post.image_url}
                                  alt="Preview"
                                  className="w-full rounded-lg object-cover"
                                  style={{ maxHeight: 320 }}
                                />
                              )}

                            {/* Caption */}
                            <div className="space-y-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Legenda
                              </p>
                              <p className="whitespace-pre-wrap text-xs">{post.caption}</p>
                            </div>

                            {/* Hashtags */}
                            {post.hashtags && post.hashtags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {post.hashtags.map((tag: string, i: number) => (
                                  <Badge
                                    key={`tag-${type}-${i}`}
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    #{tag.replace(/^#/, '')}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {/* Script / overlay */}
                            {post.overlay_metadata && (
                              <div className="space-y-2">
                                {post.overlay_metadata.script?.segments && (
                                  <div className="space-y-1.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Roteiro
                                    </p>
                                    {post.overlay_metadata.script.segments.map(
                                      (seg: any, i: number) => (
                                        <div
                                          key={`script-${type}-${i}`}
                                          className="rounded-md border bg-background p-2"
                                        >
                                          <p className="text-xs">{seg.text}</p>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}

                                {post.overlay_metadata.headline && (
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Headline
                                    </p>
                                    <p className="text-sm font-bold">
                                      {post.overlay_metadata.headline}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Meta */}
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

                            {/* Feedback Section */}
                            {post.status === 'draft' && (
                              <div className="space-y-2 rounded-lg border bg-background p-3">
                                <p className="text-xs font-semibold">Avaliação</p>

                                {/* Star rating */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-muted-foreground">Nota:</span>
                                  <StarRating type={type} />
                                  {ratings[type] ? (
                                    <span className="text-[11px] font-medium">
                                      {ratings[type]}/5
                                    </span>
                                  ) : null}
                                </div>

                                {/* Feedback text */}
                                <Textarea
                                  placeholder="O que poderia melhorar? (opcional)"
                                  value={feedback[type] || ''}
                                  onChange={(e) =>
                                    setFeedback((prev) => ({ ...prev, [type]: e.target.value }))
                                  }
                                  className="min-h-[60px] text-xs"
                                />

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    className="h-8 flex-1 gap-1 text-xs"
                                    onClick={() => approveAndPublish(post.id, type)}
                                  >
                                    <ThumbsUp className="h-3 w-3" />
                                    Aprovar e Agendar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 flex-1 gap-1 text-xs text-destructive border-destructive/30"
                                    onClick={() => rejectPost(post.id, type)}
                                  >
                                    <ThumbsDown className="h-3 w-3" />
                                    Rejeitar
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Already scheduled */}
                            {post.status === 'scheduled' && (
                              <div className="flex items-center gap-2 rounded-md border bg-primary/5 p-2">
                                <CalendarDays className="h-4 w-4 text-primary" />
                                <p className="text-xs text-primary font-medium">
                                  Aprovado e agendado para publicação
                                </p>
                              </div>
                            )}
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
