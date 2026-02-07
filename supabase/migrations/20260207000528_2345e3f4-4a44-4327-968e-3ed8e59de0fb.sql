-- =====================================================
-- MULTI-WORKSPACE SYSTEM
-- =====================================================

-- 1. Create enum for global user roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');

-- 2. Create enum for workspace-level roles
CREATE TYPE public.workspace_role AS ENUM ('owner', 'editor', 'viewer');

-- 3. Create user_roles table (global roles)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create workspaces table
CREATE TABLE public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- 5. Create workspace_members table (user-workspace association)
CREATE TABLE public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role workspace_role NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (workspace_id, user_id)
);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- 6. Add workspace_id to existing tables
ALTER TABLE public.posts ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.settings ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.instagram_accounts ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.tiktok_accounts ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.agent_context ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.agent_decisions ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.agent_execution_reports ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.agent_chat_messages ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.rss_items ADD COLUMN workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 7. Create security definer function to check global role
CREATE OR REPLACE FUNCTION public.has_global_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 8. Create function to check if user is super_admin or admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'admin')
  )
$$;

-- 9. Create function to check workspace membership
CREATE OR REPLACE FUNCTION public.has_workspace_access(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
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
  ) OR public.has_global_role(_user_id, 'super_admin')
$$;

-- 10. Create function to check workspace role
CREATE OR REPLACE FUNCTION public.get_workspace_role(_user_id UUID, _workspace_id UUID)
RETURNS workspace_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.workspace_members
  WHERE user_id = _user_id
    AND workspace_id = _workspace_id
$$;

-- 11. Create function to check if user can edit in workspace
CREATE OR REPLACE FUNCTION public.can_edit_workspace(_user_id UUID, _workspace_id UUID)
RETURNS BOOLEAN
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
      AND role IN ('owner', 'editor')
  ) OR public.has_global_role(_user_id, 'super_admin')
$$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- User roles policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_global_role(auth.uid(), 'super_admin'));

-- Workspaces policies
CREATE POLICY "Users can view workspaces they belong to"
  ON public.workspaces FOR SELECT
  USING (
    public.has_workspace_access(auth.uid(), id)
  );

CREATE POLICY "Admins can create workspaces"
  ON public.workspaces FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Workspace owners and super_admins can update"
  ON public.workspaces FOR UPDATE
  USING (
    public.has_global_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

CREATE POLICY "Super admins can delete workspaces"
  ON public.workspaces FOR DELETE
  USING (public.has_global_role(auth.uid(), 'super_admin'));

-- Workspace members policies
CREATE POLICY "Users can view members of their workspaces"
  ON public.workspace_members FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Owners and admins can manage members"
  ON public.workspace_members FOR ALL
  USING (
    public.has_global_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
    )
  );

-- =====================================================
-- UPDATE EXISTING TABLE POLICIES
-- =====================================================

-- Drop old policies on posts
DROP POLICY IF EXISTS "Users can view their own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can create their own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can update their own posts" ON public.posts;
DROP POLICY IF EXISTS "Users can delete their own posts" ON public.posts;

-- New workspace-based policies for posts
CREATE POLICY "Users can view posts in their workspaces"
  ON public.posts FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create posts in their workspaces"
  ON public.posts FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update posts in their workspaces"
  ON public.posts FOR UPDATE
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete posts in their workspaces"
  ON public.posts FOR DELETE
  USING (
    public.has_global_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = posts.workspace_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- =====================================================
-- CREATE DEFAULT WORKSPACE AND MIGRATE DATA
-- =====================================================

-- Create default workspace
INSERT INTO public.workspaces (id, name, slug, created_by, settings)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Workspace Principal',
  'principal',
  (SELECT id FROM auth.users LIMIT 1),
  '{}'
);

-- Migrate existing data to default workspace
UPDATE public.posts SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE public.settings SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE public.instagram_accounts SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE public.tiktok_accounts SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE public.agent_context SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE public.agent_decisions SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE public.agent_execution_reports SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE public.agent_chat_messages SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;
UPDATE public.rss_items SET workspace_id = 'a0000000-0000-0000-0000-000000000001' WHERE workspace_id IS NULL;

-- Set first user as super_admin and owner of default workspace
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role FROM auth.users LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT 'a0000000-0000-0000-0000-000000000001', id, 'owner'::workspace_role
FROM auth.users LIMIT 1
ON CONFLICT DO NOTHING;

-- Trigger for updated_at
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workspace_members_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();