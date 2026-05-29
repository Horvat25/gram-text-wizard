import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CalendarDays,
  Clock,
  Send,
  Edit,
  Trash2,
  Eye,
  ListOrdered,
  CalendarCheck,
  AlertCircle,
  RefreshCw,
  Globe,
  Film,
  X,
  ChevronUp,
} from "lucide-react";
import { parseISO, isPast, differenceInMinutes } from "date-fns";
import { Post } from "@/hooks/usePosts";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useVideoRendering } from "@/contexts/VideoRenderingContext";
import { Progress } from "@/components/ui/progress";

interface PublicationQueueTabProps {
  posts: Post[];
  onPublish: (id: string) => Promise<boolean>;
  onReschedule: (id: string, newDate: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onUpdate: (id: string, updates: Partial<Post>) => Promise<boolean>;
}

// Brasília timezone (fixed display regardless of the user's device timezone)
const BRASILIA_TIMEZONE = "America/Sao_Paulo";

// Convert datetime-local input (interpreted as Brasília time) to UTC ISO string
const localToUTC = (localDatetime: string): string => {
  if (!localDatetime) return "";

  // datetime-local gives us a string like "2026-01-09T15:00"
  // We interpret this as Brasília time (America/Sao_Paulo)
  // To convert to UTC, we add 3 hours (UTC-3 -> UTC)
  const [datePart, timePart] = localDatetime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);

  const utcDate = new Date(Date.UTC(year, month - 1, day, hours + 3, minutes, 0));
  return utcDate.toISOString();
};

const getBrasiliaParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
  };
};

const brasiliaDateKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRASILIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
};

// Format datetime for datetime-local input (always shows Brasília time)
const formatForInput = (utcDatetime: string): string => {
  if (!utcDatetime) return "";
  const { year, month, day, hour, minute } = getBrasiliaParts(new Date(utcDatetime));
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

// Format datetime for display (always shows Brasília time)
const formatForDisplay = (utcDatetime: string, formatStr: string): string => {
  if (!utcDatetime) return "";

  const date = new Date(utcDatetime);

  if (formatStr === "HH:mm") {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: BRASILIA_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  if (formatStr === "dd/MM") {
    const { day, month } = getBrasiliaParts(date);
    return `${day}/${month}`;
  }

  // Supports "dd 'de' MMMM 'às' HH:mm" (used in the view dialog)
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRASILIA_TIMEZONE,
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = pick("day");
  const month = pick("month");
  const hour = pick("hour");
  const minute = pick("minute");

  return `${day} de ${month} às ${hour}:${minute}`;
};

// Get time remaining until publication (comparing real instants)
const getTimeRemaining = (utcDatetime: string): string => {
  const scheduledUtc = parseISO(utcDatetime);
  const nowUtc = new Date();
  const diff = differenceInMinutes(scheduledUtc, nowUtc);

  if (diff < 0) return "Atrasado";
  if (diff < 60) return `Em ${diff} min`;
  if (diff < 1440) return `Em ${Math.floor(diff / 60)}h`;
  return `Em ${Math.floor(diff / 1440)} dias`;
};

// Get relative date label (evaluated in Brasília timezone)
const getDateLabel = (utcDatetime: string): string => {
  const scheduledKey = brasiliaDateKey(new Date(utcDatetime));
  const now = new Date();
  const todayKey = brasiliaDateKey(now);
  const tomorrowKey = brasiliaDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  if (scheduledKey === todayKey) return "Hoje";
  if (scheduledKey === tomorrowKey) return "Amanhã";

  const { day, month } = getBrasiliaParts(new Date(utcDatetime));
  return `${day}/${month}`;
};

// Get minimum datetime for scheduling (now + 5 minutes, shown in Brasília time)
const getMinDatetime = (): string => {
  const minUtc = new Date(Date.now() + 5 * 60 * 1000);
  return formatForInput(minUtc.toISOString());
};

const PublicationQueueTab = ({
  posts,
  onPublish,
  onReschedule,
  onDelete,
}: PublicationQueueTabProps) => {
  const [reschedulePost, setReschedulePost] = useState<Post | null>(null);
  const [newScheduleDate, setNewScheduleDate] = useState("");
  const [viewingPost, setViewingPost] = useState<Post | null>(null);
  const viewDialogRef = useRef<HTMLDivElement | null>(null);
  const [showViewDialogScrollTop, setShowViewDialogScrollTop] = useState(false);
  const [isCheckingScheduler, setIsCheckingScheduler] = useState(false);
  const [isBatchRendering, setIsBatchRendering] = useState(false);
  const batchAbortRef = useRef(false);
  
  

  // When opening the preview, always start at the top so the close (X) is reachable on mobile.
  useEffect(() => {
    if (!viewingPost) return;
    requestAnimationFrame(() => {
      viewDialogRef.current?.scrollTo({ top: 0 });
      setShowViewDialogScrollTop(false);
    });
  }, [viewingPost]);
  
  const { isRendering, currentVideoId, currentStep, progress, renderVideo, cancelRendering } = useVideoRendering();

  // Check if a post needs video rendering (any reels without video_url)
  const needsVideoRendering = (post: Post) => {
    const isReels =
      post.media_type === "reels" ||
      post.media_type === "reel" ||
      post.media_type === "video" ||
      post.post_type === "reel" ||
      post.post_type === "reels";
    const hasNoVideo = !post.video_url;
    return isReels && hasNoVideo;
  };

  // Filter scheduled and draft posts
  const queuedPosts = useMemo(
    () =>
      posts
        .filter((p) => p.status === "scheduled" || p.status === "draft" || p.status === "render_failed")
        .sort((a, b) => {
          if (!a.scheduled_for) return 1;
          if (!b.scheduled_for) return -1;
          return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
        }),
    [posts]
  );

  const scheduledPosts = useMemo(
    () => queuedPosts.filter((p) => p.status === "scheduled"),
    [queuedPosts]
  );

  const draftPosts = useMemo(
    () => queuedPosts.filter((p) => p.status === "draft" || p.status === "render_failed"),
    [queuedPosts]
  );

  // Posts scheduled for today (evaluated in Brasília timezone)
  const todayPosts = useMemo(() => {
    const todayKey = brasiliaDateKey(new Date());
    return scheduledPosts.filter((p) => {
      if (!p.scheduled_for) return false;
      return brasiliaDateKey(new Date(p.scheduled_for)) === todayKey;
    });
  }, [scheduledPosts]);

  // Overdue posts (scheduled time has passed)
  const overduePosts = useMemo(() => {
    return scheduledPosts.filter((p) => {
      if (!p.scheduled_for) return false;
      return isPast(parseISO(p.scheduled_for));
    });
  }, [scheduledPosts]);

  const pendingReelsCount = queuedPosts.filter(p => needsVideoRendering(p)).length;

  const handleReschedule = async () => {
    if (!reschedulePost || !newScheduleDate) return;
    
    // Convert local input to UTC for storage
    const utcDate = localToUTC(newScheduleDate);
    const success = await onReschedule(reschedulePost.id, utcDate);
    if (success) {
      setReschedulePost(null);
      setNewScheduleDate("");
    }
  };

  const handlePublishNow = async (post: Post) => {
    if (confirm("Publicar este post agora?")) {
      await onPublish(post.id);
    }
  };

  const handleDelete = async (post: Post) => {
    if (confirm("Excluir este post?")) {
      await onDelete(post.id);
    }
  };

  // Manually trigger the scheduler to process overdue posts
  const handleProcessScheduled = async () => {
    setIsCheckingScheduler(true);
    try {
      const { data, error } = await supabase.functions.invoke("scheduled-publisher");
      
      if (error) throw error;
      
      if (data.processed > 0) {
        if (data.failCount > 0) {
          const firstError = data.results?.find((result: any) => !result.success)?.error;
          toast.error(firstError || `${data.failCount} post(s) falharam ao publicar`);
        }
        if (data.successCount > 0) {
          toast.success(`${data.successCount} post(s) publicado(s)!`);
        }
      } else {
        toast.info("Nenhum post pronto para publicar");
      }
    } catch (err: any) {
      console.error("Error processing scheduled posts:", err);
      toast.error(err?.message || "Erro ao processar posts agendados");
    } finally {
      setIsCheckingScheduler(false);
    }
  };

  // Renderiza TODOS os reels pendentes sequencialmente (um por vez, pois o pipeline é pesado)
  const handleRenderAll = async () => {
    const pending = queuedPosts.filter(p => needsVideoRendering(p));
    if (pending.length === 0) {
      toast.info("Nenhum reel pendente para renderizar");
      return;
    }
    if (!confirm(`Renderizar ${pending.length} reels em sequência? Isso pode demorar alguns minutos. Eles serão agendados automaticamente nos melhores horários.`)) {
      return;
    }
    setIsBatchRendering(true);
    batchAbortRef.current = false;
    let success = 0;
    let failed = 0;
    for (let i = 0; i < pending.length; i++) {
      if (batchAbortRef.current) break;
      const post = pending[i];
      toast.info(`Renderizando ${i + 1}/${pending.length}...`, { duration: 3000 });
      try {
        // renderVideo retorna após enfileirar o pipeline; aguardamos isRendering virar false via polling do contexto
        await renderVideo(post.id);
        // Espera o ciclo terminar (max 5 min por vídeo)
        const startedAt = Date.now();
        while (Date.now() - startedAt < 5 * 60 * 1000) {
          await new Promise(r => setTimeout(r, 2000));
          // Verifica no banco se já tem video_url ou se mudou para falha
          const { data: fresh } = await supabase
            .from('posts')
            .select('video_url, status')
            .eq('id', post.id)
            .maybeSingle();
          if (fresh?.video_url) { success++; break; }
          if (fresh?.status === 'render_failed') { failed++; break; }
        }
      } catch (e) {
        console.error('[BatchRender] erro:', e);
        failed++;
      }
    }
    setIsBatchRendering(false);
    if (batchAbortRef.current) {
      toast.warning(`Renderização em lote cancelada. ${success} ok, ${failed} falharam.`);
    } else {
      toast.success(`Lote concluído: ${success} renderizados, ${failed} falharam.`);
    }
  };


  const getStatusColor = (status: string, isOverdue: boolean = false) => {
    if (isOverdue) return "bg-destructive text-destructive-foreground";
    switch (status) {
      case "scheduled":
        return "bg-warning text-warning-foreground";
      case "render_failed":
        return "bg-destructive text-destructive-foreground";
      case "draft":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-primary text-primary-foreground";
    }
  };

  const PostCard = ({ post }: { post: Post }) => {
    const isOverdue = post.scheduled_for ? isPast(parseISO(post.scheduled_for)) : false;
    const needsRendering = needsVideoRendering(post);
    const isReels = post.media_type === "reels" || post.media_type === "reel";
    const isRenderFailed = post.status === "render_failed";
    
    return (
      <div className={`p-4 border rounded-lg bg-card hover:shadow-md transition-shadow ${isOverdue ? 'border-destructive/50' : ''} ${needsRendering ? 'border-warning/50' : ''}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getStatusColor(post.status, isOverdue)}>
              {isOverdue ? "Atrasado" : post.status === "scheduled" ? "Agendado" : isRenderFailed ? "Falhou" : "Rascunho"}
            </Badge>
            {isReels && (
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
                <Film className="h-3 w-3 mr-1" />
                Reels
              </Badge>
            )}
            {needsRendering && (
              <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
                Aguardando renderização
              </Badge>
            )}
            {post.post_type && !isReels && (
              <Badge variant="outline" className="text-xs capitalize">
                {post.post_type}
              </Badge>
            )}
          </div>
          {post.scheduled_for && (
            <div className="text-right">
              <span className="text-xs font-medium text-foreground flex items-center gap-1 justify-end">
                <Clock className="h-3 w-3" />
                {formatForDisplay(post.scheduled_for, "HH:mm")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {getDateLabel(post.scheduled_for)} • {getTimeRemaining(post.scheduled_for)}
              </span>
            </div>
          )}
        </div>

        <p className="text-sm mb-3 line-clamp-3">{post.caption}</p>

        {/* Show video if available */}
        {post.video_url && (
          <div className="mb-3">
            <video
              src={post.video_url}
              className="w-full h-32 object-cover rounded-md"
              muted
              playsInline
            />
          </div>
        )}

        {/* Show image thumbnail for reels waiting for rendering, or for image posts */}
        {!post.video_url && post.image_url && (
          <div className="mb-3 relative">
            <img
              src={post.image_url}
              alt="Preview"
              className="w-full h-32 object-cover rounded-md"
            />
            {needsRendering && (
              <div className="absolute inset-0 rounded-md bg-foreground/70 flex items-center justify-center">
                <span className="text-background text-xs font-medium">Thumbnail - Vídeo não gerado</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {/* Render Video button for agent-created reels */}
          {needsRendering && (
            <Button
              size="sm"
              variant="default"
              disabled={isRendering}
              onClick={() => renderVideo(post.id)}
            >
              <Film className="h-3 w-3 mr-1" />
              {isRendering && currentVideoId === post.id ? 'Renderizando...' : 'Gerar Vídeo'}
            </Button>
          )}
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => setViewingPost(post)}
          >
            <Eye className="h-3 w-3 mr-1" />
            Ver
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setReschedulePost(post);
              setNewScheduleDate(post.scheduled_for ? formatForInput(post.scheduled_for) : getMinDatetime());
            }}
          >
            <CalendarDays className="h-3 w-3 mr-1" />
            {post.status === "draft" ? "Agendar" : "Reagendar"}
          </Button>
          {/* Only show Publish if not needing rendering */}
          {!needsRendering && (
            <Button
              size="sm"
              variant="default"
              onClick={() => handlePublishNow(post)}
            >
              <Send className="h-3 w-3 mr-1" />
              Publicar
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleDelete(post)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">

      {/* Timezone Info */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="h-4 w-4" />
          <span>Fuso horário: <strong>Brasília (UTC-3)</strong></span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleProcessScheduled}
          disabled={isCheckingScheduler}
        >
          {isCheckingScheduler ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Processar Agendados
        </Button>
      </div>

      {/* Render Status (shown only when rendering) */}
      {isRendering && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Film className="h-5 w-5 text-primary animate-pulse" />
                <div>
                  <p className="text-sm font-medium">Renderizando vídeo...</p>
                  <p className="text-xs text-muted-foreground">{currentStep || 'Preparando...'}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={cancelRendering} className="h-7 text-xs">
                Cancelar
              </Button>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Pending reels info */}
      {pendingReelsCount > 0 && (
        <Alert>
          <Film className="h-4 w-4" />
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>
              <strong>{pendingReelsCount} reels</strong> aguardando renderização. Renderize um por um ou em lote.
            </span>
            <div className="flex gap-2">
              {isBatchRendering ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => { batchAbortRef.current = true; }}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancelar lote
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  disabled={isRendering}
                  onClick={handleRenderAll}
                >
                  <Film className="h-3 w-3 mr-1" />
                  Renderizar todos ({pendingReelsCount})
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Overdue Posts Alert */}
      {overduePosts.length > 0 && (
        <Alert className="border-destructive/50 bg-destructive/10">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <AlertDescription className="text-destructive">
            <strong>{overduePosts.length} post(s) atrasado(s)!</strong> Clique em "Processar Agendados" para publicar ou reagende.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{scheduledPosts.length}</p>
                <p className="text-xs text-muted-foreground">Agendados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Edit className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{draftPosts.length}</p>
                <p className="text-xs text-muted-foreground">Rascunhos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CalendarCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{todayPosts.length}</p>
                <p className="text-xs text-muted-foreground">Hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${overduePosts.length > 0 ? 'bg-destructive/10' : 'bg-success/10'}`}>
                <ListOrdered className={`h-5 w-5 ${overduePosts.length > 0 ? 'text-destructive' : 'text-success'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{overduePosts.length}</p>
                <p className="text-xs text-muted-foreground">Atrasados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Posts Lists */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Scheduled Posts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              Posts Agendados
            </CardTitle>
            <CardDescription>
              Ordenados por data de publicação (Horário de Brasília)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {scheduledPosts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum post agendado</p>
                <p className="text-xs mt-1">Crie um post e agende para publicação</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {scheduledPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Draft Posts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-muted-foreground" />
              Rascunhos
            </CardTitle>
            <CardDescription>Posts aguardando agendamento ou nova renderização manual</CardDescription>
          </CardHeader>
          <CardContent>
            {draftPosts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Edit className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum rascunho</p>
                <p className="text-xs mt-1">Salve posts como rascunho para editar depois</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {draftPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reschedule Dialog */}
      <Dialog open={!!reschedulePost} onOpenChange={() => setReschedulePost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reschedulePost?.status === "draft" ? "Agendar Post" : "Reagendar Post"}
            </DialogTitle>
            <DialogDescription>
              Selecione a data e hora para publicação (Horário de Brasília)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Data e hora (Brasília - UTC-3)
              </Label>
              <Input
                type="datetime-local"
                value={newScheduleDate}
                onChange={(e) => setNewScheduleDate(e.target.value)}
                min={getMinDatetime()}
              />
              <p className="text-xs text-muted-foreground">
                O post será publicado automaticamente no horário selecionado
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setReschedulePost(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleReschedule} 
                className="flex-1"
                disabled={!newScheduleDate}
              >
                <CalendarCheck className="h-4 w-4 mr-2" />
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Post Dialog */}
      <Dialog open={!!viewingPost} onOpenChange={(open) => !open && setViewingPost(null)}>
        <DialogContent
          ref={viewDialogRef}
          className="max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain"
          onScroll={(e) => setShowViewDialogScrollTop(e.currentTarget.scrollTop > 80)}
        >
          <DialogHeader>
            <DialogTitle>Visualizar Post</DialogTitle>
            <DialogDescription className="sr-only">
              Pré-visualização do post (imagem, vídeo ou carousel).
            </DialogDescription>
          </DialogHeader>
          {viewingPost && (
            <div className="space-y-4">
              {/* Imagem */}
              {viewingPost.image_url && (
                <img
                  src={viewingPost.image_url}
                  alt="Post"
                  className="w-full rounded-lg object-cover max-h-[400px]"
                />
              )}
              
              {/* Vídeo */}
              {viewingPost.video_url && (
                <video
                  src={viewingPost.video_url}
                  controls
                  className="w-full rounded-lg max-h-[400px]"
                />
              )}
              
              {/* Carousel */}
              {viewingPost.carousel_images && viewingPost.carousel_images.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {viewingPost.carousel_images.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`Carousel ${i + 1}`}
                      className="w-full rounded-lg object-cover aspect-square"
                    />
                  ))}
                </div>
              )}
              
              {/* Sem mídia */}
              {!viewingPost.image_url && !viewingPost.video_url && (!viewingPost.carousel_images || viewingPost.carousel_images.length === 0) && (
                <div className="w-full h-48 rounded-lg bg-muted/50 flex items-center justify-center">
                  <p className="text-muted-foreground text-sm">Sem mídia</p>
                </div>
              )}
              
              <p className="text-sm whitespace-pre-wrap">{viewingPost.caption}</p>
              {(() => {
                const metadata = (viewingPost.overlay_metadata as any) || {};
                const scriptText = typeof metadata?.narration?.script === "string"
                  ? metadata.narration.script
                  : typeof metadata?.narration === "string"
                    ? metadata.narration
                    : "";
                const segments = Array.isArray(metadata?.narration?.segments)
                  ? metadata.narration.segments
                  : Array.isArray(metadata?.segments)
                    ? metadata.segments
                    : [];

                if (!scriptText && segments.length === 0) return null;

                return (
                  <div className="space-y-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Roteiro
                    </p>
                    {scriptText && <p className="text-sm whitespace-pre-wrap">{scriptText}</p>}
                    {segments.length > 0 && (
                      <div className="space-y-2">
                        {segments.map((segment: any, index: number) => (
                          <div key={`view-script-${index}`} className="rounded-md border bg-background p-2">
                            <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>Bloco {index + 1}</span>
                              <span>{segment?.duration || 0}s</span>
                            </div>
                            <p className="text-xs whitespace-pre-wrap">{segment?.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {viewingPost.hashtags && viewingPost.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {viewingPost.hashtags.map((tag, i) => (
                    <Badge key={i} variant="secondary">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}
              {viewingPost.scheduled_for && (
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Agendado para:
                  </p>
                  <p className="text-lg font-bold">
                    {formatForDisplay(viewingPost.scheduled_for, "dd 'de' MMMM 'às' HH:mm")}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Horário de Brasília (UTC-3)
                  </p>
                </div>
              )}
              
              {/* Botão de fechar para mobile */}
              <Button 
                onClick={() => setViewingPost(null)} 
                className="w-full mt-4"
                variant="outline"
              >
                <X className="h-4 w-4 mr-2" />
                Fechar
              </Button>
            </div>
          )}

          {/* Botão flutuante para voltar ao topo (quando estiver scrollado) */}
          {showViewDialogScrollTop && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="fixed bottom-6 right-6 z-[60] rounded-full shadow-lg"
              onClick={() => viewDialogRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <ChevronUp className="h-4 w-4" />
              <span className="sr-only">Voltar ao topo</span>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicationQueueTab;