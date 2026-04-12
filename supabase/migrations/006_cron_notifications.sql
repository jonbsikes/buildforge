-- Enable pg_cron extension
create extension if not exists pg_cron;

-- Schedule generate-notifications edge function to run every day at 7 AM UTC
select cron.schedule(
  'daily-notification-check',
  '0 7 * * *',
  $$
    select net.http_post(
      url := 'https://wuykwjxlhimmxwuwwhsw.supabase.co/functions/v1/generate-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{}'::jsonb