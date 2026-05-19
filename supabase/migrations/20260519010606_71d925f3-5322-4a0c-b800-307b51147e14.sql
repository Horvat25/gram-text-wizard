-- Reabre 1 reel na distribuição semanal pra rodarmos o teste com ElevenLabs Sarah turbo v2.5
UPDATE public.agent_context
SET content_distribution_videos = 1,
    updated_at = now()
WHERE workspace_id = 'a0000000-0000-0000-0000-000000000001';