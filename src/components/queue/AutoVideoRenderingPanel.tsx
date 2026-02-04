import { motion, AnimatePresence } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Film, 
  Loader2, 
  CheckCircle2, 
  Play,
  Pause,
  RefreshCw
} from 'lucide-react';
import { useVideoRendering } from '@/contexts/VideoRenderingContext';

export default function AutoVideoRenderingPanel() {
  const {
    renderQueue,
    isRendering,
    isPaused,
    currentVideoId,
    completedCount,
    currentStep,
    isGenerating,
    progress,
    startRendering,
    pauseRendering,
    resumeRendering,
    refetchPendingVideos,
  } = useVideoRendering();

  // Don't render if no pending videos and not rendering
  if (renderQueue.length === 0 && !isRendering && completedCount === 0) {
    return null;
  }

  const currentVideo = renderQueue.find(v => v.id === currentVideoId);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <Card className="border-primary/30 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Film className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Auto-Renderização</CardTitle>
                  <CardDescription className="text-xs">
                    {isRendering 
                      ? `Processando ${completedCount + 1} de ${completedCount + renderQueue.length}...`
                      : renderQueue.length > 0
                        ? `${renderQueue.length} vídeo(s) aguardando`
                        : 'Nenhum vídeo pendente'
                    }
                  </CardDescription>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {!isRendering && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => refetchPendingVideos()}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                
                {isRendering ? (
                  <>
                    {isGenerating && (
                      <Badge variant="secondary" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {currentStep}
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
                ) : renderQueue.length > 0 ? (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={startRendering}
                  >
                    <Play className="h-4 w-4" />
                    Renderizar Tudo
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0 space-y-3">
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
            {currentVideo && (
              <div className="p-2 rounded-lg bg-card/50 border border-border/50">
                <p className="text-xs truncate">
                  {currentVideo.overlay_metadata?.script?.title || 'Renderizando...'}
                </p>
              </div>
            )}

            {/* Paused State */}
            {isPaused && isRendering && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Pause className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Pausado - Clique em Play para continuar
                </span>
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

            {/* Background Rendering Notice */}
            {isRendering && (
              <p className="text-xs text-muted-foreground text-center">
                💡 A renderização continua mesmo se você trocar de aba
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
