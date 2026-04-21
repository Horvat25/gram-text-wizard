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
import { Loader2, Plus, Eye, Edit, Trash2, Sparkles, Star, Newspaper, ImageIcon } from "lucide-react";

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
  const [regeneratingImageId, setRegeneratingImageId] = useState<string | null>(null);
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

  const regenerateImage = async (a: ArticleRow) => {
    setRegeneratingImageId(a.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: {
          prompt: `Imagem editorial fotorrealista para matéria de tecnologia: "${a.title}". Categoria: ${a.category}. Estilo cinematográfico, paleta dark com acentos neon ciano e roxo, composição editorial premium. SEM TEXTO NA IMAGEM.`,
          format: "landscape",
          applyWatermark: false,
        },
      });
      if (error) throw error;
      const imageUrl = data?.imageUrl;
      if (!imageUrl) throw new Error("Sem URL retornada");
      const { error: updErr } = await supabase
        .from("articles")
        .update({ hero_image_url: imageUrl, og_image_url: imageUrl })
        .eq("id", a.id);
      if (updErr) throw updErr;
      toast({ title: "Imagem regenerada", description: "Nova imagem aplicada ao artigo." });
      await load();
    } catch (err: any) {
      toast({ title: "Falha ao regenerar imagem", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setRegeneratingImageId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar compacta — header principal vem do AgentGenieView */}
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          )}
          Gerar artigo
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : articles.length === 0 ? (
        <Card className="p-8 text-center">
          <Plus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <h3 className="font-semibold text-sm mb-1">Nenhum artigo ainda</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Clique em "Gerar artigo" para criar o primeiro a partir do feed RSS.
          </p>
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Gerar primeiro artigo
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {articles.map((a) => (
            <Card key={a.id} className="p-2.5">
              <div className="flex gap-2.5">
                {/* Thumbnail com fallback */}
                <div className="w-16 h-16 rounded-md shrink-0 overflow-hidden bg-muted flex items-center justify-center">
                  {a.hero_image_url ? (
                    <img
                      src={a.hero_image_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Newspaper className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 mb-1 flex-wrap">
                        <Badge
                          variant={a.status === "published" ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0 h-4"
                        >
                          {a.status === "published" ? "Pub" : "Rascunho"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {a.category}
                        </Badge>
                        {a.is_featured && (
                          <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 h-4">
                            <Star className="h-2.5 w-2.5" /> Destaque
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm leading-tight line-clamp-2">{a.title}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {formatArticleDate(a.published_at)} • {a.view_count} leituras
                      </p>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => toggleFeatured(a)}
                        title={a.is_featured ? "Remover destaque" : "Marcar como destaque"}
                      >
                        <Star className={`h-3.5 w-3.5 ${a.is_featured ? "fill-yellow-500 text-yellow-500" : ""}`} />
                      </Button>
                      {a.status === "published" && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" asChild title="Ver no portal">
                          <a href={`/noticia/${a.slug}`} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => regenerateImage(a)}
                        disabled={regeneratingImageId === a.id}
                        title="Regenerar imagem com IA"
                      >
                        {regeneratingImageId === a.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditing(a)}
                        title="Editar"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handleDelete(a.id)}
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
