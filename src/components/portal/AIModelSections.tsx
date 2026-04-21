import { Link } from "react-router-dom";
import type { ArticleCardData } from "@/components/portal/ArticleCard";
import { ArticleCard } from "@/components/portal/ArticleCard";
import { Bot, Sparkles, Brain, Zap, Cpu } from "lucide-react";

/**
 * AIModelSections — agrupa as últimas notícias pelos principais modelos/labs
 * de IA mencionados (ChatGPT/OpenAI, Gemini/Google, Claude/Anthropic, Grok, Llama).
 * Detecção é feita no client por keyword match (title + excerpt + tags).
 */

interface ModelDef {
  id: string;
  label: string;
  // Cor de destaque (Tailwind utility usando tokens semânticos quando possível)
  accent: string;
  iconBg: string;
  Icon: React.ComponentType<{ className?: string }>;
  // Regex case-insensitive — ordem importa pra evitar colisão
  pattern: RegExp;
}

const MODELS: ModelDef[] = [
  {
    id: "openai",
    label: "ChatGPT / OpenAI",
    accent: "border-emerald-500/40 text-emerald-300",
    iconBg: "bg-emerald-500/15 text-emerald-300",
    Icon: Sparkles,
    pattern: /\b(chatgpt|gpt-?\s*[345]|gpt\s*5|openai|sora|dall[\s-]?e)\b/i,
  },
  {
    id: "google",
    label: "Gemini / Google",
    accent: "border-blue-500/40 text-blue-300",
    iconBg: "bg-blue-500/15 text-blue-300",
    Icon: Brain,
    pattern: /\b(gemini|google\s*deepmind|deepmind|bard|imagen|veo)\b/i,
  },
  {
    id: "anthropic",
    label: "Claude / Anthropic",
    accent: "border-amber-500/40 text-amber-300",
    iconBg: "bg-amber-500/15 text-amber-300",
    Icon: Bot,
    pattern: /\b(claude|anthropic|mythos)\b/i,
  },
  {
    id: "xai",
    label: "Grok / xAI",
    accent: "border-fuchsia-500/40 text-fuchsia-300",
    iconBg: "bg-fuchsia-500/15 text-fuchsia-300",
    Icon: Zap,
    pattern: /\b(grok|xai|x\.ai)\b/i,
  },
  {
    id: "meta",
    label: "Llama / Meta",
    accent: "border-indigo-500/40 text-indigo-300",
    iconBg: "bg-indigo-500/15 text-indigo-300",
    Icon: Cpu,
    pattern: /\b(llama|meta\s*ai)\b/i,
  },
];

interface ArticleWithText extends ArticleCardData {
  tags?: string[] | null;
}

function matchesModel(article: ArticleWithText, model: ModelDef): boolean {
  const haystack = [
    article.title,
    article.excerpt ?? "",
    (article.tags ?? []).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return model.pattern.test(haystack);
}

interface AIModelSectionsProps {
  articles: ArticleWithText[];
}

export const AIModelSections = ({ articles }: AIModelSectionsProps) => {
  // Para cada modelo, pega até 3 artigos mais recentes
  const buckets = MODELS.map((m) => ({
    model: m,
    items: articles.filter((a) => matchesModel(a, m)).slice(0, 3),
  })).filter((b) => b.items.length > 0);

  if (buckets.length === 0) return null;

  return (
    <section className="mt-20" aria-label="Notícias por modelo de IA">
      <div className="mb-8">
        <div className="portal-divider mb-5" />
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-1.5">
          / Por modelo de IA
        </p>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">
            Cada IA, sua história
          </h2>
          <p className="text-xs text-muted-foreground max-w-md">
            Notícias mais recentes filtradas pelos principais laboratórios e modelos.
          </p>
        </div>
      </div>

      {/* Linha de chips com todos os modelos disponíveis (mesmo sem artigos) */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {MODELS.map((m) => {
          const has = buckets.some((b) => b.model.id === m.id);
          return (
            <span
              key={m.id}
              className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] px-2.5 py-1 rounded-full border ${
                has ? m.accent : "border-border/50 text-muted-foreground/60"
              }`}
            >
              <m.Icon className="h-2.5 w-2.5" />
              {m.label}
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-10">
        {buckets.map(({ model, items }) => (
          <div key={model.id} className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-border/50">
              <span
                className={`h-7 w-7 rounded-md flex items-center justify-center ${model.iconBg}`}
              >
                <model.Icon className="h-3.5 w-3.5" />
              </span>
              <h3 className="font-display text-base font-semibold tracking-tight flex-1">
                {model.label}
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {items.length} {items.length === 1 ? "matéria" : "matérias"}
              </span>
            </div>

            <div className="space-y-3">
              {items.map((a) => (
                <Link
                  key={a.slug}
                  to={`/noticia/${a.slug}`}
                  className="group flex gap-3 p-2 -mx-2 rounded-md hover:bg-card/40 transition-colors"
                >
                  {a.hero_image_url && (
                    <img
                      src={a.hero_image_url}
                      alt=""
                      loading="lazy"
                      className="h-16 w-16 rounded-md object-cover shrink-0 border border-border/40"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {a.title}
                    </h4>
                    {a.excerpt && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1">
                        {a.excerpt}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
