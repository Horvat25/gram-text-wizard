import { useState, useEffect } from 'react';
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
  RefreshCw,
  Smartphone,
  AlertCircle
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
    currentRenderProgress,
    startRendering,
    pauseRendering,
    resumeRendering,
    refetchPendingVideos,
  } = useVideoRendering();

  const [showMobileTip, setShowMobileTip] = useState(false);
  
  // Check if on mobile
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // Show mobile tip when starting rendering
  useEffect(() => {
    if (isRendering && isMobile) {
      setShowMobileTip(true);
    }
  }, [isRendering, isMobile]);
  
  // Always show the panel - use refetch to check for videos
  const hasPendingVideos = renderQueue.length > 0;
  const showPanel = hasPendingVideos || isRendering || completedCount > 0;

  const currentVideo = renderQueue.find(v => v.id === currentVideoId);
  
  // If nothing to show, render a minimal "check for videos" panel
  if (!showPanel) {
    return (
      <Card className="border-muted bg-muted/30">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Film className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Nenhum vídeo pendente para renderizar
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchPendingVideos()}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Verificar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        <Card className="border-primary/30 bg-gradient-to-r from-cyan-500/5 via-purple-500/5 to-pink-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
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
                        ? `${renderQueue.length} vídeo(s) aguardando renderização`
                        : 'Nenhum vídeo pendente'
                    }
                  </CardDescription>
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                {!isRendering && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => refetchPendingVideos()}
                    title="Atualizar lista"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                
                {isRendering ? (
                  <>
                    {isGenerating && (
                      <Badge variant="secondary" className="gap-1 text-xs">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="hidden sm:inline">{currentStep}</span>
                        <span className="sm:hidden">Processando...</span>
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={isPaused ? resumeRendering : pauseRendering}
                      title={isPaused ? "Continuar" : "Pausar"}
                    >
                      {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    </Button>
                  </>
                ) : renderQueue.length > 0 ? (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    onClick={startRendering}
                  >
                    <Play className="h-4 w-4" />
                    <span className="hidden sm:inline">Renderizar Tudo ({renderQueue.length})</span>
                    <span className="sm:hidden">Renderizar ({renderQueue.length})</span>
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

            {/* Mobile Rendering Tips */}
            {isRendering && isMobile && showMobileTip && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <Smartphone className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    <p className="font-medium mb-1">📱 Dicas para renderização no celular:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Mantenha o app aberto durante a renderização</li>
                      <li>Conecte o carregador para evitar que a tela apague</li>
                      <li>Desative a economia de bateria temporariamente</li>
                    </ul>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="mt-2 w-full text-xs"
                  onClick={() => setShowMobileTip(false)}
                >
                  Entendi
                </Button>
              </div>
            )}

            {/* Background Rendering Notice */}
            {isRendering && !isMobile && (
              <p className="text-xs text-muted-foreground text-center">
                💡 A renderização continua mesmo se você trocar de aba
              </p>
            )}

            {/* Video Queue List */}
            {renderQueue.length > 0 && !isRendering && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Vídeos na fila:</p>
                <div className="max-h-32 overflow-y-auto space-y-1.5">
                  {renderQueue.slice(0, 5).map((video, index) => (
                    <div 
                      key={video.id} 
                      className="flex items-center gap-2 p-2 rounded-md bg-card/50 border border-border/50 text-xs"
                    >
                      <span className="font-mono text-muted-foreground">{index + 1}.</span>
                      <span className="truncate flex-1">
                        {video.overlay_metadata?.script?.title || video.overlay_metadata?.topic || 'Sem título'}
                      </span>
                      {!video.overlay_metadata?.script?.segments?.length && (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Sem script
                        </Badge>
                      )}
                    </div>
                  ))}
                  {renderQueue.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      + {renderQueue.length - 5} mais vídeo(s)
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
