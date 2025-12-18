-- Add carousel_images column to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS carousel_images text[] DEFAULT NULL;