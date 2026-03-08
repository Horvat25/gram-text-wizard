import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePendingVideos } from '@/hooks/usePendingVideos';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useNarrativeStory } from '@/hooks/useNarrativeStory';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { unlockAudio } from '@/lib/audio-unlock';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Film, 
  Loader2, 
  CheckCircle2, 
  X,
  Play,
  Pause
} from 'lucide-react';

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
    article_url?: string;
    article_image_url?: string;
  };
}

interface AutoVideoRendererProps {
  enabled?: boolean;
  onComplete?: (postId: string, videoUrl: string) => void;
}

export default function AutoVideoRenderer({ enabled = true, onComplete }: AutoVideoRendererProps) {
  const { user } = useAuth();
  const { pendingVideos, refetch } = usePendingVideos();
  const { notifyPostPublished, notifyAgentAction } = usePushNotifications();
  const { settings: brandSettings } = useBrandSettings();
  
  const [isRendering, setIsRendering] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [renderQueue, setRenderQueue] = useState<PendingVideo[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const hasStartedRef = useRef(false);
  
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

  // Initialize queue when pending videos change
  useEffect(() => {
    if (pendingVideos.length > 0 && renderQueue.length === 0 && !isRendering) {
      setRenderQueue(pendingVideos as PendingVideo[]);
    }
  }, [pendingVideos, renderQueue.length, isRendering]);

  // Auto-start rendering on first load if enabled
  const autoStartTriggered = useRef(false);
  useEffect(() => {
    if (
      enabled && 
      !autoStartTriggered.current && 
      renderQueue.length > 0 && 
      !isRendering && 
      !isPaused
    ) {
      autoStartTriggered.current = true;
      toast.info(
        `🎬 ${renderQueue.length} vídeo(s) pendente(s). Iniciando renderização automática...`,
        { duration: 5000 }
      );
      // Use a timeout so processNextVideo is defined by then
      const timer = setTimeout(() => {
        unlockAudio();
        setIsRendering(true);
        setIsPaused(false);
        setCompletedCount(0);
        // Trigger next video via a state flag
        setAutoStartReady(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [enabled, renderQueue.length, isRendering, isPaused]);

  const [autoStartReady, setAutoStartReady] = useState(false);

  // Handle video completion
  useEffect(() => {
    if (state.step === 'complete' && state.videoUrl && currentVideoId) {
      handleVideoComplete(state.videoUrl);
    }
  }, [state.step, state.videoUrl, currentVideoId]);

  // Calculate next optimal schedule time respecting daily limits
  const getNextScheduleTime = useCallback(async (videoIndex: number): Promise<Date> => {
    const BEST_HOURS_BRASILIA = [9, 12, 18]; // Max 2 per day, pick from these
    const MAX_POSTS_PER_DAY = 2;
    
    // Fetch already scheduled posts to avoid conflicts
    const { data: scheduledPosts } = await supabase
      .from('posts')
      .select('scheduled_for')
      .eq('status', 'scheduled')
      .gte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });
    
    // Count posts per day (in Brasília timezone)
    const postsPerDay: Record<string, number> = {};
    const scheduledTimes: Date[] = [];
    
    (scheduledPosts || []).forEach(p => {
      if (!p.scheduled_for) return;
      const d = new Date(p.scheduled_for);
      scheduledTimes.push(d);
      const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
      postsPerDay[dayKey] = (postsPerDay[dayKey] || 0) + 1;
    });
    
    // Also count videos we're scheduling in THIS batch (prior indices)
    const batchScheduled: Date[] = [];
    // We store batch times in a ref-like approach using the videoIndex
    
    const now = new Date();
    const brasiliaFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
    
    // Start from tomorrow
    let candidateDay = new Date(now);
    candidateDay.setDate(candidateDay.getDate() + 1);
    
    let scheduled = 0;
    
    while (scheduled <= videoIndex) {
      const dayKey = brasiliaFormatter.format(candidateDay);
      const dayCount = (postsPerDay[dayKey] || 0);
      
      if (dayCount < MAX_POSTS_PER_DAY) {
        // Find available hour slot for this day
        for (const hour of BEST_HOURS_BRASILIA) {
          // Create date in Brasília time
          const target = new Date(candidateDay);
          // Set to midnight UTC, then adjust for Brasília hour
          const dateStr = brasiliaFormatter.format(target);
          const utcDate = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00-03:00`);
          
          // Check minimum 6h gap from all scheduled posts on this day
          const tooClose = scheduledTimes.some(st => 
            Math.abs(st.getTime() - utcDate.getTime()) < 6 * 60 * 60 * 1000
          );
          
          if (tooClose) continue;
          
          if (scheduled === videoIndex) {
            // Track this slot as taken for future iterations
            scheduledTimes.push(utcDate);
            postsPerDay[dayKey] = (postsPerDay[dayKey] || 0) + 1;
            return utcDate;
          }
          
          // Mark slot as taken for this batch
          scheduledTimes.push(utcDate);
          postsPerDay[dayKey] = (postsPerDay[dayKey] || 0) + 1;
          scheduled++;
          
          if ((postsPerDay[dayKey] || 0) >= MAX_POSTS_PER_DAY) break;
        }
      }
      
      // Move to next day
      candidateDay.setDate(candidateDay.getDate() + 1);
    }
    
    // Fallback: 1 day per video from tomorrow
    const fallback = new Date(now);
    fallback.setDate(fallback.getDate() + 1 + videoIndex);
    fallback.setHours(12, 0, 0, 0);
    return fallback;
  }, []);

  const handleVideoComplete = async (videoUrl: string) => {
    if (!currentVideoId) return;
    
    try {
      const currentVideo = renderQueue.find(v => v.id === currentVideoId);
      const shouldPublish = currentVideo?.overlay_metadata?.publish_after_render;
      
      // Auto-schedule at optimal time
      const scheduleTime = await getNextScheduleTime(completedCount);
      const scheduledFormatted = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit'
      }).format(scheduleTime);
      
      // Update post with video URL and auto-schedule
      await supabase
        .from('posts')
        .update({
          video_url: videoUrl,
          overlay_metadata: null,
          status: 'scheduled',
          scheduled_for: scheduleTime.toISOString()
        })
        .eq('id', currentVideoId);

      toast.success(`📅 Vídeo agendado para ${scheduledFormatted}`);
      
      setCompletedCount(prev => prev + 1);
      onComplete?.(currentVideoId, videoUrl);
      
      // Remove from queue and process next
      setRenderQueue(prev => prev.filter(v => v.id !== currentVideoId));
      setCurrentVideoId(null);
      reset();
      
      // Continue with next video after a small delay
      setTimeout(() => {
        if (!isPaused) {
          processNextVideo();
        }
      }, 1000);
      
    } catch (err: any) {
      console.error('Error completing video:', err);
      toast.error('Erro ao salvar vídeo');
    }
  };

  const processNextVideo = useCallback(async () => {
    const nextVideo = renderQueue.find(v => v.id !== currentVideoId);
    
    if (!nextVideo) {
      setIsRendering(false);
      if (completedCount > 0) {
        toast.success(`✅ ${completedCount} vídeo(s) renderizado(s) e agendados!`);
        notifyAgentAction('Renderização Concluída', `${completedCount} vídeo(s) renderizados e agendados automaticamente`);
        refetch();
      }
      return;
    }
    
    setCurrentVideoId(nextVideo.id);
    
    const script = nextVideo.overlay_metadata?.script;
    if (!script?.segments?.length) {
      console.error('No script segments for video:', nextVideo.id);
      setRenderQueue(prev => prev.filter(v => v.id !== nextVideo.id));
      processNextVideo();
      return;
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
      processNextVideo();
    }
  }, [renderQueue, currentVideoId, completedCount, renderFromScript, notifyAgentAction, refetch]);

  const startRendering = () => {
    unlockAudio();
    setIsRendering(true);
    setIsPaused(false);
    setCompletedCount(0);
    processNextVideo();
  };

  const pauseRendering = () => {
    setIsPaused(true);
    toast.info('Renderização pausada');
  };

  const resumeRendering = () => {
    setIsPaused(false);
    if (!isGenerating) {
      processNextVideo();
    }
  };

  // Don't render if no pending videos
  if (renderQueue.length === 0 && !isRendering) {
    return null;
  }

  const progress = renderQueue.length > 0 
    ? Math.round((completedCount / (completedCount + renderQueue.length)) * 100)
    : 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="relative z-10 mx-4 mt-2 p-4 rounded-xl border bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-pink-500/10 border-primary/30"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/20">
                <Film className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Auto-Renderização</h3>
                <p className="text-xs text-muted-foreground">
                  {isRendering 
                    ? `Processando ${completedCount + 1} de ${completedCount + renderQueue.length}...`
                    : `${renderQueue.length} vídeo(s) aguardando`
                  }
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isRendering ? (
                <>
                  {isGenerating && (
                    <Badge variant="secondary" className="gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {state.step}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={isPaused ? resumeRendering : pauseRendering}
                  >
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={startRendering}
                >
                  <Play className="h-4 w-4" />
                  Renderizar Tudo
                </Button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {isRendering && (
            <div className="space-y-1">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{completedCount} concluído(s)</span>
                <span>{renderQueue.length} restante(s)</span>
              </div>
            </div>
          )}

          {/* Current Video Info */}
          {currentVideoId && renderQueue.length > 0 && (
            <div className="p-2 rounded-lg bg-card/50 border border-border/50">
              <p className="text-xs truncate">
                {renderQueue.find(v => v.id === currentVideoId)?.overlay_metadata?.script?.title || 'Renderizando...'}
              </p>
            </div>
          )}

          {/* Completed Badge */}
          {completedCount > 0 && !isRendering && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                {completedCount} vídeo(s) renderizado(s) com sucesso!
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
