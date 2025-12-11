import { useState, useMemo } from "react";
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
} from "lucide-react";
import { format, parseISO, isPast, isToday, isTomorrow, addMinutes, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Post } from "@/hooks/usePosts";
import { toast } from "sonner";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

interface PublicationQueueTabProps {
  posts: Post[];
  onPublish: (id: string) => Promise<boolean>;
  onReschedule: (id: string, newDate: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onUpdate: (id: string, updates: Partial<Post>) => Promise<boolean>;
}

// Brasília timezone offset (UTC-3)
const BRASILIA_OFFSET = -3;

// Convert local datetime-local input to UTC ISO string for storage
const localToUTC = (localDatetime: string): string => {
  if (!localDatetime) return "";
  // datetime-local gives us the local time the user selected
  // We interpret it as Brasília time and convert to UTC
  const date = new Date(localDatetime);
  // Adjust for Brasília offset (add 3 hours to get UTC)
  const utcDate = addMinutes(date, -BRASILIA_OFFSET * 60);
  return utcDate.toISOString();
};

// Convert UTC ISO string from database to local Brasília time for display
const utcToBrasilia = (utcDatetime: string): Date => {
  const date = parseISO(utcDatetime);
  // Adjust for Brasília offset (subtract 3 hours from UTC)
  return addMinutes(date, BRASILIA_OFFSET * 60);
};

// Format datetime for datetime-local input (Brasília time)
const formatForInput = (utcDatetime: string): string => {
  if (!utcDatetime) return "";
  const brasiliaDate = utcToBrasilia(utcDatetime);
  return format(brasiliaDate, "yyyy-MM-dd'T'HH:mm");
};

// Format datetime for display (Brasília time)
const formatForDisplay = (utcDatetime: string, formatStr: string): string => {
  if (!utcDatetime) return "";
  const brasiliaDate = utcToBrasilia(utcDatetime);
  return format(brasiliaDate, formatStr, { locale: ptBR });
};

// Get time remaining until publication
const getTimeRemaining = (utcDatetime: string): string => {
  const brasiliaDate = utcToBrasilia(utcDatetime);
  const now = new Date();
  const diff = differenceInMinutes(brasiliaDate, now);
  
  if (diff < 0) return "Atrasado";
  if (diff < 60) return `Em ${diff} min`;
  if (diff < 1440) return `Em ${Math.floor(diff / 60)}h`;
  return `Em ${Math.floor(diff / 1440)} dias`;
};

// Get relative date label
const getDateLabel = (utcDatetime: string): string => {
  const brasiliaDate = utcToBrasilia(utcDatetime);
  if (isToday(brasiliaDate)) return "Hoje";
  if (isTomorrow(brasiliaDate)) return "Amanhã";
  return format(brasiliaDate, "dd/MM", { locale: ptBR });
};

// Get minimum datetime for scheduling (now + 5 minutes in Brasília)
const getMinDatetime = (): string => {
  const now = new Date();
  const minDate = addMinutes(now, 5);
  return format(minDate, "yyyy-MM-dd'T'HH:mm");
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
  const [isCheckingScheduler, setIsCheckingScheduler] = useState(false);
  
  const { accounts, loading: loadingAccounts } = useInstagramAccounts();
  const hasConnectedAccount = accounts.length > 0;

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

  // Posts scheduled for today (using Brasília time)
  const todayPosts = useMemo(() => {
    return scheduledPosts.filter((p) => {
      if (!p.scheduled_for) return false;
      const brasiliaDate = utcToBrasilia(p.scheduled_for);
      return isToday(brasiliaDate);
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
    
    return (
      <div className={`p-4 border rounded-lg bg-card hover:shadow-md transition-shadow ${isOverdue ? 'border-destructive/50' : ''}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={getStatusColor(post.status, isOverdue)}>
              {isOverdue ? "Atrasado" : post.status === "scheduled" ? "Agendado" : "Rascunho"}
            </Badge>
            {post.post_type && (
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

        {post.image_url && (
          <div className="mb-3">
            <img
              src={post.image_url}
              alt="Preview"
              className="w-full h-32 object-cover rounded-md"
            />
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
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
          <Button
            size="sm"
            variant="default"
            onClick={() => handlePublishNow(post)}
          >
            <Send className="h-3 w-3 mr-1" />
            Publicar
          </Button>
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
      {/* Connected Account Info */}
      {!loadingAccounts && (
        hasConnectedAccount ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <Instagram className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700 dark:text-green-400">
              Publicações serão feitas em: <strong>@{accounts[0].username || 'Conta conectada'}</strong>
            </span>
          </div>
        ) : (
          <Alert className="border-amber-500/30 bg-amber-500/5">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              Nenhuma conta conectada. Os posts serão salvos mas não publicados automaticamente no Instagram.
            </AlertDescription>
          </Alert>
        )
      )}

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
      <Dialog open={!!viewingPost} onOpenChange={() => setViewingPost(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Visualizar Post</DialogTitle>
          </DialogHeader>
          {viewingPost && (
            <div className="space-y-4">
              {viewingPost.image_url && (
                <img
                  src={viewingPost.image_url}
                  alt="Post"
                  className="w-full rounded-lg"
                />
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicationQueueTab;