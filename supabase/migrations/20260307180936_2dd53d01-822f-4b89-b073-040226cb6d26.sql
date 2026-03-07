
CREATE TABLE public.agent_strategy_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  period_type text NOT NULL DEFAULT 'weekly',
  
  -- Strategy at that point
  goal_type text,
  content_distribution_videos integer DEFAULT 0,
  content_distribution_carousels integer DEFAULT 0,
  content_distribution_news integer DEFAULT 0,
  content_distribution_images integer DEFAULT 0,
  
  -- Real Instagram metrics for this period
  total_reach integer DEFAULT 0,
  total_impressions integer DEFAULT 0,
  total_likes integer DEFAULT 0,
  total_comments integer DEFAULT 0,
  total_saves integer DEFAULT 0,
  total_shares integer DEFAULT 0,
  followers_count integer DEFAULT 0,
  avg_engagement numeric DEFAULT 0,
  posts_count integer DEFAULT 0,
  
  -- Agent reasoning
  strategy_reason text,
  top_performing_type text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, snapshot_date, period_type)
);

ALTER TABLE public.agent_strategy_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view snapshots in their workspaces"
ON public.agent_strategy_snapshots
FOR SELECT
TO authenticated
USING (has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Service can insert snapshots"
ON public.agent_strategy_snapshots
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Service can update snapshots"
ON public.agent_strategy_snapshots
FOR UPDATE
TO authenticated
USING (true);
