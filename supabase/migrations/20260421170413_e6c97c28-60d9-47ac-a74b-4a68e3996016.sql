-- Recupera rascunhos órfãos de notícia que ficaram sem image_url
-- mas têm rss_items vinculado com imagem RSS válida (não YouTube embed).
-- A imagem é anexada como URL externa direta (último recurso da nova cadeia de fallback).
UPDATE public.posts p
SET 
  image_url = r.image_url,
  status = CASE 
    WHEN p.scheduled_for IS NULL THEN 'scheduled'
    ELSE p.status
  END,
  scheduled_for = COALESCE(p.scheduled_for, now() + interval '5 minutes'),
  overlay_metadata = COALESCE(p.overlay_metadata, '{}'::jsonb) || jsonb_build_object(
    'overlay_status', 'fallback_external_url',
    'overlay_failure_reason', 'recovered_orphan_draft',
    'recovered_at', now()
  )
FROM public.rss_items r
WHERE r.used_in_post_id = p.id
  AND p.status = 'draft'
  AND p.media_type = 'image'
  AND p.image_url IS NULL
  AND r.image_url IS NOT NULL
  AND r.image_url NOT LIKE '%youtube.com%'
  AND r.image_url NOT LIKE '%youtu.be%'
  AND p.created_at > now() - interval '7 days';