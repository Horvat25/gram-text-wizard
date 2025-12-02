import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, isAfter, isBefore, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, CheckCircle, XCircle, FileText, BarChart3, Search, Filter, X, Eye, Edit } from "lucide-react";
import { loadPosts, getMetricsForPost, saveMetrics } from "@/lib/local-storage";
import { toast } from "sonner";

interface Post {
  id: string;
  caption: string;
  hashtags: string[];
  post_type?: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  image_url?: string;
}

interface PostHistoryProps {
  refreshTrigger: number;
  onEditPost?: (post: Post) => void;
  onViewPost?: (post: Post) => void;
}

const PostHistory = ({ refreshTrigger, onEditPost, onViewPost }: PostHistoryProps) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [metricsForm, setMetricsForm] = useState({
    likes: "",
    comments: "",
    saves: "",
    reach: "",
  });

  useEffect(() => {
    fetchPosts();
  }, [refreshTrigger]);

  useEffect(() => {
    applyFilters();
  }, [posts, searchQuery, dateFilter, typeFilter, statusFilter]);

  const fetchPosts = () => {
    try {
      const loadedPosts = loadPosts();
      setPosts(loadedPosts);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...posts];

    // Busca por texto
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (post) =>
          post.caption.toLowerCase().includes(query) ||
          post.hashtags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Filtro por data
    if (dateFilter !== "all") {
      const now = new Date();
      filtered = filtered.filter((post) => {
        const postDate = new Date(post.created_at);
        switch (dateFilter) {
          case "today":
            return startOfDay(postDate).getTime() === startOfDay(now).getTime();
          case "week":
            return isAfter(postDate, subDays(now, 7));
          case "month":
            return isAfter(postDate, subDays(now, 30));
          default:
            return true;
        }
      });
    }

    // Filtro por tipo
    if (typeFilter !== "all") {
      filtered = filtered.filter((post) => post.post_type === typeFilter);
    }

    // Filtro por status
    if (statusFilter !== "all") {
      filtered = filtered.filter((post) => post.status === statusFilter);
    }

    setFilteredPosts(filtered);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDateFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
  };

  const hasActiveFilters = searchQuery || dateFilter !== "all" || typeFilter !== "all" || statusFilter !== "all";

  const handleAddMetrics = (postId: string) => {
    const existingMetrics = getMetricsForPost(postId);
    if (existingMetrics) {
      setMetricsForm({
        likes: existingMetrics.likes_count.toString(),
        comments: existingMetrics.comments_count.toString(),
        saves: existingMetrics.saves_count.toString(),
        reach: existingMetrics.reach.toString(),
      });
    }
    setSelectedPost(postId);
  };

  const handleSaveMetrics = () => {
    if (!selectedPost) return;

    try {
      saveMetrics(selectedPost, {
        likes_count: parseInt(metricsForm.likes) || 0,
        comments_count: parseInt(metricsForm.comments) || 0,
        saves_count: parseInt(metricsForm.saves) || 0,
        reach: parseInt(metricsForm.reach) || 0,
        engagement_rate: 0, // Calculated automatically
      });

      toast.success("Métricas salvas com sucesso!");
      setSelectedPost(null);
      setMetricsForm({ likes: "", comments: "", saves: "", reach: "" });
      fetchPosts(); // Refresh to show updated metrics
    } catch (error) {
      console.error("Error saving metrics:", error);
      toast.error("Erro ao salvar métricas");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "published":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "scheduled":
        return <Clock className="h-4 w-4 text-warning" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: "Rascunho",
      scheduled: "Agendado",
      published: "Publicado",
      failed: "Falhou",
    };
    return labels[status] || status;
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case "published":
        return "default";
      case "scheduled":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Histórico de Posts
        </CardTitle>
        <CardDescription>
          {filteredPosts.length} de {posts.length} posts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filtros */}
        <div className="space-y-3 mb-6">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por texto ou hashtag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filtros inline */}
          <div className="grid grid-cols-3 gap-2">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as datas</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Últimos 7 dias</SelectItem>
                <SelectItem value="month">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos tipos</SelectItem>
                <SelectItem value="engajamento">Engajamento</SelectItem>
                <SelectItem value="educacional">Educacional</SelectItem>
                <SelectItem value="storytelling">Storytelling</SelectItem>
                <SelectItem value="viral">Viral</SelectItem>
                <SelectItem value="vendas">Vendas</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="scheduled">Agendado</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Limpar filtros */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Lista de posts */}
        {posts.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum post criado ainda
          </p>
        ) : filteredPosts.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum post encontrado com os filtros aplicados
          </p>
        ) : (
          <div className="space-y-4">
            {filteredPosts.map((post) => {
              const metrics = getMetricsForPost(post.id);
              return (
                <div
                  key={post.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusIcon(post.status)}
                      <Badge variant={getStatusVariant(post.status)}>
                        {getStatusLabel(post.status)}
                      </Badge>
                      {post.post_type && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {post.post_type}
                        </Badge>
                      )}
                      {metrics && (
                        <Badge variant="outline" className="text-xs">
                          {metrics.engagement_rate.toFixed(1)}% eng.
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(post.created_at), "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                  <p className="text-sm line-clamp-3 mb-2">{post.caption}</p>
                  {post.hashtags && post.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {post.hashtags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                        >
                          #{tag}
                        </span>
                      ))}
                      {post.hashtags.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{post.hashtags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  {post.scheduled_for && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Agendado para:{" "}
                      {format(new Date(post.scheduled_for), "dd/MM/yyyy HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  )}
                  
                  {/* Ações do post */}
                  <div className="flex gap-2 mt-2">
                    {onViewPost && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => onViewPost(post)}
                      >
                        <Eye className="mr-2 h-3 w-3" />
                        Visualizar
                      </Button>
                    )}
                    {onEditPost && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => onEditPost(post)}
                      >
                        <Edit className="mr-2 h-3 w-3" />
                        Editar
                      </Button>
                    )}
                  </div>

                  <Dialog open={selectedPost === post.id} onOpenChange={(open) => !open && setSelectedPost(null)}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => handleAddMetrics(post.id)}
                      >
                        <BarChart3 className="mr-2 h-3 w-3" />
                        {metrics ? "Editar Métricas" : "Adicionar Métricas"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Métricas do Post</DialogTitle>
                        <DialogDescription>
                          Adicione os dados de performance do Instagram
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="likes">Curtidas</Label>
                          <Input
                            id="likes"
                            type="number"
                            placeholder="0"
                            value={metricsForm.likes}
                            onChange={(e) => setMetricsForm({ ...metricsForm, likes: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="comments">Comentários</Label>
                          <Input
                            id="comments"
                            type="number"
                            placeholder="0"
                            value={metricsForm.comments}
                            onChange={(e) => setMetricsForm({ ...metricsForm, comments: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="saves">Salvamentos</Label>
                          <Input
                            id="saves"
                            type="number"
                            placeholder="0"
                            value={metricsForm.saves}
                            onChange={(e) => setMetricsForm({ ...metricsForm, saves: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reach">Alcance</Label>
                          <Input
                            id="reach"
                            type="number"
                            placeholder="0"
                            value={metricsForm.reach}
                            onChange={(e) => setMetricsForm({ ...metricsForm, reach: e.target.value })}
                          />
                        </div>
                        <Button onClick={handleSaveMetrics} className="w-full">
                          Salvar Métricas
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PostHistory;