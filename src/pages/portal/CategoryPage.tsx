import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ArticleCard, type ArticleCardData } from "@/components/portal/ArticleCard";
import { ARTICLE_CATEGORIES, getCategoryLabel } from "@/lib/article-helpers";
import { Loader2 } from "lucide-react";

const CategoryPage = () => {
  const { nome } = useParams<{ nome: string }>();
  const [articles, setArticles] = useState<ArticleCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const validCategory = ARTICLE_CATEGORIES.some((c) => c.slug === nome);

  useEffect(() => {
    if (!nome || !validCategory) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("articles")
        .select("slug,title,excerpt,hero_image_url,category,published_at,reading_time_minutes")
        .eq("status", "published")
        .eq("category", nome)
        .order("published_at", { ascending: false })
        .limit(60);
      setArticles((data ?? []) as ArticleCardData[]);
      setLoading(false);
    })();
  }, [nome, validCategory]);

  if (!validCategory) return <Navigate to="/" replace />;

  const label = getCategoryLabel(nome!);

  return (
    <PortalLayout seo={{ title: label, description: `Notícias de ${label} no Neural Update.` }}>
      <div className="container mx-auto px-4 py-10">
        <header className="mb-10 pb-6 border-b border-border">
          <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Categoria</p>
          <h1 className="text-4xl md:text-5xl font-bold">{label}</h1>
          <p className="text-muted-foreground mt-2">
            As últimas notícias e análises sobre {label.toLowerCase()}.
          </p>
        </header>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : articles.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            Nenhuma notícia publicada nesta categoria ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {articles.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default CategoryPage;
