
-- Add macro objective fields to agent_context
ALTER TABLE public.agent_context
ADD COLUMN IF NOT EXISTS goal_type text DEFAULT 'macro',
ADD COLUMN IF NOT EXISTS goal_weekly_views integer DEFAULT 10000,
ADD COLUMN IF NOT EXISTS goal_weekly_followers integer DEFAULT 100,
ADD COLUMN IF NOT EXISTS goal_weekly_engagement numeric DEFAULT 5.0,
ADD COLUMN IF NOT EXISTS current_weekly_views integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_weekly_followers integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_weekly_engagement numeric DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.agent_context.goal_type IS 'macro (objectives-driven) or fixed (legacy fixed counts)';
COMMENT ON COLUMN public.agent_context.goal_weekly_views IS 'Target weekly views/reach';
COMMENT ON COLUMN public.agent_context.goal_weekly_followers IS 'Target weekly new followers';
COMMENT ON COLUMN public.agent_context.goal_weekly_engagement IS 'Target weekly engagement rate %';
