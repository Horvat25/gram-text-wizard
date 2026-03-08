ALTER TABLE public.affiliate_links
  ADD COLUMN IF NOT EXISTS media_format text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS post_frequency integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS marketing_strategy text DEFAULT NULL;