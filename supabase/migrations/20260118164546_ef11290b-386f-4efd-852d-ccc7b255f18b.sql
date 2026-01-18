-- Add new columns for agent personalization
ALTER TABLE public.agent_context 
ADD COLUMN IF NOT EXISTS agent_name text DEFAULT 'Agente IA',
ADD COLUMN IF NOT EXISTS agent_avatar_url text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS system_prompt_template text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS personality_traits text[] DEFAULT ARRAY['profissional', 'criativo', 'estratégico']::text[],
ADD COLUMN IF NOT EXISTS response_style text DEFAULT 'balanced',
ADD COLUMN IF NOT EXISTS language_formality text DEFAULT 'informal',
ADD COLUMN IF NOT EXISTS emoji_usage text DEFAULT 'moderate',
ADD COLUMN IF NOT EXISTS content_focus text[] DEFAULT ARRAY['engajamento', 'crescimento']::text[],
ADD COLUMN IF NOT EXISTS target_audience text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS industry_niche text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS avoid_topics text[] DEFAULT '{}'::text[],
ADD COLUMN IF NOT EXISTS hashtag_strategy text DEFAULT 'mixed',
ADD COLUMN IF NOT EXISTS posting_style text DEFAULT 'consistent';