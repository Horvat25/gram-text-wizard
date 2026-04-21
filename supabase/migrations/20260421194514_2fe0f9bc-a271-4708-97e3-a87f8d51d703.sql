
-- Tabela de artigos do Portal Neural Update
CREATE TABLE public.articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  content TEXT NOT NULL,
  excerpt TEXT,
  hero_image_url TEXT,
  category TEXT NOT NULL DEFAULT 'tecnologia',
  tags TEXT[] DEFAULT '{}',
  author_name TEXT NOT NULL DEFAULT 'Agente Horvat',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMP WITH TIME ZONE,
  view_count INTEGER NOT NULL DEFAULT 0,
  reading_time_minutes INTEGER,
  seo_title TEXT,
  seo_description TEXT,
  og_image_url TEXT,
  source_rss_item_id UUID REFERENCES public.rss_items(id) ON DELETE SET NULL,
  source_url TEXT,
  source_name TEXT,
  linked_post_ids UUID[] DEFAULT '{}',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  ai_model_used TEXT,
  cost_estimate NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_articles_slug ON public.articles(slug);
CREATE INDEX idx_articles_status_published_at ON public.articles(status, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_articles_category ON public.articles(category);
CREATE INDEX idx_articles_workspace ON public.articles(workspace_id);
CREATE INDEX idx_articles_featured ON public.articles(is_featured, published_at DESC) WHERE is_featured = true AND status = 'published';
CREATE INDEX idx_articles_tags ON public.articles USING GIN(tags);

-- Habilitar RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Leitura pública (apenas publicados)
CREATE POLICY "Public can view published articles"
ON public.articles
FOR SELECT
TO anon, authenticated
USING (status = 'published');

-- Editores do workspace podem ver tudo (incluindo rascunhos)
CREATE POLICY "Workspace editors can view all articles"
ON public.articles
FOR SELECT
TO authenticated
USING (has_workspace_access(auth.uid(), workspace_id));

-- Editores podem criar
CREATE POLICY "Editors can create articles"
ON public.articles
FOR INSERT
TO authenticated
WITH CHECK (can_edit_workspace(auth.uid(), workspace_id));

-- Editores podem atualizar
CREATE POLICY "Editors can update articles"
ON public.articles
FOR UPDATE
TO authenticated
USING (can_edit_workspace(auth.uid(), workspace_id));

-- Donos podem deletar
CREATE POLICY "Owners can delete articles"
ON public.articles
FOR DELETE
TO authenticated
USING (has_global_role(auth.uid(), 'super_admin'::app_role) OR is_workspace_owner(auth.uid(), workspace_id));

-- Trigger updated_at
CREATE TRIGGER update_articles_updated_at
BEFORE UPDATE ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Função para incrementar view_count (chamável publicamente sem login)
CREATE OR REPLACE FUNCTION public.increment_article_views(_slug TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.articles
  SET view_count = view_count + 1
  WHERE slug = _slug AND status = 'published';
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_article_views(TEXT) TO anon, authenticated;
