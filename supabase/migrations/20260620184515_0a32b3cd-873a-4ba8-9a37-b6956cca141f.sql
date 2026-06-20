SELECT cron.unschedule('auto-reel-morning');
SELECT cron.unschedule('auto-reel-afternoon');
SELECT cron.unschedule('auto-reel-evening');
SELECT cron.alter_job(12, schedule := '0 */6 * * *');
SELECT cron.alter_job(6, schedule := '*/15 * * * *');