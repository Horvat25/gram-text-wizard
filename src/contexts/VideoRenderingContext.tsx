import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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

  // Fetch pending videos
  const fetchPendingVideos = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id, caption, created_at, image_url, scheduled_for, overlay_metadata')
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .eq('media_type', 'reels')
        .is('video_url', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const pending = (data || []).filter((post: any) => {
        const metadata = post.overlay_metadata;
        return metadata && 
               typeof metadata === 'object' && 
               'needs_processing' in metadata &&
               metadata.needs_processing === true;
      }) as PendingVideo[];

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
  }, [user]);

  // Initial fetch and polling
  useEffect(() => {
    fetchPendingVideos();
    
    // Poll every 30 seconds
    const interval = setInterval(fetchPendingVideos, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingVideos]);

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
      const shouldPublish = currentVideo?.overlay_metadata?.publish_after_render;
      
      // Update post with video URL
      await supabase
        .from('posts')
        .update({
          video_url: videoUrl,
          overlay_metadata: null,
          status: shouldPublish ? 'scheduled' : 'draft',
          scheduled_for: shouldPublish ? new Date().toISOString() : null
        })
        .eq('id', videoId);

      // Auto-publish if flagged
      if (shouldPublish) {
        const { error: publishError } = await supabase.functions.invoke('publish-post', {
          body: { postId: videoId }
        });
        
        if (!publishError) {
          notifyPostPublished('Instagram');
        }
      }

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
    
    const script = nextVideo.overlay_metadata?.script;
    if (!script?.segments?.length) {
      console.error('No script segments for video:', nextVideo.id);
      setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
      setTimeout(processNextVideo, 100);
      return;
    }
    
    try {
      await renderFromScript(script.segments, script.title);
    } catch (err) {
      console.error('Error rendering video:', err);
      setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
      setTimeout(processNextVideo, 100);
    }
  }, [completedCount, renderFromScript, notifyAgentAction, fetchPendingVideos]);

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
