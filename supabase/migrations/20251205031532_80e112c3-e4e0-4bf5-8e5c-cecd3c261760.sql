-- Create instagram_accounts table for storing connected Instagram accounts
CREATE TABLE public.instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id TEXT,
  instagram_user_id TEXT NOT NULL,
  username TEXT,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Public access for this demo (no auth required)
CREATE POLICY "Anyone can view instagram accounts"
ON public.instagram_accounts
FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert instagram accounts"
ON public.instagram_accounts
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update instagram accounts"
ON public.instagram_accounts
FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete instagram accounts"
ON public.instagram_accounts
FOR DELETE
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_instagram_accounts_updated_at
BEFORE UPDATE ON public.instagram_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();