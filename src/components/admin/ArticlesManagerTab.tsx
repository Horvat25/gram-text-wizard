import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ARTICLE_CATEGORIES, formatArticleDate, slugify } from "@/lib/article-helpers";
import { Loader2, Plus, ExternalLink, Eye, Edit, Trash2, Sparkles, Star } from "lucide-react";

interface ArticleRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  content: string;
  category: string;
  status: string;
  published_at: string | null;
  view_count: number;
  is_featured: boolean;
  hero_image_url: string | null;
  tags: string[] | null;
}

const ArticlesManagerTab = () => {
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<ArticleRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const { data } = await supabase
      .from("articles")
      .select("id,slug,title,subtitle,excerpt,content,category,status,published_at,view_count,is_featured,hero_image_url,tags")
      .eq("workspace_id", currentWorkspace.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setArticles((data ?? []) as ArticleRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  const handleGenerate = async () => {
    if (!currentWorkspace) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-article", {
        body: { workspaceId: currentWorkspace.id },
      });
      if (error) throw error;
      if (data?.skipped) {
        toast({
          title: "Sem notícias novas",
          description: data.reason ?? "Aguarde a próxima coleta de RSS.",
        });
      } else {
        toast({
          title: "Artigo gerado",
          description: data?.title ?? "Novo artigo publicado no portal.",
        });
        await load();
      }
    } catch (err: any) {
      toast({
        title: "Erro ao gerar artigo",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const newSlug = editing.slug || slugify(editing.title);
      const { error } = await supabase
        .from("articles")
        .update({
          title: editing.title,
          subtitle: editing.subtitle,
          excerpt: editing.excerpt,
          content: editing.content,
          category: editing.category,
          status: editing.status,
          slug: newSlug,
          is_featured: editing.is_featured,
          hero_image_url: editing.hero_image_url,
          published_at:
            editing.status === "published" && !editing.published_at
              ? new Date().toISOString()
              : editing.published_at,
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast({ title: "Artigo atualizado" });
      setEditing(null);
      await load();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este artigo permanentemente?")) return;
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Artigo excluído" });
      await load();
    }
  };

  const toggleFeatured = async (a: ArticleRow) => {
    await supabase.from("articles").update({ is_featured: !a.is_featured }).eq("id", a.id);
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Portal Neural Update</h2>
          <p className="text-sm text-muted-foreground">
            Artigos publicados em <code className="text-xs bg-muted px-1 rounded">neuralupdate</code>
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Gerar artigo agora
          </Button>
          <Button variant="outline" asChild>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" /> Ver portal
            </a>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : articles.length === 0 ? (
        <Card className="p-10 text-center">
          <Plus className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-semibold mb-1">Nenhum artigo ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Clique em "Gerar artigo agora" para criar o primeiro artigo a partir do feed RSS.
          </p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Gerar primeiro artigo
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex gap-4">
                {a.hero_image_url && (
                  <img
                    src={a.hero_image_url}
                    alt=""
                    className="w-24 h-24 object-cover rounded-md shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={a.status === "published" ? "default" : "secondary"}>
                          {a.status === "published" ? "Publicado" : "Rascunho"}
                        </Badge>
                        <Badge variant="outline">{a.category}</Badge>
                        {a.is_featured && (
                          <Badge variant="default" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                            <Star className="h-3 w-3 mr-1" /> Destaque
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold truncate">{a.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatArticleDate(a.published_at)} • {a.view_count} leituras • /noticia/{a.slug}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleFeatured(a)}
                        title={a.is_featured ? "Remover destaque" : "Marcar como destaque"}
                      >
                        <Star className={`h-4 w-4 ${a.is_featured ? "fill-yellow-500 text-yellow-500" : ""}`} />
                      </Button>
                      {a.status === "published" && (
                        <Button size="icon" variant="ghost" asChild title="Ver no portal">
                          <a href={`/noticia/${a.slug}`} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => setEditing(a)} title="Editar">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(a.id)}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar artigo</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Título</label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Subtítulo</label>
                <Input
                  value={editing.subtitle ?? ""}
                  onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Resumo</label>
                <Textarea
                  rows={2}
                  value={editing.excerpt ?? ""}
                  onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Categoria</label>
                  <Select
                    value={editing.category}
                    onValueChange={(v) => setEditing({ ...editing, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ARTICLE_CATEGORIES.map((c) => (
                        <SelectItem key={c.slug} value={c.slug}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Status</label>
                  <Select
                    value={editing.status}
                    onValueChange={(v) => setEditing({ ...editing, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Rascunho</SelectItem>
                      <SelectItem value="published">Publicado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Imagem hero (URL)</label>
                <Input
                  value={editing.hero_image_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, hero_image_url: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Conteúdo (Markdown)</label>
                <Textarea
                  rows={14}
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArticlesManagerTab;
