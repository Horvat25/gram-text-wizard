
-- 1) Storage: post-images restrict to authenticated and ownership by workspace path
DROP POLICY IF EXISTS "Authenticated users can upload post images" ON storage.objects;
CREATE POLICY "Authenticated users can upload post images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'post-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_workspace_access(auth.uid(), NULLIF((storage.foldername(name))[1], '')::uuid)
  )
);

DROP POLICY IF EXISTS "Authenticated users can delete post images" ON storage.objects;
CREATE POLICY "Authenticated users can delete post images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'post-images'
  AND (
    owner = auth.uid()
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_workspace_access(auth.uid(), NULLIF((storage.foldername(name))[1], '')::uuid)
  )
);

-- 2) Storage: post-videos restrict upload by workspace path
DROP POLICY IF EXISTS "Authenticated users can upload videos" ON storage.objects;
CREATE POLICY "Authenticated users can upload videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'post-videos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_workspace_access(auth.uid(), NULLIF((storage.foldername(name))[1], '')::uuid)
  )
);

DROP POLICY IF EXISTS "Users can delete own videos" ON storage.objects;
CREATE POLICY "Users can delete own videos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'post-videos'
  AND (
    owner = auth.uid()
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_workspace_access(auth.uid(), NULLIF((storage.foldername(name))[1], '')::uuid)
  )
);

-- 3) agent_strategy_snapshots: enforce workspace membership on writes
DROP POLICY IF EXISTS "Service can insert snapshots" ON public.agent_strategy_snapshots;
DROP POLICY IF EXISTS "Service can update snapshots" ON public.agent_strategy_snapshots;

CREATE POLICY "Workspace editors can insert snapshots"
ON public.agent_strategy_snapshots FOR INSERT TO authenticated
WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Workspace editors can update snapshots"
ON public.agent_strategy_snapshots FOR UPDATE TO authenticated
USING (public.can_edit_workspace(auth.uid(), workspace_id))
WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

-- 4) Realtime: lock down broadcast/presence (postgres_changes still works via source RLS)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Deny all realtime broadcast/presence" ON realtime.messages;
CREATE POLICY "Deny all realtime broadcast/presence"
ON realtime.messages FOR SELECT TO authenticated, anon
USING (false);

-- 5) Revoke EXECUTE from anon/public on SECURITY DEFINER functions; keep authenticated only where needed by RLS
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.publish_scheduled_posts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_workspace_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_global_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_workspace_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_workspace(uuid, uuid) FROM PUBLIC, anon;
