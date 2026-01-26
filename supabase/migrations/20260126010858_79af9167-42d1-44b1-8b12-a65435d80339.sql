-- Fix foreign key constraint to allow deleting posts
-- The agent_execution_reports table references posts, blocking deletion

-- Drop the existing FK constraint
ALTER TABLE public.agent_execution_reports
DROP CONSTRAINT IF EXISTS agent_execution_reports_post_id_fkey;

-- Re-create it with ON DELETE SET NULL so we can delete posts
ALTER TABLE public.agent_execution_reports
ADD CONSTRAINT agent_execution_reports_post_id_fkey
FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;

-- Also fix agent_decisions table (same issue)
ALTER TABLE public.agent_decisions
DROP CONSTRAINT IF EXISTS agent_decisions_post_id_fkey;

ALTER TABLE public.agent_decisions
ADD CONSTRAINT agent_decisions_post_id_fkey
FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE SET NULL;