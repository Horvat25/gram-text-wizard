import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { HeroArticle } from "@/components/portal/HeroArticle";
import { ArticleCard, type ArticleCardData } from "@/components/portal/ArticleCard";
import { ARTICLE_CATEGORIES, getCategoryLabel } from "@/lib/article-helpers";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

const PortalHome = () => {
  const [articles, setArticles] = useState<ArticleCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("articles")
        .select("slug,title,excerpt,hero_image_url,category,published_at,reading_time_minutes,is_featured")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(40);
      setArticles((data ?? []) as ArticleCardData[]);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <PortalLayout>
        <div className="container mx-auto px-4 py-20 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  if (articles.length === 0) {
    return (
      <PortalLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-3xl font-bold mb-3">Em breve</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            O Neural Update está sendo preparado. Em instantes, as primeiras notícias estarão aqui, geradas pelo Agente Horvat.
          </p>
        </div>
      </PortalLayout>
    );
  }

  const [hero, ...rest] = articles;
  const topGrid = rest.slice(0, 6);
  const remaining = rest.slice(6);

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-6 md:py-10">
        <HeroArticle article={hero} />

        <section className="mt-12">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-2xl font-bold">Últimas notícias</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {topGrid.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </section>

        {ARTICLE_CATEGORIES.slice(0, 5).map((cat) => {
          const inCat = articles.filter((a) => a.category === cat.slug).slice(0, 4);
          if (inCat.length === 0) return null;
          return (
            <section key={cat.slug} className="mt-16">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="text-2xl font-bold">{cat.label}</h2>
                <Link
                  to={`/categoria/${cat.slug}`}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  Ver todas →
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {inCat.map((a) => (
                  <ArticleCard key={a.slug} article={a} />
                ))}
              </div>
            </section>
          );
        })}

        {remaining.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl font-bold mb-6">Mais notícias</h2>
            <div className="max-w-3xl">
              {remaining.map((a) => (
                <ArticleCard key={a.slug} article={a} variant="horizontal" />
              ))}
            </div>
          </section>
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalHome;
