-- Tabela para analytics internos do blog (visitas e buscas)
CREATE TABLE IF NOT EXISTS public.page_views (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid,
  page_path text NOT NULL,
  page_type text NOT NULL DEFAULT 'page',
  article_slug text,
  referrer text,
  user_agent text,
  country text,
  device_type text,
  search_query text,
  session_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_views_workspace ON public.page_views(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON public.page_views(page_path, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_slug ON public.page_views(article_slug) WHERE article_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_views_search ON public.page_views(search_query) WHERE search_query IS NOT NULL;

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Qualquer um (anon) pode REGISTRAR uma visita (necessário para tracking público)
CREATE POLICY "Anyone can insert page views"
ON public.page_views
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Apenas membros do workspace podem VER as estatísticas
CREATE POLICY "Workspace members can view their analytics"
ON public.page_views
FOR SELECT
TO authenticated
USING (workspace_id IS NULL OR has_workspace_access(auth.uid(), workspace_id));

-- Apenas owners podem deletar (limpeza)
CREATE POLICY "Owners can delete page views"
ON public.page_views
FOR DELETE
TO authenticated
USING (workspace_id IS NOT NULL AND is_workspace_owner(auth.uid(), workspace_id));

-- ===== Settings de SEO/Analytics por workspace =====
CREATE TABLE IF NOT EXISTS public.seo_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL UNIQUE,
  site_url text,
  ga4_measurement_id text,
  gsc_verification_code text,
  enable_internal_analytics boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.seo_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa autenticada ou anônima pode LER (precisa pra carregar GA4 no portal público)
CREATE POLICY "Public can read seo settings"
ON public.seo_settings
FOR SELECT
TO anon, authenticated
USING (true);

-- Apenas editores podem modificar
CREATE POLICY "Editors can insert seo settings"
ON public.seo_settings
FOR INSERT
TO authenticated
WITH CHECK (can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update seo settings"
ON public.seo_settings
FOR UPDATE
TO authenticated
USING (can_edit_workspace(auth.uid(), workspace_id));

CREATE TRIGGER update_seo_settings_updated_at
BEFORE UPDATE ON public.seo_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();