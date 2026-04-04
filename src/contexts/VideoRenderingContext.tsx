import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode, type Context } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useNarrativeStory } from '@/hooks/useNarrativeStory';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { unlockAudio } from '@/lib/audio-unlock';
import { VIDEO_CONFIG } from '@/lib/video-config';
import { toast } from 'sonner';

const MAX_RENDER_ATTEMPTS = 3;

const OPTIMAL_HOURS_BRT = [9, 12, 15, 18, 20];
const MIN_GAP_HOURS = 2;
const MAX_POSTS_PER_DAY = 4;
const SCHEDULE_LOOK_AHEAD_DAYS = 7;

interface VideoRenderingContextType {
  isRendering: boolean;
  currentVideoId: string | null;
  currentStep: string;
  isGenerating: boolean;
  progress: number;
  renderVideo: (postId: string) => Promise<void>;
  cancelRendering: () => void;
}

type VideoRenderingContextGlobal = typeof globalThis & {
  __lovableVideoRenderingContext__?: Context<VideoRenderingContextType | null>;
};

const videoRenderingContextGlobal = globalThis as VideoRenderingContextGlobal;

const VideoRenderingContext =
  videoRenderingContextGlobal.__lovableVideoRenderingContext__ ??
  (videoRenderingContextGlobal.__lovableVideoRenderingContext__ = createContext<VideoRenderingContextType | null>(null));

VideoRenderingContext.displayName = 'VideoRenderingContext';

export function useVideoRendering() {
  const context = useContext(VideoRenderingContext);
  if (!context) {
    throw new Error('useVideoRendering must be used within a VideoRenderingProvider');
  }
  return context;
}

async function findOptimalScheduleTime(workspaceId: string): Promise<string> {
  const now = new Date();
  const endDate = new Date(now.getTime() + SCHEDULE_LOOK_AHEAD_DAYS * 24 * 60 * 60 * 1000);

  const { data: existingPosts } = await supabase
    .from('posts')
    .select('scheduled_for, published_at, status')
    .eq('workspace_id', workspaceId)
    .or('status.eq.scheduled,status.eq.published')
    .gte('scheduled_for', now.toISOString())
    .lte('scheduled_for', endDate.toISOString());

  const takenSlots = (existingPosts || [])
    .map((post) => (post.scheduled_for ? new Date(post.scheduled_for).getTime() : 0))
    .filter(Boolean);

  const postsByDay: Record<string, number> = {};
  for (const slot of takenSlots) {
    const dayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(slot));
    postsByDay[dayKey] = (postsByDay[dayKey] || 0) + 1;
  }

  for (let dayOffset = 0; dayOffset < SCHEDULE_LOOK_AHEAD_DAYS; dayOffset++) {
    const dayDate = new Date(now);
    dayDate.setDate(dayDate.getDate() + dayOffset);
    const dayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dayDate);

    if ((postsByDay[dayKey] || 0) >= MAX_POSTS_PER_DAY) continue;

    for (const hour of OPTIMAL_HOURS_BRT) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);
      candidate.setUTCHours(hour + 3, 0, 0, 0);

      if (candidate.getTime() < now.getTime() + 10 * 60 * 1000) continue;

      const tooClose = takenSlots.some(
        (slot) => Math.abs(slot - candidate.getTime()) < MIN_GAP_HOURS * 60 * 60 * 1000,
      );
      if (tooClose) continue;

      takenSlots.push(candidate.getTime());
      postsByDay[dayKey] = (postsByDay[dayKey] || 0) + 1;

      return candidate.toISOString();
    }
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setUTCHours(12, 0, 0, 0);
  return fallback.toISOString();
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
  const { currentWorkspace } = useWorkspace();
  const { settings: brandSettings } = useBrandSettings();
  const { isEnabled: notificationsEnabled, sendNotification } = usePushNotifications();

  const [isRendering, setIsRendering] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const renderLockRef = useRef(false);

  useEffect(() => {
    currentVideoIdRef.current = currentVideoId;
  }, [currentVideoId]);

  const { state, isGenerating, renderFromScript, reset } = useNarrativeStory({
    brandName: brandSettings.brandName || VIDEO_CONFIG.BRAND_NAME,
    segmentCount: VIDEO_CONFIG.SEGMENT_COUNT,
    segmentDuration: VIDEO_CONFIG.SEGMENT_DURATION_BASE,
  });

  const notify = useCallback(
    (title: string, body: string, tag: string) => {
      toast.success(title, { description: body, duration: 6000 });
      if (notificationsEnabled) {
        sendNotification({ title, body, tag, requireInteraction: true });
      }
    },
    [notificationsEnabled, sendNotification],
  );

  const handleVideoComplete = useCallback(
    async (videoUrl: string) => {
      const videoId = currentVideoIdRef.current;
      if (!videoId) return;

      try {
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
        notify('🎬 Vídeo Renderizado!', `Agendado para ${timeStr} (Brasília).`, 'video-rendered');
        console.log(`[Render] ✅ Video ${videoId} complete → scheduled for ${timeStr}`);
      } catch (err) {
        console.error('[Render] Error completing video:', err);
        toast.error('Erro ao salvar vídeo renderizado');
      } finally {
        currentVideoIdRef.current = null;
        setCurrentVideoId(null);
        setIsRendering(false);
        renderLockRef.current = false;
        reset();
      }
    },
    [currentWorkspace?.id, notify, reset],
  );

  const handleVideoError = useCallback(
    async (errorMsg: string) => {
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
          toast.error(`❌ Render falhou (${attempts}x): ${errorMsg.substring(0, 100)}`);
        } else {
          toast.warning(`⚠️ Render falhou (${attempts}/${MAX_RENDER_ATTEMPTS}). Você pode tentar novamente.`);
        }
      } catch (err) {
        console.error('[Render] Error updating failed video:', err);
      } finally {
        currentVideoIdRef.current = null;
        setCurrentVideoId(null);
        setIsRendering(false);
        renderLockRef.current = false;
        reset();
      }
    },
    [reset],
  );

  useEffect(() => {
    if (state.step === 'complete' && state.videoUrl && currentVideoIdRef.current) {
      void handleVideoComplete(state.videoUrl);
    }
    if (state.step === 'error' && currentVideoIdRef.current) {
      void handleVideoError(state.error || 'Erro desconhecido na renderização');
    }
  }, [state.step, state.videoUrl, state.error, handleVideoComplete, handleVideoError]);

  const renderVideo = useCallback(
    async (postId: string) => {
      if (renderLockRef.current) {
        toast.warning('Já existe uma renderização em andamento. Aguarde.');
        return;
      }

      renderLockRef.current = true;
      setIsRendering(true);
      setCurrentVideoId(postId);
      currentVideoIdRef.current = postId;
      unlockAudio();

      try {
        const { data: post, error: fetchError } = await supabase
          .from('posts')
          .select('id, caption, carousel_images, overlay_metadata, render_attempts')
          .eq('id', postId)
          .single();

        if (fetchError || !post) {
          toast.error('Post não encontrado');
          currentVideoIdRef.current = null;
          renderLockRef.current = false;
          setIsRendering(false);
          setCurrentVideoId(null);
          return;
        }

        const previousAttempts = Number((post as any).render_attempts || 0);
        if (previousAttempts >= MAX_RENDER_ATTEMPTS) {
          toast.info('Limpando tentativas antigas para uma nova renderização manual.');
        }

        await supabase
          .from('posts')
          .update({
            status: 'draft',
            render_attempts: previousAttempts >= MAX_RENDER_ATTEMPTS ? 0 : previousAttempts,
            error_message: null,
            last_render_error: null,
          } as any)
          .eq('id', postId);

        const metadata = post.overlay_metadata as any;
        let script = metadata?.script;

        if (!script?.segments?.length) {
          const topic = metadata?.topic || post.caption;
          if (!topic) {
            await handleVideoError('Vídeo sem script ou tema');
            return;
          }

          toast.info(`Gerando script para: ${topic.substring(0, 50)}...`);

          const { data: scriptData, error: scriptError } = await supabase.functions.invoke('generate-story-script', {
            body: {
              topic,
              segmentCount: VIDEO_CONFIG.SEGMENT_COUNT,
              wordsPerSegment: VIDEO_CONFIG.WORDS_PER_SEGMENT,
              totalDuration: VIDEO_CONFIG.SEGMENT_COUNT * VIDEO_CONFIG.SEGMENT_DURATION_BASE,
              style: VIDEO_CONFIG.SCRIPT_STYLE,
              brandName: brandSettings.brandName || VIDEO_CONFIG.BRAND_NAME,
            },
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
                script: { title: scriptData.title, segments: scriptData.segments },
              },
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
    },
    [brandSettings.brandName, handleVideoError, renderFromScript],
  );

  const cancelRendering = useCallback(() => {
    console.log('[Render] ❌ Cancel requested by user');
    currentVideoIdRef.current = null;
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
    renderVideo,
    cancelRendering,
  };

  return <VideoRenderingContext.Provider value={value}>{children}</VideoRenderingContext.Provider>;
}
