
-- 1. Drop overly-permissive "Service" policies (edge functions use service-role key which bypasses RLS)
DROP POLICY IF EXISTS "Service can insert execution reports" ON public.agent_execution_reports;
DROP POLICY IF EXISTS "Service can update execution reports" ON public.agent_execution_reports;
DROP POLICY IF EXISTS "Service can insert proactive messages" ON public.agent_proactive_messages;
DROP POLICY IF EXISTS "Service can insert RSS items" ON public.rss_items;
DROP POLICY IF EXISTS "Service can update RSS items" ON public.rss_items;

-- 2. Fix workspaces update policy self-reference bug
DROP POLICY IF EXISTS "Workspace owners and super_admins can update" ON public.workspaces;
CREATE POLICY "Workspace owners and super_admins can update"
ON public.workspaces
FOR UPDATE
USING (
  has_global_role(auth.uid(), 'super_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
      AND workspace_members.role = 'owner'::workspace_role
  )
);

-- 3. Revoke column-level SELECT on access_token from anon/authenticated
REVOKE SELECT (access_token) ON public.instagram_accounts FROM anon, authenticated;
REVOKE SELECT (access_token) ON public.instagram_credentials FROM anon, authenticated;

-- 4. Tighten post-images storage policies — drop anonymous upload/delete
DROP POLICY IF EXISTS "Anyone can upload post images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete post images" ON storage.objects;

-- Recreate scoped to authenticated users
DROP POLICY IF EXISTS "Users can delete post images" ON storage.objects;
CREATE POLICY "Authenticated users can delete post images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'post-images');

-- 5. Revoke EXECUTE on SECURITY DEFINER functions that should not be callable via API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.publish_scheduled_posts() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
