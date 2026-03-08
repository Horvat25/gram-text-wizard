
CREATE TABLE public.agent_proactive_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  content text NOT NULL,
  message_type text NOT NULL DEFAULT 'report',
  metadata jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_proactive_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view proactive messages in their workspaces"
  ON public.agent_proactive_messages FOR SELECT
  USING (has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Service can insert proactive messages"
  ON public.agent_proactive_messages FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_agent_proactive_messages_workspace ON public.agent_proactive_messages(workspace_id, created_at DESC);
