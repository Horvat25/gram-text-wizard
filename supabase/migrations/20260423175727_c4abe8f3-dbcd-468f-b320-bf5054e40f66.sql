CREATE TABLE public.newsletter_subscribers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true,
  source TEXT DEFAULT 'portal_footer',
  UNIQUE (email, workspace_id)
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe to newsletter"
ON public.newsletter_subscribers
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Workspace members can view subscribers"
ON public.newsletter_subscribers
FOR SELECT
TO authenticated
USING (workspace_id IS NULL OR has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can update subscribers"
ON public.newsletter_subscribers
FOR UPDATE
TO authenticated
USING (workspace_id IS NOT NULL AND is_workspace_owner(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can delete subscribers"
ON public.newsletter_subscribers
FOR DELETE
TO authenticated
USING (workspace_id IS NOT NULL AND is_workspace_owner(auth.uid(), workspace_id));

CREATE INDEX idx_newsletter_subscribers_workspace ON public.newsletter_subscribers(workspace_id, active);