
-- Unschedule blog crons
SELECT cron.unschedule('blog-auto-publish-09h-br');
SELECT cron.unschedule('blog-auto-publish-13h-br');
SELECT cron.unschedule('blog-auto-publish-19h-br');
SELECT cron.unschedule('daily-blog-report-morning');
SELECT cron.unschedule('daily-blog-report-evening');

-- Drop blog tables (data already exported)
DROP TABLE IF EXISTS public.page_views CASCADE;
DROP TABLE IF EXISTS public.newsletter_subscribers CASCADE;
DROP TABLE IF EXISTS public.seo_settings CASCADE;
DROP TABLE IF EXISTS public.articles CASCADE;

-- Drop blog-only DB function
DROP FUNCTION IF EXISTS public.increment_article_views(text);
