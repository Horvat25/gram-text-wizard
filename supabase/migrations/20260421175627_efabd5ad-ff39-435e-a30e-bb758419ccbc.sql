-- Cancelar Reels mudo da Coca-Cola e draft órfão de Reels
-- Decisão do usuário: desligar Reels automáticos. Sem render service, esses posts ficam mudos ou presos como draft.
UPDATE public.posts
SET 
  status = 'failed',
  error_message = 'Cancelado: Reels automáticos desligados pelo usuário (qualidade — Pexels mudo).',
  updated_at = now()
WHERE id IN (
  '28c1decc-2509-4d56-9dfa-b39af6005d17',
  '342895d1-2b63-452a-9136-920d0547ad69'
)
AND status IN ('scheduled', 'draft');