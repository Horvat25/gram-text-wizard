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

  const defaultModel = buckets.find((bucket) => bucket.items.length > 0)?.model.id ?? MODELS[0].id;
  const [activeModelId, setActiveModelId] = useState(defaultModel);

  const activeBucket = buckets.find((bucket) => bucket.model.id === activeModelId) ?? buckets[0];
  if (!activeBucket) return null;

  return (
    <section aria-label="Notícias por empresa e modelo de IA" className="relative mt-20 left-1/2 right-1/2 -mx-[50vw] w-screen border-y border-border/60">
      <div className={`absolute inset-0 bg-gradient-to-br ${activeBucket.model.backdropClass}`} />
      <div className="absolute inset-0 opacity-50 pointer-events-none bg-[linear-gradient(to_right,hsl(var(--border)/0.08)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative container mx-auto px-4 py-8 md:py-10 space-y-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">
              / Modelos e criadoras
            </p>
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
              IA por laboratório
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              Clique na empresa para trocar o fundo da seção e ver as matérias mais recentes daquele ecossistema.
            </p>
          </div>

          <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${activeBucket.model.panelClass}`}>
            <activeBucket.model.Icon className="h-4 w-4 text-primary" />
            <span className="font-medium">{activeBucket.model.label}</span>
            <span className="text-muted-foreground">· {activeBucket.model.company}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {buckets.map(({ model, items }) => {
            const isActive = model.id === activeModelId;
            return (
              <button
                key={model.id}
                type="button"
                data-active={isActive}
                onClick={() => setActiveModelId(model.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] transition-colors ${model.chipClass} ${
                  !isActive ? "text-muted-foreground hover:bg-card/50" : ""
                }`}
              >
                <model.Icon className="h-3 w-3" />
                {model.label}
                <span className="text-[10px] text-muted-foreground">{items.length}</span>
              </button>
            );
          })}
        </div>

        {activeBucket.items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 bg-card/30 p-5 text-sm text-muted-foreground">
            Ainda não há matérias recentes sobre <strong className="text-foreground">{activeBucket.model.company}</strong>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeBucket.items.map((article) => (
              <Link
                key={article.slug}
                to={`/noticia/${article.slug}`}
                className="group rounded-md border border-border/60 bg-card/50 p-3 hover:bg-card/70 transition-colors"
              >
                <div className="flex gap-3">
                  {article.hero_image_url && (
                    <img
                      src={article.hero_image_url}
                      alt={article.title}
                      loading="lazy"
                      className="h-20 w-20 shrink-0 rounded-md object-cover border border-border/40"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <activeBucket.model.Icon className="h-3 w-3" />
                      {activeBucket.model.company}
                    </div>
                    <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    {article.excerpt && (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground line-clamp-3">
                        {article.excerpt}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
