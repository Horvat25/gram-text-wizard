-- Drop existing constraint and recreate with pending_review
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_status_check;

ALTER TABLE public.posts ADD CONSTRAINT posts_status_check
  CHECK (status IN ('draft', 'pending_review', 'generating', 'scheduled', 'published', 'failed'));

-- Move the leaked test post from draft -> pending_review
UPDATE public.posts SET status = 'pending_review'
WHERE id = '5440f727-58a7-4ca0-a05f-f5bd1d9988d7' AND status = 'draft';