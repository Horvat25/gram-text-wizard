-- Create trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, full_name, avatar_url)
  VALUES (gen_random_uuid(), new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  RETURN new;
END;
$$;

-- Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update posts table to link to authenticated user
ALTER TABLE public.posts
  ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop existing RLS policies on posts
DROP POLICY IF EXISTS "Anyone can create posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can delete posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can update posts" ON public.posts;
DROP POLICY IF EXISTS "Anyone can view posts" ON public.posts;

-- Create new RLS policies for posts (user-specific)
CREATE POLICY "Users can view their own posts" ON public.posts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own posts" ON public.posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts" ON public.posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts" ON public.posts
  FOR DELETE USING (auth.uid() = user_id);

-- Drop existing RLS policies on settings
DROP POLICY IF EXISTS "Anyone can insert settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can update settings" ON public.settings;
DROP POLICY IF EXISTS "Anyone can view settings" ON public.settings;

-- Add user_id to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create new RLS policies for settings (user-specific)
CREATE POLICY "Users can view their own settings" ON public.settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own settings" ON public.settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" ON public.settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Drop existing RLS policies on instagram_accounts
DROP POLICY IF EXISTS "Anyone can delete instagram accounts" ON public.instagram_accounts;
DROP POLICY IF EXISTS "Anyone can insert instagram accounts" ON public.instagram_accounts;
DROP POLICY IF EXISTS "Anyone can update instagram accounts" ON public.instagram_accounts;
DROP POLICY IF EXISTS "Anyone can view instagram accounts" ON public.instagram_accounts;

-- Add user_id to instagram_accounts table
ALTER TABLE public.instagram_accounts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create new RLS policies for instagram_accounts (user-specific)
CREATE POLICY "Users can view their own instagram accounts" ON public.instagram_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own instagram accounts" ON public.instagram_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own instagram accounts" ON public.instagram_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own instagram accounts" ON public.instagram_accounts
  FOR DELETE USING (auth.uid() = user_id);