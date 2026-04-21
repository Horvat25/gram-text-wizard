import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { HeroArticle } from "@/components/portal/HeroArticle";
import { ArticleCard, type ArticleCardData } from "@/components/portal/ArticleCard";
import { AIModelSections } from "@/components/portal/AIModelSections";
import { ARTICLE_CATEGORIES } from "@/lib/article-helpers";
import { Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

type ArticleListItem = ArticleCardData & { tags?: string[] | null };

const PortalHome = () => {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("articles")
        .select("slug,title,excerpt,hero_image_url,category,published_at,reading_time_minutes,is_featured,tags")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(40);
      setArticles((data ?? []) as ArticleListItem[]);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <PortalLayout>
        <div className="container mx-auto px-4 py-32 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  if (articles.length === 0) {
    return (
      <PortalLayout>
        <div className="container mx-auto px-4 py-24 text-center max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-[10px] uppercase tracking-[0.22em] text-primary mb-6">
            <Sparkles className="h-3 w-3" /> Newsroom em preparação
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05] mb-4">
            <span className="portal-gradient-text">Em breve</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
            O Neural Update está sendo preparado. Em instantes, as primeiras notícias estarão aqui,
            geradas e curadas em tempo real pelo Agente Horvat.
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
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Editorial badge above hero */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card/60 border border-border/60 text-[10px] uppercase tracking-[0.22em] text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary portal-live-dot" />
              Edição ao vivo
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground hidden md:inline">
            Por Agente Horvat
          </span>
        </div>

        <HeroArticle article={hero} />

        {/* Latest news grid */}
        <section className="mt-16 md:mt-20">
          <SectionHeader eyebrow="Últimas" title="Notícias mais recentes" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {topGrid.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </section>

        {/* Notícias por modelo de IA (ChatGPT / Gemini / Claude / Grok / Llama) */}
        <AIModelSections articles={articles} />

        {/* Per-category sections */}
        {ARTICLE_CATEGORIES.slice(0, 5).map((cat) => {
          const inCat = articles.filter((a) => a.category === cat.slug).slice(0, 4);
          if (inCat.length === 0) return null;
          return (
            <section key={cat.slug} className="mt-20">
              <SectionHeader
                eyebrow="Editoria"
                title={cat.label}
                action={
                  <Link
                    to={`/categoria/${cat.slug}`}
                    className="text-xs font-semibold text-primary hover:underline uppercase tracking-[0.18em]"
                  >
                    Ver todas →
                  </Link>
                }
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {inCat.map((a) => (
                  <ArticleCard key={a.slug} article={a} />
                ))}
              </div>
            </section>
          );
        })}

        {remaining.length > 0 && (
          <section className="mt-20">
            <SectionHeader eyebrow="Arquivo" title="Mais notícias" />
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

/* ────────── Local helpers ────────── */

const SectionHeader = ({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) => (
  <div className="mb-8">
    <div className="portal-divider mb-5" />
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">
          / {eyebrow}
        </p>
        <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
          {title}
        </h2>
      </div>
      {action}
    </div>
  </div>
);

export default PortalHome;
