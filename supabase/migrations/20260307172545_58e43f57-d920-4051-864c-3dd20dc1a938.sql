
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS render_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_render_error text;
