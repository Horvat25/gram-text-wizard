-- Create a dedicated bucket for videos
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('post-videos', 'post-videos', true, ARRAY['video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to videos
CREATE POLICY "Public can view videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-videos');

-- Allow authenticated users to upload videos
CREATE POLICY "Authenticated users can upload videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'post-videos' AND auth.role() = 'authenticated');

-- Allow users to delete their own videos
CREATE POLICY "Users can delete own videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'post-videos' AND auth.role() = 'authenticated');