-- Create policies for post-images bucket (drop if exists first)
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Public read access for post images" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload post images" ON storage.objects;
  DROP POLICY IF EXISTS "Service role can manage post images" ON storage.objects;
END $$;

-- Allow public read access to post images
CREATE POLICY "Public read access for post images"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-images');

-- Allow authenticated users to upload post images
CREATE POLICY "Authenticated users can upload post images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'post-images');

-- Allow authenticated users to delete their post images
CREATE POLICY "Users can delete post images"
ON storage.objects FOR DELETE
USING (bucket_id = 'post-images');