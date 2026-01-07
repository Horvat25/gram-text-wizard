-- Create tiktok_accounts table
CREATE TABLE public.tiktok_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  open_id text NOT NULL UNIQUE,
  username text,
  display_name text,
  avatar_url text,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tiktok_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies for tiktok_accounts
CREATE POLICY "Users can view their own tiktok accounts"
ON public.tiktok_accounts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tiktok accounts"
ON public.tiktok_accounts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tiktok accounts"
ON public.tiktok_accounts
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tiktok accounts"
ON public.tiktok_accounts
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_tiktok_accounts_updated_at
BEFORE UPDATE ON public.tiktok_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add tiktok columns to posts table
ALTER TABLE public.posts 
ADD COLUMN tiktok_post_id text,
ADD COLUMN platforms text[] DEFAULT ARRAY['instagram']::text[];