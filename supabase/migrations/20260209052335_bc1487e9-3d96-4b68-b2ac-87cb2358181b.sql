-- Drop existing foreign key constraint
ALTER TABLE public.rss_items 
DROP CONSTRAINT IF EXISTS rss_items_used_in_post_id_fkey;

-- Re-add with ON DELETE SET NULL
ALTER TABLE public.rss_items
ADD CONSTRAINT rss_items_used_in_post_id_fkey 
FOREIGN KEY (used_in_post_id) 
REFERENCES public.posts(id) 
ON DELETE SET NULL;