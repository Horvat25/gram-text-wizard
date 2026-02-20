import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNarrativeStory } from '@/hooks/useNarrativeStory';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { unlockAudio } from '@/lib/audio-unlock';
import { initFFmpeg } from '@/lib/video-converter';
import { toast } from 'sonner';

interface PendingVideo {
  id: string;
  caption: string;
  created_at: string;
  image_url: string | null;
  scheduled_for?: string | null;
  overlay_metadata: {
    type: string;
    script: {
      title: string;
      segments: Array<{ text: string; imagePrompt: string }>;
    };
    topic: string;
    needs_processing: boolean;
    publish_after_render?: boolean;
    created_by_agent?: boolean;
    article_url?: string;
    article_image_url?: string;
  };
}

interface VideoRenderingContextType {
  // State
  renderQueue: PendingVideo[];
  isRendering: boolean;
  isPaused: boolean;
  currentVideoId: string | null;
  completedCount: number;
  currentStep: string;
  isGenerating: boolean;
  progress: number;
  
  // Actions
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

interface VideoRenderingProviderProps {
  children: ReactNode;
}

export function VideoRenderingProvider({ children }: VideoRenderingProviderProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { notifyPostPublished, notifyAgentAction } = usePushNotifications();
  const { settings: brandSettings } = useBrandSettings();
  
  const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [renderQueue, setRenderQueue] = useState<PendingVideo[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  // Use refs to maintain state across re-renders without causing loops
  const isRenderingRef = useRef(false);
  const isPausedRef = useRef(false);
  const currentVideoIdRef = useRef<string | null>(null);
  const renderQueueRef = useRef<PendingVideo[]>([]);
  
  // Keep refs in sync
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
    reset
  } = useNarrativeStory({
    brandName: brandSettings.brandName || 'NeuralUpdate',
    segmentCount: 4,
    segmentDuration: 5,
    preferredVoice: 'camila'
  });

  // Fetch pending videos (both draft AND scheduled that need rendering)
  // IMPORTANT: Filter by workspace_id to avoid mixing videos from different workspaces
  const fetchPendingVideos = useCallback(async () => {
    if (!user || !currentWorkspace) {
      setPendingVideos([]);
      setRenderQueue([]);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch both draft and scheduled videos that need rendering
      // Use workspace_id for proper isolation between workspaces
      const { data, error } = await supabase
        .from('posts')
        .select('id, caption, created_at, image_url, scheduled_for, overlay_metadata')
        .eq('workspace_id', currentWorkspace.id)
        .in('status', ['draft', 'scheduled']) // Include both statuses
        .eq('media_type', 'reels')
        .is('video_url', null)
        .order('scheduled_for', { ascending: true, nullsFirst: false }) // Prioritize by schedule
        .limit(20);

      if (error) throw error;

      const pending = (data || []).filter((post: any) => {
        const metadata = post.overlay_metadata;
        return metadata && 
               typeof metadata === 'object' && 
               'needs_processing' in metadata &&
               metadata.needs_processing === true;
      }) as PendingVideo[];

      console.log(`[VideoRendering] Found ${pending.length} pending videos for workspace ${currentWorkspace.id}`);
      setPendingVideos(pending);
      
      // Update render queue if not currently rendering
      if (!isRenderingRef.current) {
        setRenderQueue(pending);
      }
    } catch (error) {
      console.error('Error fetching pending videos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentWorkspace]);

  // Initial fetch and polling
  useEffect(() => {
    fetchPendingVideos();
    
    // OPTIMIZATION: Pre-load FFmpeg when pending videos exist
    // This loads the 31MB core in background while user browses
    if (pendingVideos.length > 0) {
      initFFmpeg().catch(err => {
        console.log('[VideoRendering] FFmpeg pre-load deferred:', err.message);
      });
    }
    
    // Poll every 30 seconds
    const interval = setInterval(fetchPendingVideos, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingVideos, pendingVideos.length]);

  // Handle video completion
  useEffect(() => {
    if (state.step === 'complete' && state.videoUrl && currentVideoIdRef.current) {
      handleVideoComplete(state.videoUrl);
    }
  }, [state.step, state.videoUrl]);

  const handleVideoComplete = async (videoUrl: string) => {
    const videoId = currentVideoIdRef.current;
    if (!videoId) return;
    
    try {
      const currentVideo = renderQueueRef.current.find(v => v.id === videoId);
      const videoTitle = currentVideo?.overlay_metadata?.script?.title || 'Vídeo';
      
      // ALWAYS save as draft without scheduling - user will schedule manually
      // This prevents duplicate/overlapping posts
      await supabase
        .from('posts')
        .update({
          video_url: videoUrl,
          overlay_metadata: null,
          status: 'draft',
          scheduled_for: null // Clear any existing schedule
        })
        .eq('id', videoId);

      // Show success toast with reminder to schedule
      toast.success(`✅ "${videoTitle}" renderizado!`, {
        description: 'Agende manualmente quando quiser publicar.',
        duration: 5000
      });

      setCompletedCount(prev => prev + 1);
      
      // Remove from queue and process next
      setRenderQueue(prev => prev.filter(v => v.id !== videoId));
      setCurrentVideoId(null);
      reset();
      
      // Continue with next video after a small delay
      setTimeout(() => {
        if (!isPausedRef.current && isRenderingRef.current) {
          processNextVideo();
        }
      }, 1000);
      
    } catch (err: any) {
      console.error('Error completing video:', err);
      toast.error('Erro ao salvar vídeo');
    }
  };

  const processNextVideo = useCallback(async () => {
    const queue = renderQueueRef.current;
    const currentId = currentVideoIdRef.current;
    const nextVideo = queue.find(v => v.id !== currentId);
    
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
    
    setCurrentVideoId(nextVideo.id);
    
    let script = nextVideo.overlay_metadata?.script;
    
    // If no script, try to generate one from the topic
    if (!script?.segments?.length) {
      const topic = nextVideo.overlay_metadata?.topic;
      
      if (!topic) {
        console.error('No script or topic for video:', nextVideo.id);
        toast.error(`Vídeo sem script ou tema: pulando...`);
        setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
        setTimeout(processNextVideo, 100);
        return;
      }
      
      // Generate script on-the-fly
      toast.info(`Gerando script para: ${topic.substring(0, 50)}...`);
      console.log('[VideoRendering] Generating script for video without one:', nextVideo.id);
      
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
          console.error('Failed to generate script:', scriptError || 'No segments');
          toast.error(`Erro ao gerar script: pulando vídeo`);
          setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
          setTimeout(processNextVideo, 100);
          return;
        }
        
        // Update the post with the generated script
        await supabase
          .from('posts')
          .update({
            overlay_metadata: {
              ...nextVideo.overlay_metadata,
              script: {
                title: scriptData.title,
                segments: scriptData.segments,
                segmentCount: scriptData.segmentCount,
                totalDuration: scriptData.totalDuration
              }
            }
          })
          .eq('id', nextVideo.id);
        
        script = {
          title: scriptData.title,
          segments: scriptData.segments
        };
        
        console.log('[VideoRendering] Script generated successfully:', script.title);
        
      } catch (err) {
        console.error('Error generating script:', err);
        toast.error(`Erro ao gerar script: pulando vídeo`);
        setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
        setTimeout(processNextVideo, 100);
        return;
      }
    }
    
    try {
      const articleInfo = {
        articleUrl: nextVideo.overlay_metadata?.article_url,
        articleImageUrl: nextVideo.overlay_metadata?.article_image_url,
      };
      await renderFromScript(script.segments, script.title, articleInfo);
    } catch (err) {
      console.error('Error rendering video:', err);
      setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
      setTimeout(processNextVideo, 100);
    }
  }, [completedCount, renderFromScript, notifyAgentAction, fetchPendingVideos, brandSettings.brandName]);

  const startRendering = useCallback(() => {
    unlockAudio();
    setIsRendering(true);
    setIsPaused(false);
    setCompletedCount(0);
    
    // Use setTimeout to ensure state is updated before processing
    setTimeout(() => {
      processNextVideo();
    }, 100);
  }, [processNextVideo]);

  const pauseRendering = useCallback(() => {
    setIsPaused(true);
    toast.info('Renderização pausada');
  }, []);

  const resumeRendering = useCallback(() => {
    setIsPaused(false);
    if (!isGenerating) {
      processNextVideo();
    }
  }, [isGenerating, processNextVideo]);

  // AUTO-START: Automatically start rendering when agent creates a video
  // Only trigger when new videos appear and we're not already rendering
  const prevPendingCountRef = useRef(pendingVideos.length);
  useEffect(() => {
    const newCount = pendingVideos.length;
    const wasEmpty = prevPendingCountRef.current === 0;
    const hasNewVideos = newCount > 0;
    
    // If we went from 0 to >0 pending videos and not rendering, auto-start
    if (wasEmpty && hasNewVideos && !isRenderingRef.current && !isPausedRef.current) {
      console.log('[VideoRendering] Auto-starting render for new agent-created video(s)');
      
      // Check if any video was created by the agent
      const agentCreatedVideo = pendingVideos.find(v => 
        v.overlay_metadata?.created_by_agent === true
      );
      
      if (agentCreatedVideo) {
        // Small delay to ensure UI is ready
        setTimeout(() => {
          unlockAudio();
          toast.info('🎬 Iniciando renderização automática do vídeo...');
          setIsRendering(true);
          setIsPaused(false);
          setCompletedCount(0);
          setTimeout(processNextVideo, 100);
        }, 2000);
      }
    }
    
    prevPendingCountRef.current = newCount;
  }, [pendingVideos, processNextVideo]);

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
