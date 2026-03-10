import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useNarrativeStory } from '@/hooks/useNarrativeStory';
import { useBrandSettings } from '@/hooks/useBrandSettings';
import { unlockAudio } from '@/lib/audio-unlock';
import { toast } from 'sonner';

const MAX_RENDER_ATTEMPTS = 3;

interface VideoRenderingContextType {
  isRendering: boolean;
  currentVideoId: string | null;
  currentStep: string;
  isGenerating: boolean;
  progress: number;
  renderVideo: (postId: string) => Promise<void>;
  cancelRendering: () => void;
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
  const { settings: brandSettings } = useBrandSettings();

  const [isRendering, setIsRendering] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const renderLockRef = useRef(false);

  useEffect(() => {
    currentVideoIdRef.current = currentVideoId;
  }, [currentVideoId]);

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

      toast.success('✅ Vídeo renderizado e agendado!', { duration: 5000 });
      console.log(`[Render] ✅ Video ${videoId} complete → scheduled`);
    } catch (err: any) {
      console.error('[Render] Error completing video:', err);
      toast.error('Erro ao salvar vídeo renderizado');
    } finally {
      setCurrentVideoId(null);
      setIsRendering(false);
      renderLockRef.current = false;
      reset();
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
  };

  // ─── Manual render a single video ─────────────────────────
  const renderVideo = useCallback(async (postId: string) => {
    if (renderLockRef.current) {
      toast.warning('Já existe uma renderização em andamento. Aguarde.');
      return;
    }

    renderLockRef.current = true;
    setIsRendering(true);
    setCurrentVideoId(postId);
    unlockAudio();

    // Fetch post data
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

      // Generate script if none exists
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

        // Save script back to post
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

      // Render
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
    renderVideo,
    cancelRendering,
  };

  return (
    <VideoRenderingContext.Provider value={value}>
      {children}
    </VideoRenderingContext.Provider>
  );
}
