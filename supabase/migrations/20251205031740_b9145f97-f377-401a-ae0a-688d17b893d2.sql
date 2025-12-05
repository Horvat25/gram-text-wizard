-- Add unique constraint on instagram_user_id for upsert operations
ALTER TABLE public.instagram_accounts 
ADD CONSTRAINT instagram_accounts_instagram_user_id_key UNIQUE (instagram_user_id);