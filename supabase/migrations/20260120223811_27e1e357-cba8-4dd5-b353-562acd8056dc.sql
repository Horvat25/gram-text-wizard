-- Add content distribution columns to agent_context
ALTER TABLE public.agent_context
ADD COLUMN IF NOT EXISTS content_distribution_videos INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS content_distribution_carousels INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS content_distribution_news INTEGER DEFAULT 4,
ADD COLUMN IF NOT EXISTS content_distribution_images INTEGER DEFAULT 5;