/**
 * Helpers for Neural Update Portal articles.
 */

export const ARTICLE_CATEGORIES = [
  { slug: "ia", label: "Inteligência Artificial" },
  { slug: "gadgets", label: "Gadgets" },
  { slug: "futuro", label: "Futuro" },
  { slug: "mercado", label: "Mercado" },
  { slug: "ciencia", label: "Ciência" },
  { slug: "tecnologia", label: "Tecnologia" },
] as const;

export type ArticleCategorySlug = (typeof ARTICLE_CATEGORIES)[number]["slug"];

export function getCategoryLabel(slug: string): string {
  return ARTICLE_CATEGORIES.find((c) => c.slug === slug)?.label ?? "Tecnologia";
}

/** Generate a URL-friendly slug from a title (PT-BR aware). Stop-words removed for SEO. */
const PT_STOPWORDS = new Set([
  "a","o","as","os","um","uma","uns","umas","de","da","do","das","dos","e","ou","mas",
  "para","por","pelo","pela","com","sem","em","no","na","nos","nas","ao","aos","à","às",
  "que","se","na","no","como","mais","menos","ja","já","sobre","entre","ate","até",
]);
export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !PT_STOPWORDS.has(w))
    .join("-")
    .replace(/-+/g, "-");
  return base.slice(0, 60).replace(/-+$/g, "");
}

/** Estimate reading time in minutes. ~200 wpm PT-BR. */
export function estimateReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/** Format date as Brazilian Portuguese. */
export function formatArticleDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `há ${diffD}d`;
  return formatArticleDate(iso);
}

/** Lightweight markdown → HTML for article body (safe subset). */
export function renderMarkdown(md: string): string {
  if (!md) return "";

  const normalizedInput = md
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

  // Escape HTML first
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Inline formatting helper (bold, italic, links, inline code)
  const inline = (s: string) => {
    let out = escape(s);
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    out = out.replace(/_([^_\n]+)_/g, "<em>$1</em>");
    out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    out = out.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return out;
  };

  const isLikelyHeading = (line: string, next: string): boolean => {
    const t = line.trim();
    const nextTrimmed = next.trim();
    if (!t || t.length > 90) return false;
    if (/^[#>\-*\d`]/.test(t)) return false;
    if (/[.!?:;,]$/.test(t)) return false;
    if (!/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ"']/.test(t)) return false;
    if (t.split(/\s+/).length > 12) return false;
    if (!nextTrimmed) return false;
    if (/^#{1,3}\s+/.test(nextTrimmed)) return false;
    const nextLooksLikeContent =
      nextTrimmed.length >= 24 ||
      /^[-*]\s+/.test(nextTrimmed) ||
      /^>\s+/.test(nextTrimmed) ||
      /^\*\*/.test(nextTrimmed);
    return nextLooksLikeContent;
  };

  const lines = normalizedInput.split("\n");
  const promotedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i] ?? "";
    const trimmed = cur.trim();
    const next = lines[i + 1] ?? "";
    const prevOutput = promotedLines[promotedLines.length - 1]?.trim() ?? "";

    if (isLikelyHeading(cur, next)) {
      if (prevOutput !== "") promotedLines.push("");
      promotedLines.push(`## ${trimmed}`);
      if (next.trim() !== "") promotedLines.push("");
      continue;
    }

    // Linhas em negrito seguidas de dois-pontos costumam ser mini-subtítulos.
    if (/^\*\*[^*\n]{3,80}:\*\*/.test(trimmed) && prevOutput !== "") {
      promotedLines.push("");
      promotedLines.push(cur);
      continue;
    }

    promotedLines.push(cur);
  }

  const normalized = promotedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const blocks: string[] = [];
  const rawBlocks = normalized.split(/\n\s*\n+/);

  for (const raw of rawBlocks) {
    const block = raw.trim();
    if (!block) continue;

    const h3 = block.match(/^###\s+(.+)$/s);
    const h2 = block.match(/^##\s+(.+)$/s);
    const h1 = block.match(/^#\s+(.+)$/s);
    if (h3) {
      blocks.push(`<h3>${inline(h3[1].trim())}</h3>`);
      continue;
    }
    if (h2) {
      blocks.push(`<h2>${inline(h2[1].trim())}</h2>`);
      continue;
    }
    if (h1) {
      blocks.push(`<h1>${inline(h1[1].trim())}</h1>`);
      continue;
    }

    if (/^>\s+/.test(block)) {
      const text = block
        .split("\n")
        .map((l) => l.replace(/^>\s?/, "").trim())
        .filter(Boolean)
        .join(" ");
      blocks.push(`<blockquote>${inline(text)}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(block)) {
      const items = block
        .split("\n")
        .filter((l) => /^[-*]\s+/.test(l.trim()))
        .map((l) => `<li>${inline(l.trim().replace(/^[-*]\s+/, ""))}</li>`)
        .join("");
      blocks.push(`<ul>${items}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(block)) {
      const items = block
        .split("\n")
        .filter((l) => /^\d+\.\s+/.test(l.trim()))
        .map((l) => `<li>${inline(l.trim().replace(/^\d+\.\s+/, ""))}</li>`)
        .join("");
      blocks.push(`<ol>${items}</ol>`);
      continue;
    }

    // Quando um bloco mistura parágrafo + subtítulo + parágrafo, quebramos linha a linha.
    const sublines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (sublines.length > 1) {
      for (let i = 0; i < sublines.length; i++) {
        const line = sublines[i];
        const next = sublines[i + 1] ?? "";

        if (/^##\s+/.test(line)) {
          blocks.push(`<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`);
          continue;
        }
        if (/^###\s+/.test(line)) {
          blocks.push(`<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`);
          continue;
        }
        if (isLikelyHeading(line, next)) {
          blocks.push(`<h2>${inline(line)}</h2>`);
          continue;
        }
        if (/^[-*]\s+/.test(line)) {
          blocks.push(`<ul><li>${inline(line.replace(/^[-*]\s+/, ""))}</li></ul>`);
          continue;
        }
        if (/^>\s+/.test(line)) {
          blocks.push(`<blockquote>${inline(line.replace(/^>\s+/, ""))}</blockquote>`);
          continue;
        }
        blocks.push(`<p>${inline(line)}</p>`);
      }
      continue;
    }

    blocks.push(`<p>${inline(block).replace(/\n/g, "<br/>")}</p>`);
  }

  return blocks.join("\n");
}

export function buildExcerpt(content: string, max = 180): string {
  const text = content.replace(/[#*>\-]/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
