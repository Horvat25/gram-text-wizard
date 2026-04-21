import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ArticleCardData } from "@/components/portal/ArticleCard";
import { Bot, Sparkles, Brain, Zap, Cpu } from "lucide-react";

interface ModelDef {
  id: string;
  label: string;
  company: string;
  Icon: React.ComponentType<{ className?: string }>;
  chipClass: string;
  panelClass: string;
  backdropClass: string;
  pattern: RegExp;
}

const MODELS: ModelDef[] = [
  {
    id: "openai",
    label: "ChatGPT",
    company: "OpenAI",
    Icon: Sparkles,
    chipClass: "border-emerald-500/40 data-[active=true]:bg-emerald-500/15 data-[active=true]:text-emerald-200",
    panelClass: "border-emerald-500/30 bg-emerald-500/5",
    backdropClass: "from-emerald-500/12 via-background to-background",
    pattern: /\b(chatgpt|gpt-?\s*[345]|gpt\s*5|openai|sora|dall[\s-]?e)\b/i,
  },
  {
    id: "google",
    label: "Gemini",
    company: "Google",
    Icon: Brain,
    chipClass: "border-blue-500/40 data-[active=true]:bg-blue-500/15 data-[active=true]:text-blue-200",
    panelClass: "border-blue-500/30 bg-blue-500/5",
    backdropClass: "from-blue-500/12 via-background to-background",
    pattern: /\b(gemini|google\s*fotos|google\s*deepmind|deepmind|bard|imagen|veo|google)\b/i,
  },
  {
    id: "anthropic",
    label: "Claude",
    company: "Anthropic",
    Icon: Bot,
    chipClass: "border-amber-500/40 data-[active=true]:bg-amber-500/15 data-[active=true]:text-amber-200",
    panelClass: "border-amber-500/30 bg-amber-500/5",
    backdropClass: "from-amber-500/12 via-background to-background",
    pattern: /\b(claude|anthropic|mythos)\b/i,
  },
  {
    id: "xai",
    label: "Grok",
    company: "xAI",
    Icon: Zap,
    chipClass: "border-fuchsia-500/40 data-[active=true]:bg-fuchsia-500/15 data-[active=true]:text-fuchsia-200",
    panelClass: "border-fuchsia-500/30 bg-fuchsia-500/5",
    backdropClass: "from-fuchsia-500/12 via-background to-background",
    pattern: /\b(grok|xai|x\.ai|elon\s*musk)\b/i,
  },
  {
    id: "meta",
    label: "Llama",
    company: "Meta",
    Icon: Cpu,
    chipClass: "border-indigo-500/40 data-[active=true]:bg-indigo-500/15 data-[active=true]:text-indigo-200",
    panelClass: "border-indigo-500/30 bg-indigo-500/5",
    backdropClass: "from-indigo-500/12 via-background to-background",
    pattern: /\b(llama|meta\s*ai|meta)\b/i,
  },
];

interface ArticleWithText extends ArticleCardData {
  tags?: string[] | null;
}

function matchesModel(article: ArticleWithText, model: ModelDef): boolean {
  const haystack = [article.title, article.excerpt ?? "", (article.tags ?? []).join(" ")]
    .join(" ")
    .toLowerCase();
  return model.pattern.test(haystack);
}

interface AIModelSectionsProps {
  articles: ArticleWithText[];
}

export const AIModelSections = ({ articles }: AIModelSectionsProps) => {
  const buckets = useMemo(
    () =>
      MODELS.map((model) => ({
        model,
        items: articles.filter((a) => matchesModel(a, model)).slice(0, 4),
      })),
    [articles]
  );

  const hasAnyArticles = buckets.some((bucket) => bucket.items.length > 0);
  const defaultModel = buckets.find((bucket) => bucket.items.length > 0)?.model.id ?? MODELS[0].id;
  const [activeModelId, setActiveModelId] = useState(defaultModel);

  const activeBucket = buckets.find((bucket) => bucket.model.id === activeModelId) ?? buckets[0];
  if (!activeBucket || !hasAnyArticles) return null;

  const [featuredArticle, ...otherArticles] = activeBucket.items;

  return (
    <section
      aria-label="Notícias por empresa e modelo de IA"
      className="relative mt-16 md:mt-20 -mx-4 md:left-1/2 md:right-1/2 md:-mx-[50vw] md:w-screen border-y border-border/60 overflow-hidden"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${activeBucket.model.backdropClass}`} />
      <div className="absolute inset-0 opacity-50 pointer-events-none bg-[linear-gradient(to_right,hsl(var(--border)/0.08)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative container mx-auto px-4 py-8 md:py-10 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">
              / Últimas notícias por laboratório
            </p>
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
              ChatGPT, Gemini, Claude, Grok e Llama
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Clique em uma empresa para trocar o fundo da seção e abrir a notícia mais recente daquele ecossistema de IA.
            </p>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${activeBucket.model.panelClass}`}>
            <activeBucket.model.Icon className="h-4 w-4 text-primary" />
            <span className="font-medium">{activeBucket.model.label}</span>
            <span className="text-muted-foreground">· {activeBucket.model.company}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {buckets.map(({ model, items }) => {
            const isActive = model.id === activeModelId;
            return (
              <button
                key={model.id}
                type="button"
                data-active={isActive}
                onClick={() => setActiveModelId(model.id)}
                className={`rounded-md border bg-card/45 px-3 py-3 text-left transition-colors ${model.chipClass} ${
                  !isActive ? "text-muted-foreground hover:bg-card/70" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
                    <model.Icon className="h-3.5 w-3.5" />
                    {model.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{model.company}</div>
              </button>
            );
          })}
        </div>

        {activeBucket.items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 bg-card/30 p-5 text-sm text-muted-foreground">
            Ainda não há matérias recentes sobre <strong className="text-foreground">{activeBucket.model.company}</strong>.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            {featuredArticle && (
              <Link
                to={`/noticia/${featuredArticle.slug}`}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 min-h-[360px]"
              >
                {featuredArticle.hero_image_url ? (
                  <img
                    src={featuredArticle.hero_image_url}
                    alt={featuredArticle.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="absolute inset-0 portal-gradient opacity-25" />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/82 to-background/12" />
                <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-background/60 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-primary backdrop-blur">
                    <activeBucket.model.Icon className="h-3.5 w-3.5" />
                    {activeBucket.model.company}
                  </div>
                  <h3 className="mt-4 font-display text-2xl md:text-3xl font-bold leading-tight text-foreground max-w-2xl">
                    {featuredArticle.title}
                  </h3>
                  {featuredArticle.excerpt && (
                    <p className="mt-3 max-w-2xl text-sm md:text-base leading-relaxed text-muted-foreground line-clamp-3">
                      {featuredArticle.excerpt}
                    </p>
                  )}
                </div>
              </Link>
            )}

            <div className={`rounded-xl border p-4 md:p-5 ${activeBucket.model.panelClass}`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Mais recentes</p>
                  <h3 className="mt-1 font-display text-xl font-semibold text-foreground">{activeBucket.model.company}</h3>
                </div>
                <activeBucket.model.Icon className="h-5 w-5 text-primary" />
              </div>

              <div className="space-y-3">
                {otherArticles.length > 0 ? (
                  otherArticles.map((article) => (
                    <Link
                      key={article.slug}
                      to={`/noticia/${article.slug}`}
                      className="group block rounded-lg border border-border/60 bg-card/45 p-3 transition-colors hover:bg-card/70"
                    >
                      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{activeBucket.model.label}</div>
                      <h4 className="mt-1 text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-3">
                        {article.title}
                      </h4>
                      {article.excerpt && (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                          {article.excerpt}
                        </p>
                      )}
                    </Link>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 bg-card/35 p-4 text-sm leading-relaxed text-muted-foreground">
                    Esta empresa já tem uma manchete em destaque. As próximas matérias novas entram aqui automaticamente.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
