-- Limpeza única: remove lixo acumulado de RSS items órfãos
-- (published_at NULL e antigos = nunca foram limpos pela cron)
DELETE FROM public.rss_items
WHERE is_used = false
  AND (
    published_at < NOW() - INTERVAL '3 days'
    OR (published_at IS NULL AND fetched_at < NOW() - INTERVAL '3 days')
  );

-- Cap final: mantém só os 150 mais recentes por workspace
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY workspace_id
    ORDER BY COALESCE(published_at, fetched_at) DESC
  ) AS rn
  FROM public.rss_items
)
DELETE FROM public.rss_items
WHERE id IN (SELECT id FROM ranked WHERE rn > 150);