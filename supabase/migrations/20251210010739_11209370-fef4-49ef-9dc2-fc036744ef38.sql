-- Add new columns to posts table for enhanced AI generation
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'image';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_model_used TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS overlay_metadata JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS external_job_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cost_estimate NUMERIC(10,4) DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_url TEXT;