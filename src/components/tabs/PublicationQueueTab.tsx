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
  Instagram,
  AlertCircle,
  RefreshCw,
  Globe,
  Film,
  X,
  ChevronUp,
  Pause,
  Play,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { parseISO, isPast, differenceInMinutes } from "date-fns";
import { Post } from "@/hooks/usePosts";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
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
  onUpdate,
}: PublicationQueueTabProps) => {
  const [reschedulePost, setReschedulePost] = useState<Post | null>(null);
  const [newScheduleDate, setNewScheduleDate] = useState("");
  const [viewingPost, setViewingPost] = useState<Post | null>(null);
  const viewDialogRef = useRef<HTMLDivElement | null>(null);
  const [showViewDialogScrollTop, setShowViewDialogScrollTop] = useState(false);
  const [isCheckingScheduler, setIsCheckingScheduler] = useState(false);
  const [renderingPost, setRenderingPost] = useState<Post | null>(null);
  const [showAutoRenderWarning, setShowAutoRenderWarning] = useState(false);

  const {
    renderQueue,
    isRendering: isAutoRendering,
    isPaused,
    currentVideoId,
    completedCount,
    currentStep,
    isGenerating,
    progress: autoRenderProgress,
    currentRenderProgress,
    startRendering,
    pauseRendering,
    resumeRendering,
  } = useVideoRendering();

  // When opening the preview, always start at the top so the close (X) is reachable on mobile.
  useEffect(() => {
    if (!viewingPost) return;
    requestAnimationFrame(() => {
      viewDialogRef.current?.scrollTo({ top: 0 });
      setShowViewDialogScrollTop(false);
    });
  }, [viewingPost]);
  
  const { currentWorkspace } = useWorkspace();
  const [loadingAccounts] = useState(false);
  const hasConnectedAccount = false;

  // Check if a post needs video rendering (any reels without video_url)
  const needsVideoRendering = (post: Post) => {
    const isReels = post.media_type === "reels" || post.media_type === "reel";
    const hasNoVideo = !post.video_url;
    return isReels && hasNoVideo;
  };

  // Get script data from overlay_metadata for reels that need rendering
  // Falls back to extracting from caption if no script metadata exists
  const getReelsScript = (post: Post) => {
    if (post.overlay_metadata?.script) {
      return {
        title: post.overlay_metadata.script.title || post.overlay_metadata.topic || "Reels",
        segments: post.overlay_metadata.script.segments || [],
        topic: post.overlay_metadata.topic || "",
      };
    }
    
    // Fallback: extract topic from first line of caption
    const firstLine = (post.caption || "").split("\n")[0].replace(/[🤖🔥💡🎬✨🚀]/g, "").trim();
    return {
      title: firstLine || "Reels",
      segments: [],
      topic: firstLine || "tecnologia",
    };
  };

  // Filter scheduled and draft posts
  const queuedPosts = useMemo(
    () =>
      posts
        .filter((p) => p.status === "scheduled" || p.status === "draft")
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
    () => queuedPosts.filter((p) => p.status === "draft"),
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
        toast.success(`${data.successCount} post(s) publicado(s)!`);
      } else {
        toast.info("Nenhum post pronto para publicar");
      }
    } catch (err: any) {
      console.error("Error processing scheduled posts:", err);
      toast.error("Erro ao processar posts agendados");
    } finally {
      setIsCheckingScheduler(false);
    }
  };

  const getStatusColor = (status: string, isOverdue: boolean = false) => {
    if (isOverdue) return "bg-destructive text-destructive-foreground";
    switch (status) {
      case "scheduled":
        return "bg-warning text-warning-foreground";
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
    
    return (
      <div className={`p-4 border rounded-lg bg-card hover:shadow-md transition-shadow ${isOverdue ? 'border-destructive/50' : ''} ${needsRendering ? 'border-amber-500/50' : ''}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getStatusColor(post.status, isOverdue)}>
              {isOverdue ? "Atrasado" : post.status === "scheduled" ? "Agendado" : "Rascunho"}
            </Badge>
            {isReels && (
              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-500/30">
                <Film className="h-3 w-3 mr-1" />
                Reels
              </Badge>
            )}
            {needsRendering && (
              <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
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
              <div className="absolute inset-0 bg-black/50 rounded-md flex items-center justify-center">
                <span className="text-white text-xs font-medium">Thumbnail - Vídeo não renderizado</span>
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
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => {
                if (isAutoRendering && !isPaused) {
                  setShowAutoRenderWarning(true);
                } else {
                  setRenderingPost(post);
                }
              }}
            >
              <Film className="h-3 w-3 mr-1" />
              Gerar Vídeo
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
            <CardDescription>Posts aguardando agendamento</CardDescription>
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