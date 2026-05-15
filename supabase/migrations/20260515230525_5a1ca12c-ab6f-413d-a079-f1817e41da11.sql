-- Coluna pra marcar quais notícias já viraram Reel
ALTER TABLE public.rss_items
  ADD COLUMN IF NOT EXISTS used_for_reel boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rss_items_unused_for_reel
  ON public.rss_items (published_at DESC)
  WHERE used_for_reel = false AND has_image = true;

-- Garante extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove jobs antigos de Reel (se existirem) pra recriar limpo
DO $$
DECLARE jobid bigint;
BEGIN
  FOR jobid IN SELECT j.jobid FROM cron.job j WHERE j.jobname IN ('auto-reel-morning', 'auto-reel-evening')
  LOOP
    PERFORM cron.unschedule(jobid);
  END LOOP;
END $$;

-- Reel da manhã: 13:00 UTC = 10:00 Brasília
SELECT cron.schedule(
  'auto-reel-morning',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vtvvmikilbcalohutsmf.supabase.co/functions/v1/auto-reel-publisher',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dnZtaWtpbGJjYWxvaHV0c21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MTM2OTAsImV4cCI6MjA4MDI4OTY5MH0.7xor3_WpfyAjR-LHZMfK9zu_8Hlvrr3DABZU_04nX28"}'::jsonb,
    body := jsonb_build_object('trigger','cron_morning','time', now())
  );
  $$
);

-- Reel da tarde: 21:00 UTC = 18:00 Brasília
SELECT cron.schedule(
  'auto-reel-evening',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vtvvmikilbcalohutsmf.supabase.co/functions/v1/auto-reel-publisher',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dnZtaWtpbGJjYWxvaHV0c21mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MTM2OTAsImV4cCI6MjA4MDI4OTY5MH0.7xor3_WpfyAjR-LHZMfK9zu_8Hlvrr3DABZU_04nX28"}'::jsonb,
    body := jsonb_build_object('trigger','cron_evening','time', now())
  );
  $$
);