-- Tabela para armazenar itens de RSS para criação de posts
CREATE TABLE public.rss_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT NOT NULL UNIQUE,
  image_url TEXT,
  has_image BOOLEAN DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  used_in_post_id UUID REFERENCES public.posts(id),
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rss_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own RSS items"
  ON public.rss_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own RSS items"
  ON public.rss_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own RSS items"
  ON public.rss_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own RSS items"
  ON public.rss_items FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service can insert RSS items"
  ON public.rss_items FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can update RSS items"
  ON public.rss_items FOR UPDATE
  USING (true);

-- Index for faster lookups
CREATE INDEX idx_rss_items_user_unused ON public.rss_items(user_id, is_used) WHERE is_used = false;
CREATE INDEX idx_rss_items_link ON public.rss_items(link);