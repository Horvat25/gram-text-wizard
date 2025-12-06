-- Add profile_picture_url column to instagram_accounts table
ALTER TABLE public.instagram_accounts ADD COLUMN profile_picture_url TEXT DEFAULT NULL;