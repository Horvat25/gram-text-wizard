import { useState, useEffect } from 'react';
import CostSummaryPanel from './CostSummaryPanel';
import StrategyPanel from './StrategyPanel';
import AgentVisionPanel from './AgentVisionPanel';
import { DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Image as ImageIcon,
  Film,
  Layers,
  Newspaper,
  Tv,
  Loader2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
  Megaphone,
  Video,
  Settings2,
  Star,
  ThumbsUp,
  ThumbsDown,
  Rss,
  ArrowLeft,
  RefreshCw,
  Maximize2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CustomFeedsManager } from '@/components/CustomFeedsManager';
import AgentMarketingPanel from '@/components/agent/AgentMarketingPanel';
import VideoClipsTab from '@/components/tabs/VideoClipsTab';
import TestFeedbackHistoryPanel from '@/components/tabs/TestFeedbackHistoryPanel';

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

// ====== Detail Preview Panel ======
function TestDetailView({
  contentType,
  result,
  generating,
  onRegenerate,
  onApprove,
  onReject,
  onBack,
}: {
  contentType: (typeof CONTENT_TYPES)[number];
  result: TestResult | null;
  generating: boolean;
  onRegenerate: (feedback: string) => void;
  onApprove: (postId: string, feedback: string, rating: number) => void;
  onReject: (postId: string, feedback: string, rating: number) => void;
  onBack: () => void;
}) {
  const [feedbackText, setFeedbackText] = useState('');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const post = result?.post;
  const Icon = contentType.icon;

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white',
            contentType.color
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-semibold flex-1">{contentType.label}</h3>
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
            {post.status === 'pending_review'
              ? 'Aguardando Revisão'
              : post.status === 'draft'
              ? 'Rascunho'
              : post.status === 'failed'
              ? 'Erro'
              : post.status === 'scheduled'
              ? 'Agendado'
              : post.status}
          </Badge>
        )}
      </div>

      {/* Loading / generating state */}
      {(!post || post.status === 'generating') && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-foreground">Gerando conteúdo...</p>
          <p className="text-xs text-muted-foreground max-w-xs text-center">
            O agente está criando imagem, legenda e hashtags. Isso pode levar até 2 minutos.
          </p>
          {post?.caption && post.caption.includes('Gerando') && (
            <Badge variant="secondary" className="text-[10px]">{post.caption}</Badge>
          )}
        </div>
      )}

      {/* Error state */}
      {post?.status === 'failed' && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">{post.error_message || 'Erro desconhecido'}</p>
        </div>
      )}

      {/* Content preview: side-by-side for image types, stacked for video */}
      {post && post.status !== 'failed' && post.status !== 'generating' && (
        <>
          {/* Side-by-side layout: media + caption */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Left: Media */}
            <div className="space-y-2">
              {post.video_url && (
                <video
                  src={post.video_url}
                  controls
                  className="w-full rounded-lg aspect-square object-cover"
                />
              )}

              {!post.video_url &&
                post.carousel_images &&
                post.carousel_images.length > 0 && (
                  <div className="grid grid-cols-2 gap-1">
                    {post.carousel_images.slice(0, 4).map((img: string, i: number) => (
                      <div key={`c-${i}`} className="relative group">
                        <img
                          src={img}
                          alt={`Slide ${i + 1}`}
                          className="aspect-square w-full rounded-md object-cover cursor-pointer"
                          onClick={() => setExpandedImage(img)}
                        />
                        <button
                          onClick={() => setExpandedImage(img)}
                          className="absolute top-1 right-1 p-1 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Maximize2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

              {!post.video_url && !post.carousel_images?.length && post.image_url && (
                <div className="relative group">
                  <img
                    src={post.image_url}
                    alt="Preview"
                    className="w-full rounded-lg aspect-square object-cover cursor-pointer"
                    onClick={() => setExpandedImage(post.image_url)}
                  />
                  <button
                    onClick={() => setExpandedImage(post.image_url)}
                    className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
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
            </div>

            {/* Right: Caption + Hashtags + Script */}
            <div className="space-y-3">
              {/* Caption */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Legenda
                </p>
                <div className="rounded-lg border bg-muted/30 p-3 max-h-[220px] overflow-y-auto">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed">{post.caption}</p>
                </div>
              </div>

              {/* Hashtags */}
              {post.hashtags && post.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {post.hashtags.map((tag: string, i: number) => (
                    <Badge key={`tag-${i}`} variant="secondary" className="text-[10px]">
                      #{tag.replace(/^#/, '')}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Headline */}
              {post.overlay_metadata?.headline && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Headline
                  </p>
                  <p className="text-sm font-bold">{post.overlay_metadata.headline}</p>
                </div>
              )}

              {/* Script segments */}
              {post.overlay_metadata?.script?.segments && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Roteiro
                  </p>
                  {post.overlay_metadata.script.segments.map((seg: any, i: number) => (
                    <div key={`seg-${i}`} className="rounded-md border bg-background p-2">
                      <p className="text-xs">{seg.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Feedback & Actions (drafts E pending_review) */}
          {(post.status === 'draft' || post.status === 'pending_review') && (
            <Card className="border-primary/20">
              <CardContent className="p-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold">Avaliação & Feedback</p>
                  <p className="text-[10px] text-muted-foreground">
                    {post.status === 'pending_review'
                      ? 'Aguardando sua revisão — não vai pra fila até você decidir'
                      : 'Seu feedback melhora as próximas gerações automaticamente'}
                  </p>
                </div>

                {/* Star rating */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Nota:</span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className="p-0.5"
                      >
                        <Star
                          className={cn(
                            'h-4 w-4 transition-colors',
                            star <= rating
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-muted-foreground/30'
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  {rating > 0 && (
                    <span className="text-[11px] font-medium">{rating}/5</span>
                  )}
                </div>

                {/* Feedback text */}
                <Textarea
                  placeholder="O que poderia melhorar? Ex: 'Imagem mais vibrante', 'Legenda mais curta'..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="min-h-[60px] text-xs"
                />

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 gap-1 text-xs"
                    onClick={() => onRegenerate(feedbackText)}
                    disabled={generating}
                  >
                    {generating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Gerar outra
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 flex-1 gap-1 text-xs"
                    onClick={() => onApprove(post.id, feedbackText, rating)}
                  >
                    <ThumbsUp className="h-3 w-3" />
                    Aprovar e Agendar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-destructive"
                    onClick={() => onReject(post.id, feedbackText, rating)}
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
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
        </>
      )}

      {/* Image expand dialog */}
      <Dialog open={!!expandedImage} onOpenChange={() => setExpandedImage(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 sm:p-4">
          <DialogTitle className="sr-only">Visualizar imagem</DialogTitle>
          {expandedImage && (
            <img
              src={expandedImage}
              alt="Preview expandido"
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ====== Main Component ======
export default function ContentTestTab() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [generating, setGenerating] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [activeDetailType, setActiveDetailType] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'teste' | 'custo'>('teste');

  // Recover pending_review/generating posts on mount (survives tab switching)
  // This way trocar de aba durante geração não perde o post de vista
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    let cancelled = false;
    (async () => {
      // Look back 30 min for pending posts created via test flow
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: pending } = await supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .in('status', ['pending_review', 'generating'])
        .gte('created_at', since)
        .order('created_at', { ascending: false });

      if (cancelled || !pending || pending.length === 0) return;

      // Map by media_type → content_type slot
      const typeMap: Record<string, string> = {
        image: 'image',
        carousel: 'carousel',
        video: 'video',
      };
      const recovered: Record<string, TestResult> = {};
      for (const p of pending) {
        const slot = typeMap[p.media_type as string] || 'image';
        if (!recovered[slot]) {
          recovered[slot] = {
            post: p,
            agentResponse: { decision: p.status === 'generating' ? 'GENERATING' : 'POST' },
          };
        }
      }
      setResults((prev) => ({ ...recovered, ...prev }));

      // Re-poll any that are still generating
      for (const p of pending) {
        if (p.status === 'generating') {
          const slot = typeMap[p.media_type as string] || 'image';
          setGenerating(slot);
          pollPost(p.id, slot);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  // Poll a post until it's no longer 'generating'
  const pollPost = async (postId: string, contentType: string) => {
    const maxAttempts = 150; // ~5 minutes (matches edge watchdog of 4min + margin)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const { data: post } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (!post) continue;

      if (post.status !== 'generating') {
        setResults((prev) => ({
          ...prev,
          [contentType]: { post, agentResponse: { decision: post.status === 'failed' ? 'FAILED' : 'POST' } },
        }));
        setGenerating(null);

        if (post.status === 'failed') {
          toast.error(post.error_message || 'Falha ao gerar conteúdo');
        } else {
          toast.success('Conteúdo gerado! Revise e dê feedback.');
        }
        return;
      }

      // Update progress in UI
      setResults((prev) => ({
        ...prev,
        [contentType]: {
          post: { ...post, caption: `⏳ Gerando... (${i * 2}s)` },
          agentResponse: { decision: 'GENERATING' },
        },
      }));
    }

    // Timeout — mark the post as failed so it stops occupying the slot
    setGenerating(null);
    await supabase
      .from('posts')
      .update({
        status: 'failed',
        error_message: 'Timeout no cliente: geração demorou mais de 5 minutos',
      })
      .eq('id', postId)
      .eq('status', 'generating');
    setResults((prev) => ({
      ...prev,
      [contentType]: {
        post: { ...prev[contentType]?.post, status: 'failed', error_message: 'Timeout (>5min)' },
        agentResponse: { decision: 'FAILED' },
      },
    }));
    toast.error('Geração demorou demais (>5min). Tente gerar novamente.');
  };

  const generateTest = async (contentType: string, feedbackHint?: string) => {
    if (!user || !currentWorkspace) return;

    setGenerating(contentType);
    setActiveDetailType(contentType);

    try {
      // Delete previous draft if regenerating
      const prevPost = results[contentType]?.post;
      if (prevPost?.id && (prevPost.status === 'draft' || prevPost.status === 'generating')) {
        await supabase.from('posts').delete().eq('id', prevPost.id);
      }

      // Save rejection feedback if regenerating with feedback
      if (feedbackHint && prevPost?.id) {
        await supabase.from('agent_decisions').insert({
          user_id: user.id,
          workspace_id: currentWorkspace.id,
          post_id: prevPost.id,
          decision: 'test_regenerated',
          decision_reason: feedbackHint,
          learning: `Regenerado ${contentType}: ${feedbackHint}`,
        });
      }

      const { data, error } = await supabase.functions.invoke('generate-test-content', {
        body: {
          workspace_id: currentWorkspace.id,
          content_type: contentType,
          feedback: feedbackHint || undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const post = data.post;

      // Set initial result (might be placeholder with status 'generating')
      setResults((prev) => ({
        ...prev,
        [contentType]: { post, agentResponse: data.agent_response },
      }));

      // If polling mode, start polling
      if (data.polling && post?.id) {
        toast.info('Gerando conteúdo em segundo plano...');
        pollPost(post.id, contentType);
      } else {
        // Direct result (shouldn't happen anymore but fallback)
        setGenerating(null);
        toast.success('Conteúdo gerado! Revise e dê feedback.');
      }
    } catch (e: any) {
      console.error(`Error generating ${contentType}:`, e);
      toast.error(e.message || `Erro ao gerar ${contentType}`);
      setGenerating(null);
    }
  };

  const approveAndPublish = async (postId: string, feedbackText: string, rating: number) => {
    try {
      if (feedbackText || rating) {
        await supabase.from('agent_decisions').insert({
          user_id: user!.id,
          workspace_id: currentWorkspace!.id,
          post_id: postId,
          decision: 'test_approved',
          decision_reason: feedbackText || `Aprovado com nota ${rating}/5`,
          expected_engagement: rating,
          learning: `Aprovado (${rating}/5): ${feedbackText}`,
        });
      }

      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledTime.getHours() + 1);

      const { error } = await supabase
        .from('posts')
        .update({ status: 'scheduled', scheduled_for: scheduledTime.toISOString() })
        .eq('id', postId);

      if (error) throw error;

      const ct = activeDetailType!;
      setResults((prev) => ({
        ...prev,
        [ct]: {
          ...prev[ct],
          post: { ...prev[ct].post, status: 'scheduled' },
        },
      }));

      toast.success('Aprovado! Agendado para daqui 1 hora');
    } catch (e) {
      toast.error('Erro ao agendar');
    }
  };

  const rejectPost = async (postId: string, feedbackText: string, rating: number) => {
    const ct = activeDetailType!;
    try {
      if (feedbackText || rating) {
        await supabase.from('agent_decisions').insert({
          user_id: user!.id,
          workspace_id: currentWorkspace!.id,
          post_id: postId,
          decision: 'test_rejected',
          decision_reason: feedbackText || 'Rejeitado',
          expected_engagement: rating,
          learning: `Rejeitado (${rating}/5): ${feedbackText}`,
        });
      }

      await supabase.from('posts').delete().eq('id', postId);

      setResults((prev) => {
        const copy = { ...prev };
        delete copy[ct];
        return copy;
      });

      toast.success(feedbackText ? 'Rejeitado — feedback salvo' : 'Post removido');
      setActiveDetailType(null);
    } catch (e) {
      toast.error('Erro ao deletar');
    }
  };

  // If a detail view is active, show it
  const activeContentType = CONTENT_TYPES.find((c) => c.type === activeDetailType);
  if (activeDetailType && activeContentType) {
    return (
      <TestDetailView
        contentType={activeContentType}
        result={results[activeDetailType] || null}
        generating={generating === activeDetailType}
        onRegenerate={(fb) => generateTest(activeDetailType, fb)}
        onApprove={approveAndPublish}
        onReject={rejectPost}
        onBack={() => setActiveDetailType(null)}
      />
    );
  }

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
          <AgentVisionPanel />

          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Teste de Conteúdo
            </h2>
            <p className="text-xs text-muted-foreground">
              Clique em Gerar para testar cada tipo. Revise e dê feedback antes de agendar.
            </p>
          </div>

          <TestFeedbackHistoryPanel />

          <div className="space-y-2">
            {CONTENT_TYPES.map(({ type, label, icon: Icon, description, color, editType }) => {
              const isGenerating = generating === type;
              const result = results[type];
              const post = result?.post;
              const isEditing = editingType === type;

              return (
                <Card key={type} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Header row */}
                    <div className="flex items-center gap-3 p-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white',
                          color
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{description}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {post && (
                          <Badge
                            variant={
                              post.status === 'scheduled' ? 'default' : 'secondary'
                            }
                            className="text-[10px] cursor-pointer"
                            onClick={() => setActiveDetailType(type)}
                          >
                            {post.status === 'pending_review'
                              ? '⏳ Revisar'
                              : post.status === 'draft'
                              ? '👁 Ver'
                              : post.status === 'scheduled'
                              ? '✓ Agendado'
                              : post.status === 'generating'
                              ? '⏳ Gerando'
                              : post.status}
                          </Badge>
                        )}

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

                    {/* Edit Panel (RSS, Marketing, or Clips) */}
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
                        {editType === 'clips' && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Film className="h-4 w-4 text-primary" />
                              <p className="text-xs font-semibold">Vídeos Curados & Clips</p>
                            </div>
                            <VideoClipsTab />
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
