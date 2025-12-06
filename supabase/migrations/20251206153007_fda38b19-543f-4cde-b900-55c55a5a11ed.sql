-- Create storage bucket for post images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-images',
  'post-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- Allow anyone to view images (public bucket)
CREATE POLICY "Anyone can view post images"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-images');

-- Allow anyone to upload images
CREATE POLICY "Anyone can upload post images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'post-images');

-- Allow anyone to delete their images
CREATE POLICY "Anyone can delete post images"
ON storage.objects FOR DELETE
USING (bucket_id = 'post-images');