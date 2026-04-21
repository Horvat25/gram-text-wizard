import { useEffect, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { ArticleCard, type ArticleCardData } from "@/components/portal/ArticleCard";
import {
  formatArticleDate,
  getCategoryLabel,
  renderMarkdown,
} from "@/lib/article-helpers";
import { Clock, Eye, ExternalLink, Loader2 } from "lucide-react";

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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: seoDesc,
    image: seoImage ? [seoImage] : undefined,
    datePublished: article.published_at,
    dateModified: article.published_at,
    author: { "@type": "Person", name: article.author_name },
    publisher: {
      "@type": "Organization",
      name: "Neural Update",
      logo: { "@type": "ImageObject", url: `${window.location.origin}/favicon.ico` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": window.location.href },
  };

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
      <article className="container mx-auto px-4 py-8 md:py-12 max-w-3xl">
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

        <div className="flex flex-wrap items-center gap-4 mt-6 text-sm text-muted-foreground border-y border-border py-4">
          <span className="font-medium text-foreground">Por {article.author_name}</span>
          <span>•</span>
          <span>{formatArticleDate(article.published_at)}</span>
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

        <div
          className="article-body prose prose-lg max-w-none dark:prose-invert prose-headings:font-bold prose-a:text-primary"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
        />

        {article.source_url && article.source_name && (
          <div className="mt-10 p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">
              Fonte original:{" "}
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                {article.source_name} <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        )}

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
      </article>

      {related.length > 0 && (
        <section className="container mx-auto px-4 py-12 max-w-5xl border-t border-border mt-12">
          <h2 className="text-2xl font-bold mb-6">Leia também</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {related.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </section>
      )}
    </PortalLayout>
  );
};

export default ArticlePage;
