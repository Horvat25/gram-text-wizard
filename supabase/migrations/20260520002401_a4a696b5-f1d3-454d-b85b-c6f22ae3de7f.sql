
-- Allow editors (not just owners) to delete chat messages in their workspace
DROP POLICY IF EXISTS "Owners can delete chat messages in their workspaces" ON public.agent_chat_messages;
CREATE POLICY "Editors can delete chat messages in their workspaces"
ON public.agent_chat_messages
FOR DELETE
USING (public.can_edit_workspace(auth.uid(), workspace_id));

-- Allow editors to delete proactive messages in their workspace
CREATE POLICY "Editors can delete proactive messages in their workspaces"
ON public.agent_proactive_messages
FOR DELETE
USING (public.can_edit_workspace(auth.uid(), workspace_id));

-- Allow users to delete their own execution reports
CREATE POLICY "Users can delete their own execution reports"
ON public.agent_execution_reports
FOR DELETE
USING (auth.uid() = user_id);
