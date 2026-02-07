-- =====================================================
-- UPDATE RLS POLICIES FOR REMAINING TABLES
-- =====================================================

-- Settings table
DROP POLICY IF EXISTS "Users can view their own settings" ON public.settings;
DROP POLICY IF EXISTS "Users can create their own settings" ON public.settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.settings;

CREATE POLICY "Users can view settings in their workspaces"
  ON public.settings FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create settings in their workspaces"
  ON public.settings FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update settings in their workspaces"
  ON public.settings FOR UPDATE
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

-- Instagram accounts table
DROP POLICY IF EXISTS "Users can view their own instagram accounts" ON public.instagram_accounts;
DROP POLICY IF EXISTS "Users can create their own instagram accounts" ON public.instagram_accounts;
DROP POLICY IF EXISTS "Users can update their own instagram accounts" ON public.instagram_accounts;
DROP POLICY IF EXISTS "Users can delete their own instagram accounts" ON public.instagram_accounts;

CREATE POLICY "Users can view instagram accounts in their workspaces"
  ON public.instagram_accounts FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create instagram accounts in their workspaces"
  ON public.instagram_accounts FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update instagram accounts in their workspaces"
  ON public.instagram_accounts FOR UPDATE
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete instagram accounts in their workspaces"
  ON public.instagram_accounts FOR DELETE
  USING (
    public.has_global_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = instagram_accounts.workspace_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- TikTok accounts table
DROP POLICY IF EXISTS "Users can view their own tiktok accounts" ON public.tiktok_accounts;
DROP POLICY IF EXISTS "Users can create their own tiktok accounts" ON public.tiktok_accounts;
DROP POLICY IF EXISTS "Users can update their own tiktok accounts" ON public.tiktok_accounts;
DROP POLICY IF EXISTS "Users can delete their own tiktok accounts" ON public.tiktok_accounts;

CREATE POLICY "Users can view tiktok accounts in their workspaces"
  ON public.tiktok_accounts FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create tiktok accounts in their workspaces"
  ON public.tiktok_accounts FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update tiktok accounts in their workspaces"
  ON public.tiktok_accounts FOR UPDATE
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete tiktok accounts in their workspaces"
  ON public.tiktok_accounts FOR DELETE
  USING (
    public.has_global_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = tiktok_accounts.workspace_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- Agent context table
DROP POLICY IF EXISTS "Users can view their own agent context" ON public.agent_context;
DROP POLICY IF EXISTS "Users can create their own agent context" ON public.agent_context;
DROP POLICY IF EXISTS "Users can update their own agent context" ON public.agent_context;

CREATE POLICY "Users can view agent context in their workspaces"
  ON public.agent_context FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create agent context in their workspaces"
  ON public.agent_context FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update agent context in their workspaces"
  ON public.agent_context FOR UPDATE
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

-- Agent decisions table
DROP POLICY IF EXISTS "Users can view their own agent decisions" ON public.agent_decisions;
DROP POLICY IF EXISTS "Users can create their own agent decisions" ON public.agent_decisions;
DROP POLICY IF EXISTS "Users can update their own agent decisions" ON public.agent_decisions;
DROP POLICY IF EXISTS "Users can delete their own agent decisions" ON public.agent_decisions;

CREATE POLICY "Users can view agent decisions in their workspaces"
  ON public.agent_decisions FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create agent decisions in their workspaces"
  ON public.agent_decisions FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update agent decisions in their workspaces"
  ON public.agent_decisions FOR UPDATE
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete agent decisions in their workspaces"
  ON public.agent_decisions FOR DELETE
  USING (
    public.has_global_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = agent_decisions.workspace_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- Agent chat messages table
DROP POLICY IF EXISTS "Users can view their own chat messages" ON public.agent_chat_messages;
DROP POLICY IF EXISTS "Users can create their own chat messages" ON public.agent_chat_messages;
DROP POLICY IF EXISTS "Users can delete their own chat messages" ON public.agent_chat_messages;

CREATE POLICY "Users can view chat messages in their workspaces"
  ON public.agent_chat_messages FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create chat messages in their workspaces"
  ON public.agent_chat_messages FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete chat messages in their workspaces"
  ON public.agent_chat_messages FOR DELETE
  USING (
    public.has_global_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = agent_chat_messages.workspace_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- RSS items table
DROP POLICY IF EXISTS "Users can view their own RSS items" ON public.rss_items;
DROP POLICY IF EXISTS "Users can insert their own RSS items" ON public.rss_items;
DROP POLICY IF EXISTS "Users can update their own RSS items" ON public.rss_items;
DROP POLICY IF EXISTS "Users can delete their own RSS items" ON public.rss_items;

CREATE POLICY "Users can view rss items in their workspaces"
  ON public.rss_items FOR SELECT
  USING (public.has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create rss items in their workspaces"
  ON public.rss_items FOR INSERT
  WITH CHECK (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update rss items in their workspaces"
  ON public.rss_items FOR UPDATE
  USING (public.can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete rss items in their workspaces"
  ON public.rss_items FOR DELETE
  USING (
    public.has_global_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = rss_items.workspace_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );