import { Zap, Flame, Star, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export type EditorialBadgeKind = "manchete" | "exclusivo" | "em_alta" | "ao_vivo" | null;

interface BadgeMeta {
  is_featured?: boolean | null;
  view_count?: number | null;
  published_at?: string | null;
}

/**
 * Decide qual badge editorial mostrar para um artigo.
 * Prioridade: AO VIVO (< 1h) > MANCHETE (featured) > EM ALTA (view_count > 100) > EXCLUSIVO (tag)
 */
export function getEditorialBadge(meta: BadgeMeta): EditorialBadgeKind {
  if (meta.published_at) {
    const ageMs = Date.now() - new Date(meta.published_at).getTime();
    if (ageMs < 60 * 60 * 1000) return "ao_vivo";
  }
  if (meta.is_featured) return "manchete";
  if ((meta.view_count ?? 0) > 100) return "em_alta";
  return null;
}

interface EditorialBadgeProps {
  kind: EditorialBadgeKind;
  size?: "sm" | "md";
  className?: string;
}

export const EditorialBadge = ({ kind, size = "sm", className }: EditorialBadgeProps) => {
  if (!kind) return null;

  const base =
    "inline-flex items-center gap-1 font-bold uppercase rounded-full backdrop-blur shadow-md";
  const sizing =
    size === "sm"
      ? "text-[9px] tracking-[0.18em] px-2 py-0.5"
      : "text-[10px] tracking-[0.2em] px-2.5 py-1";

  switch (kind) {
    case "ao_vivo":
      return (
        <span
          className={cn(
            base,
            sizing,
            "bg-destructive text-destructive-foreground animate-pulse",
            className
          )}
        >
          <Radio className="h-2.5 w-2.5" /> Ao Vivo
        </span>
      );
    case "manchete":
      return (
        <span
          className={cn(
            base,
            sizing,
            "bg-gradient-to-r from-primary to-accent text-primary-foreground border border-primary/40",
            className
          )}
        >
          <Star className="h-2.5 w-2.5" /> Manchete
        </span>
      );
    case "em_alta":
      return (
        <span
          className={cn(
            base,
            sizing,
            "bg-orange-500/95 text-white border border-orange-300/40",
            className
          )}
        >
          <Flame className="h-2.5 w-2.5" /> Em Alta
        </span>
      );
    case "exclusivo":
      return (
        <span
          className={cn(
            base,
            sizing,
            "bg-amber-500/95 text-black border border-amber-300/40",
            className
          )}
        >
          <Zap className="h-2.5 w-2.5" /> Exclusivo
        </span>
      );
    default:
      return null;
  }
};
