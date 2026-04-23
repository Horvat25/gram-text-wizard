import { useState } from "react";
import { Twitter, Link2, Check, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ShareButtonsProps {
  title: string;
  url?: string;
  layout?: "vertical" | "horizontal";
  className?: string;
}

export const ShareButtons = ({ title, url, layout = "vertical", className }: ShareButtonsProps) => {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || (typeof window !== "undefined" ? window.location.href : "");
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const buttonClass =
    "h-10 w-10 inline-flex items-center justify-center rounded-full border border-border/60 bg-card/60 backdrop-blur text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/10 transition-all";

  return (
    <div
      className={cn(
        "flex gap-2",
        layout === "vertical" ? "flex-col" : "flex-row items-center",
        className
      )}
    >
      <span
        className={cn(
          "text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold",
          layout === "vertical" ? "text-center mb-1" : "mr-1"
        )}
      >
        Compartilhar
      </span>
      <a
        href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
        aria-label="Compartilhar no WhatsApp"
      >
        <Send className="h-4 w-4" />
      </a>
      <a
        href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
        aria-label="Compartilhar no X"
      >
        <Twitter className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className={buttonClass}
        aria-label="Copiar link"
      >
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Link2 className="h-4 w-4" />}
      </button>
    </div>
  );
};
