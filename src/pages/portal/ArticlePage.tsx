import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ArticleCard, type ArticleCardData } from "@/components/portal/ArticleCard";
import { MostReadSidebar } from "@/components/portal/MostReadSidebar";
import { ShareButtons } from "@/components/portal/ShareButtons";
import { Breadcrumbs, breadcrumbsJsonLd } from "@/components/portal/Breadcrumbs";
import {
  formatArticleDate,
  getCategoryLabel,
  renderMarkdown,
} from "@/lib/article-helpers";
import { Clock, Eye, Loader2, Sparkles, ListChecks, ExternalLink, User } from "lucide-react";

interface ArticleFull extends ArticleCardData {
  id: string;
  subtitle?: string | null;
  content: string;
  author_name: string;
  view_count: number;
  tags?: string[] | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image_url?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  updated_at?: string | null;
}

const ArticlePage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<ArticleFull | null>(null);
  const [related, setRelated] = useState<ArticleCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setArticle(data as ArticleFull);

      // Increment view count (fire and forget)
      supabase.rpc("increment_article_views", { _slug: slug }).then(() => {});

      // Related: same category
      const { data: rel } = await supabase
        .from("articles")
        .select("slug,title,excerpt,hero_image_url,category,published_at,reading_time_minutes")
        .eq("status", "published")
        .eq("category", data.category)
        .neq("slug", slug)
        .order("published_at", { ascending: false })
        .limit(4);
      setRelated((rel ?? []) as ArticleCardData[]);
      setLoading(false);
    })();
  }, [slug]);

  if (notFound) return <Navigate to="/" replace />;

  if (loading || !article) {
    return (
      <PortalLayout>
        <div className="container mx-auto px-4 py-20 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  const seoTitle = article.seo_title || article.title;
  const seoDesc = article.seo_description || article.excerpt || article.title;
  const seoImage = article.og_image_url || article.hero_image_url || undefined;

  // Extract first 3 H2/H3 headings as "Key points" for AI Search engines
  const extractKeyPoints = (md: string): string[] => {
    const lines = md.split("\n");
    const headings: string[] = [];
    for (const l of lines) {
      const m = l.match(/^#{2,3}\s+(.+)$/);
      if (m) headings.push(m[1].trim());
      if (headings.length >= 5) break;
    }
    return headings;
  };
  const keyPoints = extractKeyPoints(article.content);

  // TL;DR — short factual summary AI engines (ChatGPT, Perplexity) extract first
  const tldr =
    article.excerpt ||
    article.subtitle ||
    article.content.replace(/[#*>\-]/g, "").trim().split("\n").find((l) => l.length > 80)?.slice(0, 280) ||
    seoDesc;

  // Rich JSON-LD: NewsArticle + (optional) FAQPage when keyPoints exist.
  // Generative engines parse structured data first — this is the #1 GEO lever.
  const articleLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    alternativeHeadline: article.subtitle || undefined,
    description: seoDesc,
    abstract: tldr,
    image: seoImage ? [seoImage] : undefined,
    datePublished: article.published_at,
    dateModified: article.updated_at || article.published_at,
    author: {
      "@type": "Person",
      name: article.author_name,
      url: `${window.location.origin}/sobre`,
    },
    publisher: {
      "@type": "Organization",
      name: "Neural Update",
      logo: { "@type": "ImageObject", url: `${window.location.origin}/og-neural-update.jpg` },
      url: window.location.origin,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": window.location.href },
    articleSection: getCategoryLabel(article.category),
    keywords: article.tags?.join(", ") || undefined,
    inLanguage: "pt-BR",
    isAccessibleForFree: true,
    wordCount: article.content.split(/\s+/).length,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", "[aria-label='Resumo do artigo'] p"],
    },
    citation: article.source_url
      ? [{ "@type": "CreativeWork", name: article.source_name || "Fonte", url: article.source_url }]
      : undefined,
  };

  const breadcrumbItems = [
    { label: getCategoryLabel(article.category), href: `/categoria/${article.category}` },
    { label: article.title },
  ];
  const breadcrumbLd = breadcrumbsJsonLd(breadcrumbItems, window.location.origin);

  const jsonLd =
    keyPoints.length >= 2
      ? {
          "@context": "https://schema.org",
          "@graph": [
            articleLd,
            breadcrumbLd,
            {
              "@type": "FAQPage",
              mainEntity: keyPoints.map((q) => ({
                "@type": "Question",
                name: q,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: `Resposta detalhada na seção "${q}" deste artigo da Neural Update.`,
                },
              })),
            },
          ],
        }
      : { "@context": "https://schema.org", "@graph": [articleLd, breadcrumbLd] };

  return (
    <PortalLayout
      seo={{
        title: seoTitle,
        description: seoDesc,
        image: seoImage,
        type: "article",
        jsonLd,
      }}
    >
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <article className="lg:col-span-8 lg:col-start-2 max-w-3xl">
            <Link
              to={`/categoria/${article.category}`}
              className="inline-block text-xs font-bold text-primary uppercase tracking-wider mb-4 hover:underline"
            >
              {getCategoryLabel(article.category)}
            </Link>

            <h1 className="text-3xl md:text-5xl font-bold leading-tight">{article.title}</h1>

            {article.subtitle && (
              <p className="text-lg md:text-xl text-muted-foreground mt-4 leading-relaxed">
                {article.subtitle}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6 text-sm text-muted-foreground border-y border-border py-4">
              <span className="font-medium text-foreground inline-flex items-center gap-1.5">
                <span className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-accent inline-flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                  {article.author_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </span>
                Por {article.author_name}
              </span>
              <span>•</span>
              <span>{formatArticleDate(article.published_at)}</span>
              {article.updated_at &&
                article.published_at &&
                new Date(article.updated_at).getTime() - new Date(article.published_at).getTime() > 60_000 && (
                  <>
                    <span>•</span>
                    <span className="text-primary/80 text-xs">
                      Atualizado em {formatArticleDate(article.updated_at)}
                    </span>
                  </>
                )}
              {article.reading_time_minutes ? (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {article.reading_time_minutes} min
                  </span>
                </>
              ) : null}
              <span>•</span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> {article.view_count} leituras
              </span>
              <span className="ml-auto">
                <ShareButtons title={article.title} layout="horizontal" />
              </span>
            </div>

            {article.hero_image_url && (
              <figure className="my-8 -mx-4 md:mx-0">
                <img
                  src={article.hero_image_url}
                  alt={article.title}
                  className="w-full rounded-lg"
                />
              </figure>
            )}

        {/* TL;DR — extraído pra buscadores generativos (ChatGPT, Perplexity, Gemini) */}
        <aside
          className="mt-8 mb-3 rounded-xl border border-primary/30 bg-card/60 p-4 md:p-6 shadow-sm"
          aria-label="Resumo do artigo"
        >
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            TL;DR — em uma frase
          </div>
          <p className="text-base md:text-lg leading-relaxed text-foreground font-medium">
            {tldr}
          </p>
        </aside>

        {/* Pontos-chave — para extração por IA */}
        {keyPoints.length >= 2 && (
          <aside
            className="mb-8 rounded-lg border border-border/60 bg-card/40 p-4 md:p-5"
            aria-label="Pontos-chave do artigo"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground mb-3">
              <ListChecks className="h-3.5 w-3.5 text-primary" />
              Pontos-chave
            </div>
            <ul className="space-y-1.5">
              {keyPoints.map((p, i) => (
                <li key={i} className="text-sm text-foreground/85 flex gap-2">
                  <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <div
          className="article-body prose prose-lg max-w-none dark:prose-invert
            prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground
            prose-h2:text-[1.85rem] md:prose-h2:text-[2.15rem] prose-h2:mt-14 prose-h2:mb-6 prose-h2:px-4 prose-h2:py-3 prose-h2:rounded-lg prose-h2:border prose-h2:border-primary/25 prose-h2:bg-card/55 prose-h2:leading-tight
            prose-h3:text-[1.35rem] prose-h3:mt-10 prose-h3:mb-4 prose-h3:px-3 prose-h3:py-2 prose-h3:rounded-md prose-h3:bg-muted/35 prose-h3:text-foreground
            prose-p:leading-[1.9] prose-p:text-foreground/85 prose-p:my-5 prose-p:text-[1.06rem]
            prose-strong:text-foreground prose-strong:font-semibold
            prose-em:text-foreground/95
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:font-medium
            prose-code:text-primary prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
            prose-ul:my-6 prose-ul:space-y-2 prose-li:my-1 prose-li:marker:text-primary prose-li:leading-relaxed
            prose-ol:my-6 prose-ol:space-y-2
            prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:font-medium prose-blockquote:text-foreground prose-blockquote:my-8 prose-blockquote:text-[1.1rem] prose-blockquote:leading-relaxed prose-blockquote:shadow-sm"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
        />

        {article.tags && article.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {article.tags.map((t) => (
              <span
                key={t}
                className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

            {/* Fonte ancorada — IA Search prioriza conteúdo com citação clara */}
            {article.source_url && (
              <footer className="mt-10 pt-6 border-t border-border/60">
                <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-semibold">
                  Fonte original
                </p>
                <a
                  href={article.source_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                >
                  {article.source_name || article.source_url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Publicado em {formatArticleDate(article.published_at)} · Neural Update · Editorial assistido por IA
                </p>
              </footer>
            )}

            {/* Bloco do autor */}
            <div className="mt-10 pt-8 border-t border-border/40 flex items-start gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent inline-flex items-center justify-center shrink-0">
                <User className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                  Escrito por
                </p>
                <p className="font-display font-bold text-base">{article.author_name}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                  Estrategista de conteúdo e curador editorial do Neural Update. Acompanha as
                  fronteiras de IA, gadgets e ciência em tempo real.
                </p>
                <Link
                  to="/sobre"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline mt-2"
                >
                  Sobre o autor →
                </Link>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <ShareButtons title={article.title} layout="horizontal" />
            </div>
          </article>

          {/* Sidebar — mais lidas (sticky no desktop) */}
          <aside className="lg:col-span-3 hidden lg:block">
            <div className="sticky top-28">
              <MostReadSidebar excludeSlug={article.slug} />
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-16 pt-12 border-t border-border max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Leia também</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {related.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          </section>
        )}
      </div>
    </PortalLayout>
  );
};

export default ArticlePage;
