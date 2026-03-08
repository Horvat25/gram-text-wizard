
-- Create affiliate_links table
CREATE TABLE public.affiliate_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  category TEXT DEFAULT 'geral',
  commission_info TEXT,
  is_active BOOLEAN DEFAULT true,
  posts_count INTEGER DEFAULT 0,
  last_posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view affiliate links in their workspaces"
  ON public.affiliate_links FOR SELECT
  TO authenticated
  USING (has_workspace_access(auth.uid(), workspace_id));

CREATE POLICY "Editors can create affiliate links"
  ON public.affiliate_links FOR INSERT
  TO authenticated
  WITH CHECK (can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Editors can update affiliate links"
  ON public.affiliate_links FOR UPDATE
  TO authenticated
  USING (can_edit_workspace(auth.uid(), workspace_id));

CREATE POLICY "Owners can delete affiliate links"
  ON public.affiliate_links FOR DELETE
  TO authenticated
  USING (has_global_role(auth.uid(), 'super_admin'::app_role) OR is_workspace_owner(auth.uid(), workspace_id));
