ALTER TABLE public.agent_decisions DROP CONSTRAINT IF EXISTS agent_decisions_decision_check;

ALTER TABLE public.agent_decisions ADD CONSTRAINT agent_decisions_decision_check 
CHECK (decision = ANY (ARRAY[
  'POST'::text, 
  'NO_POST'::text, 
  'WAIT'::text,
  'test_approved'::text,
  'test_rejected'::text,
  'test_regenerated'::text
]));