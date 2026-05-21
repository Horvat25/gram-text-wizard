
CREATE TABLE IF NOT EXISTS public.article_distributions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid NOT NULL,
  rss_item_id uuid NOT NULL,
  format text NOT NULL CHECK (format IN ('carousel','reels','story','snippet','tweet')),
  post_id uuid NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','failed','published')),
  payload jsonb NULL,
  cta_url text NULL,
  cta_clicks integer NOT NULL DEFAULT 0,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rss_item_id, format)
);

CREATE INDEX IF NOT EXISTS idx_article_distributions_workspace ON public.article_distributions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_article_distributions_rss_item ON public.article_distributions(rss_item_id);
CREATE INDEX IF NOT EXISTS idx_article_distributions_status ON public.article_distributions(status);

ALTER TABLE public.article_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view distributions in their workspaces"
  ON public.article_distributions FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create distributions in their workspaces"
  ON public.article_distributions FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update distributions in their workspaces"
  ON public.article_distributions FOR UPDATE
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete distributions in their workspaces"
  ON public.article_distributions FOR DELETE
  USING (public.has_global_role(auth.uid(), 'super_admin'::app_role) OR public.is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Service can manage distributions"
  ON public.article_distributions FOR ALL
  USING (true) WITH CHECK (true);

CREATE TRIGGER article_distributions_set_updated_at
  BEFORE UPDATE ON public.article_distributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.article_performance AS
SELECT
  r.id AS rss_item_id,
  r.workspace_id,
  r.title,
  r.link,
  r.source_name,
  r.published_at,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status IN ('ready','published')) AS formats_generated,
  COUNT(DISTINCT d.id) FILTER (WHERE d.format = 'carousel' AND d.status IN ('ready','published')) AS has_carousel,
  COUNT(DISTINCT d.id) FILTER (WHERE d.format = 'reels' AND d.status IN ('ready','published')) AS has_reels,
  COUNT(DISTINCT d.id) FILTER (WHERE d.format = 'snippet' AND d.status IN ('ready','published')) AS has_snippets,
  COALESCE(SUM(p.reach), 0) AS total_reach,
  COALESCE(SUM(p.likes_count + p.comments_count + p.saves_count + p.shares_count), 0) AS total_engagement,
  COALESCE(SUM(d.cta_clicks), 0) AS total_cta_clicks
FROM public.rss_items r
LEFT JOIN public.article_distributions d ON d.rss_item_id = r.id
LEFT JOIN public.posts p ON p.id = d.post_id
GROUP BY r.id, r.workspace_id, r.title, r.link, r.source_name, r.published_at;
