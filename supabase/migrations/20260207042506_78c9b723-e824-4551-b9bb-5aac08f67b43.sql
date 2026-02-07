-- Fix: Create a security definer function to check workspace ownership
-- This avoids infinite recursion when RLS policies query workspace_members

CREATE OR REPLACE FUNCTION public.is_workspace_owner(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = _user_id
      AND workspace_id = _workspace_id
      AND role = 'owner'::workspace_role
  )
$$;

-- Drop the problematic policy on workspace_members that causes recursion
DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.workspace_members;

-- Recreate the policy using the security definer function (no recursion)
CREATE POLICY "Owners and admins can manage members"
ON public.workspace_members
FOR ALL
USING (
  has_global_role(auth.uid(), 'super_admin'::app_role) 
  OR is_workspace_owner(auth.uid(), workspace_id)
);

-- Also fix the posts delete policy to use the new function
DROP POLICY IF EXISTS "Owners can delete posts in their workspaces" ON public.posts;

CREATE POLICY "Owners can delete posts in their workspaces"
ON public.posts
FOR DELETE
USING (
  has_global_role(auth.uid(), 'super_admin'::app_role) 
  OR is_workspace_owner(auth.uid(), workspace_id)
);

-- Fix other tables that have the same recursive pattern

-- agent_decisions
DROP POLICY IF EXISTS "Owners can delete agent decisions in their workspaces" ON public.agent_decisions;
CREATE POLICY "Owners can delete agent decisions in their workspaces"
ON public.agent_decisions
FOR DELETE
USING (
  has_global_role(auth.uid(), 'super_admin'::app_role) 
  OR is_workspace_owner(auth.uid(), workspace_id)
);

-- agent_chat_messages
DROP POLICY IF EXISTS "Owners can delete chat messages in their workspaces" ON public.agent_chat_messages;
CREATE POLICY "Owners can delete chat messages in their workspaces"
ON public.agent_chat_messages
FOR DELETE
USING (
  has_global_role(auth.uid(), 'super_admin'::app_role) 
  OR is_workspace_owner(auth.uid(), workspace_id)
);

-- rss_items
DROP POLICY IF EXISTS "Owners can delete rss items in their workspaces" ON public.rss_items;
CREATE POLICY "Owners can delete rss items in their workspaces"
ON public.rss_items
FOR DELETE
USING (
  has_global_role(auth.uid(), 'super_admin'::app_role) 
  OR is_workspace_owner(auth.uid(), workspace_id)
);

-- instagram_accounts
DROP POLICY IF EXISTS "Owners can delete instagram accounts in their workspaces" ON public.instagram_accounts;
CREATE POLICY "Owners can delete instagram accounts in their workspaces"
ON public.instagram_accounts
FOR DELETE
USING (
  has_global_role(auth.uid(), 'super_admin'::app_role) 
  OR is_workspace_owner(auth.uid(), workspace_id)
);

-- tiktok_accounts
DROP POLICY IF EXISTS "Owners can delete tiktok accounts in their workspaces" ON public.tiktok_accounts;
CREATE POLICY "Owners can delete tiktok accounts in their workspaces"
ON public.tiktok_accounts
FOR DELETE
USING (
  has_global_role(auth.uid(), 'super_admin'::app_role) 
  OR is_workspace_owner(auth.uid(), workspace_id)
);