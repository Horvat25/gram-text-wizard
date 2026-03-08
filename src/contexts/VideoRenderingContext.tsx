import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNarrativeStory } from '@/hooks/useNarrativeStory';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { unlockAudio } from '@/lib/audio-unlock';
import { toast } from 'sonner';

interface PendingVideo {
  id: string;
  caption: string;
  created_at: string;
  image_url: string | null;
  carousel_images: string[] | null;
  scheduled_for?: string | null;
  render_attempts?: number;
  overlay_metadata: {
    type?: string;
    script?: {
      title: string;
      segments: Array<{ text: string; imagePrompt: string }>;
    };
    topic?: string;
    needs_processing?: boolean;
    publish_after_render?: boolean;
    created_by_agent?: boolean;
    article_url?: string;
    article_image_url?: string;
  } | null;
}

interface VideoRenderingContextType {
  renderQueue: PendingVideo[];
  isRendering: boolean;
  isPaused: boolean;
  currentVideoId: string | null;
  completedCount: number;
  currentStep: string;
  isGenerating: boolean;
  progress: number;
  startRendering: () => void;
  pauseRendering: () => void;
  resumeRendering: () => void;
  refetchPendingVideos: () => Promise<void>;
}

const VideoRenderingContext = createContext<VideoRenderingContextType | null>(null);

export function useVideoRendering() {
  const context = useContext(VideoRenderingContext);
  if (!context) {
    throw new Error('useVideoRendering must be used within a VideoRenderingProvider');
  }
  return context;
}

const MAX_RENDER_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 30_000;

interface VideoRenderingProviderProps {
  children: ReactNode;
}

export function VideoRenderingProvider({ children }: VideoRenderingProviderProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { notifyVideoReady, notifyPostPublished, notifyAgentAction, requestPermission, permission } = usePushNotifications();
  const { settings: brandSettings } = useBrandSettings();

  // Request notification permission on first load
  useEffect(() => {
    if (user && permission === 'default') {
      const timer = setTimeout(() => requestPermission(), 5000);
      return () => clearTimeout(timer);
    }
  }, [user, permission, requestPermission]);

  const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [renderQueue, setRenderQueue] = useState<PendingVideo[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Refs to avoid stale closures
  const isRenderingRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentVideoIdRef = useRef<string | null>(null);
  const renderQueueRef = useRef<PendingVideo[]>([]);
  // Lock to prevent concurrent renders - single source of truth
  const renderLockRef = useRef(false);
  // Track which post IDs are currently being rendered to prevent duplicates
  const activeRenderIdRef = useRef<string | null>(null);
  // Debounce auto-start to prevent rapid re-triggers
  const autoStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isRenderingRef.current = isRendering;
    isPausedRef.current = isPaused;
    currentVideoIdRef.current = currentVideoId;
    renderQueueRef.current = renderQueue;
  }, [isRendering, isPaused, currentVideoId, renderQueue]);

  const {
    state,
    isGenerating,
    renderFromScript,
    generateStory,
    reset
  } = useNarrativeStory({
    brandName: brandSettings.brandName || 'NeuralUpdate',
    segmentCount: 4,
    segmentDuration: 5,
    preferredVoice: 'camila'
  });

  // ─── Fetch pending reels ───────────────────────────────────
  // Picks draft reels without video_url AND with render_attempts < MAX
  const fetchPendingVideos = useCallback(async () => {
    if (!user || !currentWorkspace) {
      setPendingVideos([]);
      if (!isRenderingRef.current && !renderLockRef.current) {
        setRenderQueue([]);
      }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id, caption, created_at, image_url, carousel_images, scheduled_for, overlay_metadata, render_attempts')
        .eq('workspace_id', currentWorkspace.id)
        .in('status', ['draft', 'scheduled'])
        .eq('media_type', 'reels')
        .is('video_url', null)
        .lt('render_attempts', MAX_RENDER_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(20);

      if (error) throw error;

      const pending = (data || []) as PendingVideo[];
      console.log(`[AutoRender] Found ${pending.length} pending reels (workspace ${currentWorkspace.id})`);
      setPendingVideos(pending);

      // Only update the render queue if we're NOT actively rendering
      // This prevents the queue from being reset mid-render
      if (!isRenderingRef.current && !renderLockRef.current) {
        setRenderQueue(pending);
      }
    } catch (error) {
      console.error('[AutoRender] Error fetching pending videos:', error);
    }
  }, [user, currentWorkspace]);

  // ─── Realtime: listen for new reels + published posts ──────
  useEffect(() => {
    if (!currentWorkspace) return;

    const channel = supabase
      .channel('agent-post-notifications')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts', filter: `workspace_id=eq.${currentWorkspace.id}` },
        (payload) => {
          const n = payload.new as any;
          const o = payload.old as any;
          if (o.status === 'scheduled' && n.status === 'published') {
            const platform = (n.platforms || ['instagram'])[0];
            const mediaType = n.media_type === 'reels' ? '🎬 Reels' : n.media_type === 'carousel' ? '🎠 Carrossel' : '📸 Post';
            notifyPostPublished(`${platform} - ${mediaType}: "${(n.caption || '').substring(0, 60)}..."`);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts', filter: `workspace_id=eq.${currentWorkspace.id}` },
        (payload) => {
          const n = payload.new as any;
          if (n.media_type === 'reels' && !n.video_url) {
            notifyVideoReady((n.caption || '').substring(0, 60));
            fetchPendingVideos();
          }
          if (n.status === 'scheduled' && n.media_type !== 'reels') {
            notifyAgentAction('Novo conteúdo criado', `${n.media_type === 'carousel' ? '🎠 Carrossel' : '📸 Post'}: "${(n.caption || '').substring(0, 50)}..."`);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentWorkspace, notifyPostPublished, notifyVideoReady, notifyAgentAction, fetchPendingVideos]);

  // ─── Polling ───────────────────────────────────────────────
  useEffect(() => {
    fetchPendingVideos();
    const interval = setInterval(fetchPendingVideos, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchPendingVideos]);

  // ─── Handle video completion ───────────────────────────────
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

    // Prevent double-complete
    if (activeRenderIdRef.current !== videoId) {
      console.log(`[AutoRender] Ignoring complete for ${videoId} - not the active render`);
      return;
    }

    try {
      const currentVideo = renderQueueRef.current.find(v => v.id === videoId);
      const videoTitle = currentVideo?.overlay_metadata?.script?.title || 'Vídeo';

      // Update post: save video, set scheduled, clear processing flag
      await supabase
        .from('posts')
        .update({
          video_url: videoUrl,
          overlay_metadata: null,
          status: 'scheduled',
          error_message: null,
          last_render_error: null,
        } as any)
        .eq('id', videoId);

      toast.success(`✅ "${videoTitle}" renderizado e agendado!`, { duration: 5000 });
      console.log(`[AutoRender] ✅ Video ${videoId} complete → scheduled`);

      setCompletedCount(prev => prev + 1);
      setRenderQueue(prev => prev.filter(v => v.id !== videoId));
      setCurrentVideoId(null);
      activeRenderIdRef.current = null;
      renderLockRef.current = false;
      reset();

      setTimeout(() => {
        if (!isPausedRef.current && isRenderingRef.current) processNextVideo();
      }, 2000);
    } catch (err: any) {
      console.error('[AutoRender] Error completing video:', err);
      toast.error('Erro ao salvar vídeo renderizado');
      activeRenderIdRef.current = null;
      renderLockRef.current = false;
    }
  };

  const handleVideoError = async (errorMsg: string) => {
    const videoId = currentVideoIdRef.current;
    if (!videoId) return;

    try {
      const currentVideo = renderQueueRef.current.find(v => v.id === videoId);
      const attempts = (currentVideo?.render_attempts || 0) + 1;
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
        console.error(`[AutoRender] ❌ Video ${videoId} failed permanently after ${attempts} attempts`);
      } else {
        toast.warning(`⚠️ Render falhou (tentativa ${attempts}/${MAX_RENDER_ATTEMPTS}), tentará novamente`);
        console.warn(`[AutoRender] ⚠️ Video ${videoId} attempt ${attempts} failed: ${errorMsg}`);
      }
    } catch (err) {
      console.error('[AutoRender] Error updating failed video:', err);
    }

    setRenderQueue(prev => prev.filter(v => v.id !== videoId));
    setCurrentVideoId(null);
    activeRenderIdRef.current = null;
    renderLockRef.current = false;
    reset();

    setTimeout(() => {
      if (!isPausedRef.current && isRenderingRef.current) processNextVideo();
    }, 3000);
  };

  // ─── Process next video in queue ───────────────────────────
  const processNextVideo = useCallback(async () => {
    // Prevent concurrent renders - check BOTH locks
    if (renderLockRef.current || activeRenderIdRef.current) {
      console.log(`[AutoRender] Render lock active (lock=${renderLockRef.current}, activeId=${activeRenderIdRef.current}), skipping`);
      return;
    }

    const queue = renderQueueRef.current;
    const nextVideo = queue[0]; // Always take the first in queue

    if (!nextVideo) {
      setIsRendering(false);
      const completed = completedCount;
      if (completed > 0) {
        toast.success(`✅ ${completed} vídeo(s) renderizado(s)!`);
        notifyAgentAction('Renderização Concluída', `${completed} vídeo(s) processados`);
        fetchPendingVideos();
      }
      return;
    }

    // Acquire lock IMMEDIATELY with both mechanisms
    renderLockRef.current = true;
    activeRenderIdRef.current = nextVideo.id;
    setCurrentVideoId(nextVideo.id);
    console.log(`[AutoRender] 🔒 Lock acquired for post ${nextVideo.id}`);

    // Double-check in DB that this post still needs rendering (prevent duplicates)
    try {
      const { data: freshPost, error: checkError } = await supabase
        .from('posts')
        .select('video_url, status, render_attempts')
        .eq('id', nextVideo.id)
        .single();

      if (checkError) throw checkError;

      if (freshPost?.video_url) {
        console.log(`[AutoRender] Post ${nextVideo.id} already has video, skipping`);
        setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
        renderLockRef.current = false;
        setTimeout(processNextVideo, 100);
        return;
      }

      if (freshPost?.status === 'render_failed' || (freshPost?.render_attempts || 0) >= MAX_RENDER_ATTEMPTS) {
        console.log(`[AutoRender] Post ${nextVideo.id} exceeded max attempts, skipping`);
        setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
        renderLockRef.current = false;
        setTimeout(processNextVideo, 100);
        return;
      }
    } catch (err) {
      console.error('[AutoRender] Error checking post status:', err);
      renderLockRef.current = false;
      return;
    }

    // Get script from overlay_metadata or generate one
    let script = nextVideo.overlay_metadata?.script;

    if (!script?.segments?.length) {
      const topic = nextVideo.overlay_metadata?.topic || nextVideo.caption;

      if (!topic) {
        console.error('[AutoRender] No script or topic for video:', nextVideo.id);
        toast.error('Vídeo sem script ou tema: pulando...');
        setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
        renderLockRef.current = false;
        setTimeout(processNextVideo, 100);
        return;
      }

      toast.info(`Gerando script para: ${topic.substring(0, 50)}...`);

      try {
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
          const errMsg = scriptError?.message || 'Sem segmentos gerados';
          await handleVideoError(`Erro ao gerar script: ${errMsg}`);
          return;
        }

        // Save generated script back to post
        await supabase
          .from('posts')
          .update({
            overlay_metadata: {
              ...(nextVideo.overlay_metadata || {}),
              script: { title: scriptData.title, segments: scriptData.segments }
            }
          })
          .eq('id', nextVideo.id);

        script = { title: scriptData.title, segments: scriptData.segments };
        console.log('[AutoRender] Script generated:', script.title);
      } catch (err: any) {
        await handleVideoError(`Erro ao gerar script: ${err.message}`);
        return;
      }
    }

    // Render video
    try {
      console.log(`[AutoRender] 🎬 Starting render for post ${nextVideo.id}: "${script.title}"`);
      const articleInfo = {
        articleUrl: nextVideo.overlay_metadata?.article_url,
        articleImageUrl: nextVideo.overlay_metadata?.article_image_url,
      };
      // Pass pre-existing carousel_images so renderFromScript skips image generation
      const preExistingImages = nextVideo.carousel_images || undefined;
      await renderFromScript(script.segments, script.title, articleInfo, preExistingImages);
      // Completion/error handled by the useEffect watching state.step
    } catch (err: any) {
      console.error('[AutoRender] Render threw:', err);
      await handleVideoError(`Erro na renderização: ${err.message}`);
    }
  }, [completedCount, renderFromScript, generateStory, notifyAgentAction, fetchPendingVideos, brandSettings.brandName]);

  // ─── Actions ───────────────────────────────────────────────
  const startRendering = useCallback(() => {
    unlockAudio();
    setIsRendering(true);
    setIsPaused(false);
    setCompletedCount(0);
    setTimeout(processNextVideo, 100);
  }, [processNextVideo]);

  const pauseRendering = useCallback(() => {
    setIsPaused(true);
    toast.info('Renderização pausada');
  }, []);

  const resumeRendering = useCallback(() => {
    setIsPaused(false);
    if (!isGenerating) processNextVideo();
  }, [isGenerating, processNextVideo]);

  // ─── Auto-start when new pending videos appear ─────────────
  const prevPendingCountRef = useRef(pendingVideos.length);
  useEffect(() => {
    const newCount = pendingVideos.length;
    const wasEmpty = prevPendingCountRef.current === 0;
    const hasNewVideos = newCount > 0;

    // Only auto-start if: was empty, now has videos, NOT rendering, NOT locked, NOT paused
    if (wasEmpty && hasNewVideos && !isRenderingRef.current && !renderLockRef.current && !activeRenderIdRef.current && !isPausedRef.current) {
      console.log('[AutoRender] Auto-starting render for pending reels');
      const firstVideo = pendingVideos[0];
      const title = firstVideo?.overlay_metadata?.script?.title || firstVideo?.overlay_metadata?.topic || 'Novo vídeo';
      notifyVideoReady(title);

      // Clear any existing auto-start timeout to prevent duplicates
      if (autoStartTimeoutRef.current) {
        clearTimeout(autoStartTimeoutRef.current);
      }

      autoStartTimeoutRef.current = setTimeout(() => {
        // Re-check locks before starting (another render may have started in the meantime)
        if (renderLockRef.current || activeRenderIdRef.current || isRenderingRef.current) {
          console.log('[AutoRender] Auto-start cancelled - render already active');
          return;
        }
        unlockAudio();
        toast.info('🎬 Iniciando renderização automática...');
        setIsRendering(true);
        setIsPaused(false);
        setCompletedCount(0);
        setTimeout(processNextVideo, 100);
      }, 2000);
    } else if (newCount > prevPendingCountRef.current && !isRenderingRef.current) {
      const diff = newCount - prevPendingCountRef.current;
      notifyVideoReady(`${diff} novo(s) vídeo(s) aguardando`);
    }

    prevPendingCountRef.current = newCount;
  }, [pendingVideos, processNextVideo, notifyVideoReady]);

  const progress = renderQueue.length > 0
    ? Math.round((completedCount / (completedCount + renderQueue.length)) * 100)
    : 100;

  const value: VideoRenderingContextType = {
    renderQueue,
    isRendering,
    isPaused,
    currentVideoId,
    completedCount,
    currentStep: state.step,
    isGenerating,
    progress,
    startRendering,
    pauseRendering,
    resumeRendering,
    refetchPendingVideos: fetchPendingVideos,
  };

  return (
    <VideoRenderingContext.Provider value={value}>
      {children}
    </VideoRenderingContext.Provider>
  );
}
