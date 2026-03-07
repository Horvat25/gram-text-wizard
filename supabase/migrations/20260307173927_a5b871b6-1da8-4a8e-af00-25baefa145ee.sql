
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS impressions integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS shares_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_metrics_sync timestamp with time zone;

-- Remove RANDOM() metrics from the DB function (legacy)
CREATE OR REPLACE FUNCTION public.publish_scheduled_posts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  post_record RECORD;
BEGIN
  FOR post_record IN 
    SELECT id FROM posts 
    WHERE status = 'scheduled' 
    AND scheduled_for <= NOW()
  LOOP
    UPDATE posts SET
      status = 'published',
      published_at = NOW()
    WHERE id = post_record.id;
  END LOOP;
END;
$$;
