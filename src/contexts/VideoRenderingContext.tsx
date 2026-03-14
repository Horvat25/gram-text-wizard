import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useNarrativeStory } from '@/hooks/useNarrativeStory';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { unlockAudio } from '@/lib/audio-unlock';
import { toast } from 'sonner';

const MAX_RENDER_ATTEMPTS = 3;

// Optimal posting times in Brasília (UTC-3)
const OPTIMAL_HOURS_BRT = [9, 12, 15, 18, 20];
const MIN_GAP_HOURS = 2;

interface VideoRenderingContextType {
  isRendering: boolean;
  currentVideoId: string | null;
  currentStep: string;
  isGenerating: boolean;
  progress: number;
  autoRenderEnabled: boolean;
  autoRenderQueue: string[];
  renderVideo: (postId: string) => Promise<void>;
  cancelRendering: () => void;
  toggleAutoRender: () => void;
}

const VideoRenderingContext = createContext<VideoRenderingContextType | null>(null);

export function useVideoRendering() {
  const context = useContext(VideoRenderingContext);
  if (!context) {
    throw new Error('useVideoRendering must be used within a VideoRenderingProvider');
  }
  return context;
}

// ─── Smart scheduling helper ─────────────────────────────
async function findOptimalScheduleTime(workspaceId: string): Promise<string> {
  const now = new Date();
  
  // Get existing scheduled posts for the next 3 days
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const { data: existingPosts } = await supabase
    .from('posts')
    .select('scheduled_for')
    .eq('workspace_id', workspaceId)
    .eq('status', 'scheduled')
    .gte('scheduled_for', now.toISOString())
    .lte('scheduled_for', threeDaysLater.toISOString());

  const takenSlots = (existingPosts || [])
    .map(p => p.scheduled_for ? new Date(p.scheduled_for).getTime() : 0)
    .filter(Boolean);

  // Try slots for the next 3 days
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    for (const hour of OPTIMAL_HOURS_BRT) {
      // Create date in BRT (UTC-3)
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);
      // Set UTC hour = BRT hour + 3
      candidate.setUTCHours(hour + 3, 0, 0, 0);

      // Must be in the future (at least 5 min from now)
      if (candidate.getTime() < now.getTime() + 5 * 60 * 1000) continue;

      // Check minimum gap from existing slots
      const tooClose = takenSlots.some(
        slot => Math.abs(slot - candidate.getTime()) < MIN_GAP_HOURS * 60 * 60 * 1000
      );
      if (tooClose) continue;

      return candidate.toISOString();
    }
  }

  // Fallback: 30 minutes from now
  return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
}

function formatBRTTime(isoString: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(isoString));
}

interface VideoRenderingProviderProps {
  children: ReactNode;
}

export function VideoRenderingProvider({ children }: VideoRenderingProviderProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { settings: brandSettings } = useBrandSettings();
  const { isEnabled: notificationsEnabled, sendNotification } = usePushNotifications();

  const [isRendering, setIsRendering] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const renderLockRef = useRef(false);

  // Auto-render state
  const [autoRenderEnabled, setAutoRenderEnabled] = useState(false);
  const [autoRenderQueue, setAutoRenderQueue] = useState<string[]>([]);
  const autoRenderEnabledRef = useRef(false);
  const processingAutoRef = useRef(false);

  useEffect(() => {
    currentVideoIdRef.current = currentVideoId;
  }, [currentVideoId]);

  useEffect(() => {
    autoRenderEnabledRef.current = autoRenderEnabled;
  }, [autoRenderEnabled]);

  const {
    state,
    isGenerating,
    renderFromScript,
    reset
  } = useNarrativeStory({
    brandName: brandSettings.brandName || 'NeuralUpdate',
    segmentCount: 4,
    segmentDuration: 4,
    preferredVoice: 'camila'
  });

  // ─── Notify helper ─────────────────────────────────────
  const notify = useCallback((title: string, body: string, tag: string) => {
    toast.success(title, { description: body, duration: 6000 });
    if (notificationsEnabled) {
      sendNotification({ title, body, tag, requireInteraction: true });
    }
  }, [notificationsEnabled, sendNotification]);

  // ─── Handle completion / error ─────────────────────────────
  useEffect(() => {
    if (state.step === 'complete' && state.videoUrl && currentVideoIdRef.current) {
      handleVideoComplete(state.videoUrl);
    }
    if (state.step === 'error' && currentVideoIdRef.current) {
      handleVideoError(state.error || 'Erro desconhecido na renderização');
    }
  }, [state.step, state.videoUrl, state.error]);

  const handleVideoComplete = async (videoUrl: string) => {
    const videoId = currentVideoIdRef.current;
    if (!videoId) return;

    try {
      // Find optimal schedule time
      const workspaceId = currentWorkspace?.id;
      const scheduledFor = workspaceId
        ? await findOptimalScheduleTime(workspaceId)
        : new Date(Date.now() + 30 * 60 * 1000).toISOString();

      await supabase
        .from('posts')
        .update({
          video_url: videoUrl,
          overlay_metadata: null,
          status: 'scheduled',
          scheduled_for: scheduledFor,
          error_message: null,
          last_render_error: null,
        } as any)
        .eq('id', videoId);

      const timeStr = formatBRTTime(scheduledFor);
      notify(
        '🎬 Vídeo Renderizado!',
        `Agendado para ${timeStr} (Brasília). Abra a fila para revisar.`,
        'video-rendered'
      );
      console.log(`[Render] ✅ Video ${videoId} complete → scheduled for ${timeStr}`);
    } catch (err: any) {
      console.error('[Render] Error completing video:', err);
      toast.error('Erro ao salvar vídeo renderizado');
    } finally {
      setCurrentVideoId(null);
      setIsRendering(false);
      renderLockRef.current = false;
      reset();
      // Process next in auto-render queue
      if (autoRenderEnabledRef.current) {
        setTimeout(() => processAutoQueue(), 3000);
      }
    }
  };

  const handleVideoError = async (errorMsg: string) => {
    const videoId = currentVideoIdRef.current;
    if (!videoId) return;

    try {
      const { data: freshPost } = await supabase
        .from('posts')
        .select('render_attempts')
        .eq('id', videoId)
        .single();

      const attempts = ((freshPost as any)?.render_attempts || 0) + 1;
      const isFinal = attempts >= MAX_RENDER_ATTEMPTS;

      await supabase
        .from('posts')
        .update({
          status: isFinal ? 'render_failed' : 'draft',
          render_attempts: attempts,
          last_render_error: errorMsg,
          error_message: isFinal ? `Renderização falhou após ${attempts} tentativa(s): ${errorMsg}` : null,
        } as any)
        .eq('id', videoId);

      if (isFinal) {
        toast.error(`❌ Render falhou permanentemente (${attempts}x): ${errorMsg.substring(0, 80)}`);
      } else {
        toast.warning(`⚠️ Render falhou (tentativa ${attempts}/${MAX_RENDER_ATTEMPTS})`);
      }
    } catch (err) {
      console.error('[Render] Error updating failed video:', err);
    }

    setCurrentVideoId(null);
    setIsRendering(false);
    renderLockRef.current = false;
    reset();
    // Continue auto-queue even after error
    if (autoRenderEnabledRef.current) {
      setTimeout(() => processAutoQueue(), 5000);
    }
  };

  // ─── Render a single video ─────────────────────────
  const renderVideo = useCallback(async (postId: string) => {
    if (renderLockRef.current) {
      toast.warning('Já existe uma renderização em andamento. Aguarde.');
      return;
    }

    renderLockRef.current = true;
    setIsRendering(true);
    setCurrentVideoId(postId);
    unlockAudio();

    try {
      const { data: post, error: fetchError } = await supabase
        .from('posts')
        .select('id, caption, carousel_images, overlay_metadata, render_attempts')
        .eq('id', postId)
        .single();

      if (fetchError || !post) {
        toast.error('Post não encontrado');
        renderLockRef.current = false;
        setIsRendering(false);
        setCurrentVideoId(null);
        return;
      }

      if ((post as any).render_attempts >= MAX_RENDER_ATTEMPTS) {
        toast.error('Este vídeo excedeu o limite de tentativas de renderização');
        renderLockRef.current = false;
        setIsRendering(false);
        setCurrentVideoId(null);
        return;
      }

      const metadata = post.overlay_metadata as any;
      let script = metadata?.script;

      if (!script?.segments?.length) {
        const topic = metadata?.topic || post.caption;
        if (!topic) {
          toast.error('Vídeo sem script ou tema');
          renderLockRef.current = false;
          setIsRendering(false);
          setCurrentVideoId(null);
          return;
        }

        toast.info(`Gerando script para: ${topic.substring(0, 50)}...`);

        const { data: scriptData, error: scriptError } = await supabase.functions.invoke('generate-story-script', {
          body: {
            topic,
            segmentCount: 4,
            wordsPerSegment: 12,
            totalDuration: 20,
            style: 'informativo, envolvente, com começo-meio-fim',
            brandName: brandSettings.brandName || 'Neural Update'
          }
        });

        if (scriptError || !scriptData?.segments?.length) {
          await handleVideoError(`Erro ao gerar script: ${scriptError?.message || 'Sem segmentos'}`);
          return;
        }

        await supabase
          .from('posts')
          .update({
            overlay_metadata: {
              ...(metadata || {}),
              script: { title: scriptData.title, segments: scriptData.segments }
            }
          })
          .eq('id', postId);

        script = { title: scriptData.title, segments: scriptData.segments };
      }

      console.log(`[Render] 🎬 Starting render for post ${postId}: "${script.title}"`);
      const articleInfo = {
        articleUrl: metadata?.article_url,
        articleImageUrl: metadata?.article_image_url,
      };
      const preExistingImages = (post.carousel_images as string[]) || undefined;
      await renderFromScript(script.segments, script.title, articleInfo, preExistingImages);
    } catch (err: any) {
      console.error('[Render] Error:', err);
      await handleVideoError(`Erro na renderização: ${err.message}`);
    }
  }, [renderFromScript, brandSettings.brandName]);

  // ─── Auto-render queue processing ─────────────────
  const processAutoQueue = useCallback(async () => {
    if (!autoRenderEnabledRef.current || renderLockRef.current || processingAutoRef.current) return;
    processingAutoRef.current = true;

    try {
      // Find pending reels (draft, media_type=reels, no video_url)
      const workspaceId = currentWorkspace?.id;
      if (!workspaceId) { processingAutoRef.current = false; return; }

      const { data: pendingReels } = await supabase
        .from('posts')
        .select('id, caption, render_attempts')
        .eq('workspace_id', workspaceId)
        .eq('status', 'draft')
        .in('media_type', ['reels', 'reel'])
        .is('video_url', null)
        .lt('render_attempts', MAX_RENDER_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(10);

      const pending = pendingReels || [];
      setAutoRenderQueue(pending.map(p => p.id));

      if (pending.length === 0) {
        console.log('[AutoRender] No pending reels found');
        processingAutoRef.current = false;
        return;
      }

      const next = pending[0];
      console.log(`[AutoRender] 🤖 Auto-rendering ${pending.length} pending reels. Starting: ${next.id}`);
      
      notify(
        '🤖 Auto-Render Iniciado',
        `Renderizando ${pending.length} vídeo(s) automaticamente...`,
        'auto-render-start'
      );

      processingAutoRef.current = false;
      await renderVideo(next.id);
    } catch (err) {
      console.error('[AutoRender] Error:', err);
      processingAutoRef.current = false;
    }
  }, [renderVideo, currentWorkspace?.id, notify]);

  // ─── Toggle auto-render ─────────────────────────
  const toggleAutoRender = useCallback(() => {
    setAutoRenderEnabled(prev => {
      const next = !prev;
      if (next) {
        toast.success('🤖 Auto-render ATIVADO! Vídeos serão renderizados automaticamente.');
        // Start processing immediately
        setTimeout(() => processAutoQueue(), 1000);
      } else {
        toast.info('Auto-render desativado.');
        setAutoRenderQueue([]);
      }
      return next;
    });
  }, [processAutoQueue]);

  // ─── Watch for new draft reels via Realtime ─────────
  useEffect(() => {
    if (!user || !currentWorkspace?.id || !autoRenderEnabled) return;

    const channel = supabase
      .channel('auto-render-watch')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'posts',
          filter: `workspace_id=eq.${currentWorkspace.id}`,
        },
        (payload) => {
          const post = payload.new as any;
          const isReels = post.media_type === 'reels' || post.media_type === 'reel';
          const needsRender = isReels && !post.video_url && post.status === 'draft';
          
          if (needsRender && autoRenderEnabledRef.current) {
            console.log('[AutoRender] New reel detected, queuing:', post.id);
            // Small delay to let the DB settle
            setTimeout(() => processAutoQueue(), 5000);
          }
        }
      )
      .subscribe();

    // Initial scan on enable
    processAutoQueue();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentWorkspace?.id, autoRenderEnabled, processAutoQueue]);

  const cancelRendering = useCallback(() => {
    setIsRendering(false);
    setCurrentVideoId(null);
    renderLockRef.current = false;
    reset();
    toast.info('Renderização cancelada');
  }, [reset]);

  const value: VideoRenderingContextType = {
    isRendering,
    currentVideoId,
    currentStep: state.step,
    isGenerating,
    progress: Math.max(0, Math.min(100, state.progress || 0)),
    autoRenderEnabled,
    autoRenderQueue,
    renderVideo,
    cancelRendering,
    toggleAutoRender,
  };

  return (
    <VideoRenderingContext.Provider value={value}>
      {children}
    </VideoRenderingContext.Provider>
  );
}
