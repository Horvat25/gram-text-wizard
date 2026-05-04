
DROP POLICY IF EXISTS "Admins can view backups" ON public.backups;
DROP POLICY IF EXISTS "Admins can create backups" ON public.backups;
DROP POLICY IF EXISTS "Admins can update backups" ON public.backups;
DROP POLICY IF EXISTS "Admins can delete backups" ON public.backups;

CREATE POLICY "Admins can view backups" ON public.backups FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can create backups" ON public.backups FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update backups" ON public.backups FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete backups" ON public.backups FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

REVOKE SELECT (access_token, refresh_token) ON public.tiktok_accounts FROM authenticated;
REVOKE SELECT (access_token, refresh_token) ON public.tiktok_accounts FROM anon;
