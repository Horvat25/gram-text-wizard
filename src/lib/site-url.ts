/**
 * Canonical public URL for the Neural Update portal.
 * Used by admin buttons ("Ver site", "Ver no portal") so they always open the
 * production site, never the preview/dev URL.
 */
export const PUBLIC_SITE_URL = "https://neural-update.com.br";

export const publicArticleUrl = (slug: string) =>
  `${PUBLIC_SITE_URL}/noticia/${slug}`;
