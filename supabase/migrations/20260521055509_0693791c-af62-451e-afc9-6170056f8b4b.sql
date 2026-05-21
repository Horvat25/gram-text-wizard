
DROP POLICY IF EXISTS "Service can manage distributions" ON public.article_distributions;

DROP VIEW IF EXISTS public.article_performance;
CREATE VIEW public.article_performance
WITH (security_invoker = true)
AS
SELECT
  r.id AS rss_item_id,
  r.workspace_id,
  r.title,
  r.link,
  r.source_name,
  r.published_at,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status IN ('ready','published')) AS formats_generated,
  COUNT(DISTINCT d.id) FILTER (WHERE d.format = 'carousel' AND d.status IN ('ready','published')) AS has_carousel,
  COUNT(DISTINCT d.id) FILTER (WHERE d.format = 'reels' AND d.status IN ('ready','published')) AS has_reels,
  COUNT(DISTINCT d.id) FILTER (WHERE d.format = 'snippet' AND d.status IN ('ready','published')) AS has_snippets,
  COALESCE(SUM(p.reach), 0) AS total_reach,
  COALESCE(SUM(p.likes_count + p.comments_count + p.saves_count + p.shares_count), 0) AS total_engagement,
  COALESCE(SUM(d.cta_clicks), 0) AS total_cta_clicks
FROM public.rss_items r
LEFT JOIN public.article_distributions d ON d.rss_item_id = r.id
LEFT JOIN public.posts p ON p.id = d.post_id
GROUP BY r.id, r.workspace_id, r.title, r.link, r.source_name, r.published_at;
