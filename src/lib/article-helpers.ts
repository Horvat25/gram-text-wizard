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

/** Generate a URL-friendly slug from a title (PT-BR aware). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
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

  // Escape HTML first
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Inline formatting helper (bold, italic, links, inline code)
  const inline = (s: string) => {
    let out = escape(s);
    // Bold **text**
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    // Italic *text* (not part of bold)
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    // Inline code `text`
    out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    // Links [text](url)
    out = out.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return out;
  };

  // Heuristic: detect "fake" headings — a short line (≤ 80 chars, no terminal
  // punctuation) immediately followed by a paragraph. The AI sometimes drops
  // the "## " prefix; we promote those lines to <h2> so the article doesn't
  // turn into a wall of text.
  const lines = md.split("\n");
  const promotedLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const trimmed = cur.trim();
    const next = lines[i + 1]?.trim() ?? "";
    const prev = lines[i - 1]?.trim() ?? "";

    const looksLikeHeading =
      trimmed.length > 0 &&
      trimmed.length <= 80 &&
      !/^[#>\-*\d`]/.test(trimmed) &&
      !/[.!?:;,]$/.test(trimmed) &&
      // capital letter or accentuated capital at start
      /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(trimmed) &&
      // followed by a real paragraph (not list / heading / blockquote)
      next.length > 60 &&
      !/^[#>\-*]/.test(next) &&
      // and preceded by blank line or start
      (prev === "" || /[.!?]"?$/.test(prev));

    promotedLines.push(looksLikeHeading ? `## ${trimmed}` : cur);
  }
  const normalized = promotedLines.join("\n");

  // Block-level parser
  const blocks: string[] = [];
  const rawBlocks = normalized.split(/\n{2,}/);

  for (const raw of rawBlocks) {
    const block = raw.trim();
    if (!block) continue;

    // Heading
    const h3 = block.match(/^###\s+(.+)$/);
    const h2 = block.match(/^##\s+(.+)$/);
    const h1 = block.match(/^#\s+(.+)$/);
    if (h3) { blocks.push(`<h3>${inline(h3[1])}</h3>`); continue; }
    if (h2) { blocks.push(`<h2>${inline(h2[1])}</h2>`); continue; }
    if (h1) { blocks.push(`<h1>${inline(h1[1])}</h1>`); continue; }

    // Blockquote (one or many > lines)
    if (/^>\s+/.test(block)) {
      const text = block
        .split("\n")
        .map((l) => l.replace(/^>\s?/, "").trim())
        .filter(Boolean)
        .join(" ");
      blocks.push(`<blockquote>${inline(text)}</blockquote>`);
      continue;
    }

    // List (bullets)
    if (/^[-*]\s+/.test(block)) {
      const items = block
        .split("\n")
        .filter((l) => /^[-*]\s+/.test(l.trim()))
        .map((l) => `<li>${inline(l.trim().replace(/^[-*]\s+/, ""))}</li>`)
        .join("");
      blocks.push(`<ul>${items}</ul>`);
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(block)) {
      const items = block
        .split("\n")
        .filter((l) => /^\d+\.\s+/.test(l.trim()))
        .map((l) => `<li>${inline(l.trim().replace(/^\d+\.\s+/, ""))}</li>`)
        .join("");
      blocks.push(`<ol>${items}</ol>`);
      continue;
    }

    // Paragraph — preserve single line breaks as <br/>
    blocks.push(`<p>${inline(block).replace(/\n/g, "<br/>")}</p>`);
  }

  return blocks.join("\n");
}

export function buildExcerpt(content: string, max = 180): string {
  const text = content.replace(/[#*>\-]/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
