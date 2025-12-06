import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
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
} from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Post } from "@/hooks/usePosts";
import { toast } from "sonner";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PublicationQueueTabProps {
  posts: Post[];
  onPublish: (id: string) => Promise<boolean>;
  onReschedule: (id: string, newDate: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onUpdate: (id: string, updates: Partial<Post>) => Promise<boolean>;
}

const PublicationQueueTab = ({
  posts,
  onPublish,
  onReschedule,
  onDelete,
  onUpdate,
}: PublicationQueueTabProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [viewMode, setViewMode] = useState<"calendar" | "list">("list");
  const [reschedulePost, setReschedulePost] = useState<Post | null>(null);
  const [newScheduleDate, setNewScheduleDate] = useState("");
  const [viewingPost, setViewingPost] = useState<Post | null>(null);
  
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

  // Posts for selected date
  const postsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return scheduledPosts.filter(
      (p) => p.scheduled_for && isSameDay(parseISO(p.scheduled_for), selectedDate)
    );
  }, [scheduledPosts, selectedDate]);

  // Dates with scheduled posts (for calendar highlighting)
  const datesWithPosts = useMemo(() => {
    return scheduledPosts
      .filter((p) => p.scheduled_for)
      .map((p) => parseISO(p.scheduled_for!));
  }, [scheduledPosts]);

  const handleReschedule = async () => {
    if (!reschedulePost || !newScheduleDate) return;
    const success = await onReschedule(reschedulePost.id, newScheduleDate);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-warning text-warning-foreground";
      case "draft":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-primary text-primary-foreground";
    }
  };

  const PostCard = ({ post, compact = false }: { post: Post; compact?: boolean }) => (
    <div
      className={`p-4 border rounded-lg bg-card hover:shadow-md transition-shadow ${
        compact ? "p-3" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={getStatusColor(post.status)}>
            {post.status === "scheduled" ? "Agendado" : "Rascunho"}
          </Badge>
          {post.post_type && (
            <Badge variant="outline" className="text-xs capitalize">
              {post.post_type}
            </Badge>
          )}
        </div>
        {post.scheduled_for && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(parseISO(post.scheduled_for), "dd/MM HH:mm", { locale: ptBR })}
          </span>
        )}
      </div>

      <p className={`text-sm mb-3 ${compact ? "line-clamp-2" : "line-clamp-3"}`}>
        {post.caption}
      </p>

      {post.image_url && !compact && (
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
            setNewScheduleDate(post.scheduled_for || "");
          }}
        >
          <CalendarDays className="h-3 w-3 mr-1" />
          Reagendar
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
                <p className="text-2xl font-bold">{postsForSelectedDate.length}</p>
                <p className="text-xs text-muted-foreground">Hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <ListOrdered className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{queuedPosts.length}</p>
                <p className="text-xs text-muted-foreground">Na fila</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2">
        <Button
          variant={viewMode === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("list")}
        >
          <ListOrdered className="h-4 w-4 mr-2" />
          Lista
        </Button>
        <Button
          variant={viewMode === "calendar" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("calendar")}
        >
          <CalendarDays className="h-4 w-4 mr-2" />
          Calendário
        </Button>
      </div>

      {viewMode === "calendar" ? (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Calendar */}
          <Card>
            <CardHeader>
              <CardTitle>Calendário de Publicações</CardTitle>
              <CardDescription>
                Selecione um dia para ver os posts agendados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={ptBR}
                modifiers={{
                  hasPost: datesWithPosts,
                }}
                modifiersStyles={{
                  hasPost: {
                    backgroundColor: "hsl(var(--primary) / 0.2)",
                    borderRadius: "50%",
                  },
                }}
                className="rounded-md border"
              />
            </CardContent>
          </Card>

          {/* Posts for selected date */}
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedDate
                  ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR })
                  : "Selecione uma data"}
              </CardTitle>
              <CardDescription>
                {postsForSelectedDate.length} post(s) agendado(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {postsForSelectedDate.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum post agendado para este dia</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {postsForSelectedDate.map((post) => (
                    <PostCard key={post.id} post={post} compact />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Scheduled Posts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-warning" />
                Posts Agendados
              </CardTitle>
              <CardDescription>
                Ordenados por data de publicação
              </CardDescription>
            </CardHeader>
            <CardContent>
              {scheduledPosts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum post agendado</p>
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
      )}

      {/* Reschedule Dialog */}
      <Dialog open={!!reschedulePost} onOpenChange={() => setReschedulePost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar Post</DialogTitle>
            <DialogDescription>
              Selecione a nova data e hora para publicação
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nova data e hora</Label>
              <Input
                type="datetime-local"
                value={newScheduleDate}
                onChange={(e) => setNewScheduleDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setReschedulePost(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button onClick={handleReschedule} className="flex-1">
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
                <p className="text-sm text-muted-foreground">
                  Agendado para:{" "}
                  {format(parseISO(viewingPost.scheduled_for), "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  })}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicationQueueTab;
