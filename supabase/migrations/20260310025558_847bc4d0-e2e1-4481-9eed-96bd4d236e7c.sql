
-- Backfill: link RSS items to posts by matching the RSS link URL in the post caption
UPDATE rss_items ri
SET used_in_post_id = sub.post_id
FROM (
  SELECT DISTINCT ON (ri2.id) ri2.id as rss_id, p.id as post_id
  FROM rss_items ri2
  JOIN posts p ON p.caption ILIKE '%' || ri2.link || '%'
    AND p.workspace_id = ri2.workspace_id
    AND p.status = 'published'
  WHERE ri2.is_used = true
    AND ri2.used_in_post_id IS NULL
  ORDER BY ri2.id, p.published_at DESC
) sub
WHERE ri.id = sub.rss_id;
