import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { HeroArticle } from "@/components/portal/HeroArticle";
import { ArticleCard, type ArticleCardData } from "@/components/portal/ArticleCard";
import { AIModelSections } from "@/components/portal/AIModelSections";
import { LiveNewsFeed } from "@/components/portal/LiveNewsFeed";
import { MostReadSidebar } from "@/components/portal/MostReadSidebar";
import { ARTICLE_CATEGORIES, formatRelativeDate, getCategoryLabel } from "@/lib/article-helpers";
import { Loader2, Sparkles, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

type ArticleListItem = ArticleCardData & { tags?: string[] | null };

const PortalHome = () => {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("articles")
        .select(
          "slug,title,excerpt,hero_image_url,category,published_at,reading_time_minutes,is_featured,view_count,tags"
        )
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
  const sideHeadlines = rest.slice(0, 3);
  const topGrid = rest.slice(3, 9);
  const remaining = rest.slice(9);

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-3 md:py-12">
        {/* SEO: H1 semântico (uma vez por página) */}
        <h1 className="sr-only">Neural Update — Notícias de tecnologia, IA e futuro</h1>

        {/* Mobile-only: chips de categoria (scroll-x) — substitui menu hambúrguer afundado */}
        <nav
          aria-label="Atalhos de categorias"
          className="md:hidden -mx-4 mb-3 px-4 overflow-x-auto scrollbar-hide"
        >
          <div className="flex items-center gap-2 w-max pb-1">
            {ARTICLE_CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/categoria/${cat.slug}`}
                className="shrink-0 inline-flex items-center px-3 h-7 rounded-full bg-card/60 border border-border/60 text-[11px] font-semibold text-foreground/85 hover:border-primary/50 hover:text-primary transition-colors whitespace-nowrap"
              >
                {cat.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Editorial badge above hero — compacta no mobile */}
        <div className="mb-3 md:mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-full bg-card/60 border border-border/60 text-[9px] md:text-[10px] uppercase tracking-[0.18em] md:tracking-[0.22em] text-muted-foreground backdrop-blur whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-primary portal-live-dot" />
              Ao vivo
            </span>
            <span className="text-[9px] md:text-[10px] uppercase tracking-[0.18em] md:tracking-[0.22em] text-muted-foreground truncate">
              {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground hidden md:inline">
            Por Agente Horvat
          </span>
        </div>

        {/* HERO + SIDE HEADLINES — layout tipo Olhar Digital (2/3 + 1/3 desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <HeroArticle article={hero} />
          </div>
          <aside className="lg:col-span-1 flex flex-col gap-3">
            {sideHeadlines.map((a) => (
              <Link
                key={a.slug}
                to={`/noticia/${a.slug}`}
                className="group flex gap-3 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm p-3 hover:border-primary/40 transition-all"
              >
                {a.hero_image_url ? (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-border/40">
                    <img
                      src={a.hero_image_url}
                      alt={a.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg portal-gradient opacity-40" />
                )}
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[9px] font-bold text-primary uppercase tracking-[0.18em]">
                    {getCategoryLabel(a.category)}
                  </span>
                  <h3 className="font-display font-semibold text-sm leading-snug mt-1 group-hover:text-primary transition-colors line-clamp-3">
                    {a.title}
                  </h3>
                  <span className="text-[10px] text-muted-foreground mt-auto pt-1.5">
                    {formatRelativeDate(a.published_at)}
                  </span>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity self-start mt-1" />
              </Link>
            ))}
          </aside>
        </div>

        {/* Live news feed — "última hora" denso */}
        <LiveNewsFeed articles={articles} limit={12} />

        {/* Latest news grid + Most read sidebar */}
        <section className="mt-10 md:mt-20 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <SectionHeader eyebrow="Últimas" title="Notícias mais recentes" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {topGrid.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className="lg:sticky lg:top-28">
              <MostReadSidebar />
            </div>
          </div>
        </section>

        {/* Notícias por modelo de IA (ChatGPT / Gemini / Claude / Grok / Llama) */}
        <AIModelSections articles={articles} />

        {/* Per-category sections */}
        {ARTICLE_CATEGORIES.slice(0, 5).map((cat) => {
          const inCat = articles.filter((a) => a.category === cat.slug).slice(0, 4);
          if (inCat.length === 0) return null;
          return (
            <section key={cat.slug} className="mt-12 md:mt-20">
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
