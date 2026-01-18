-- Tabela para histórico de decisões do agente
CREATE TABLE public.agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Contexto no momento da decisão
  metrics_snapshot JSONB,
  
  -- Decisão tomada
  decision TEXT NOT NULL CHECK (decision IN ('POST', 'NO_POST', 'WAIT')),
  decision_reason TEXT,
  
  -- Se POST: plano de conteúdo
  content_plan JSONB,
  
  -- Hipótese e expectativa
  hypothesis TEXT,
  expected_engagement NUMERIC,
  
  -- Resultado (preenchido depois pelo feedback loop)
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  actual_engagement NUMERIC,
  hypothesis_confirmed BOOLEAN,
  learning TEXT
);

-- Tabela para contexto persistente do agente
CREATE TABLE public.agent_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Personalidade e voz
  brand_voice TEXT DEFAULT 'profissional e envolvente',
  
  -- Padrões aprendidos
  success_patterns TEXT[] DEFAULT '{}',
  top_topics TEXT[] DEFAULT '{}',
  best_hashtags TEXT[] DEFAULT '{}',
  best_posting_times TEXT[] DEFAULT '{}',
  audience_preferences TEXT[] DEFAULT '{}',
  performance_history NUMERIC[] DEFAULT '{}',
  
  -- Configurações do agente
  auto_post_enabled BOOLEAN DEFAULT false,
  preferred_platforms TEXT[] DEFAULT ARRAY['instagram'],
  daily_post_limit INTEGER DEFAULT 2,
  min_hours_between_posts INTEGER DEFAULT 4
);

-- Enable RLS
ALTER TABLE public.agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_context ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_decisions
CREATE POLICY "Users can view their own agent decisions"
ON public.agent_decisions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agent decisions"
ON public.agent_decisions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent decisions"
ON public.agent_decisions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent decisions"
ON public.agent_decisions FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for agent_context
CREATE POLICY "Users can view their own agent context"
ON public.agent_context FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own agent context"
ON public.agent_context FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent context"
ON public.agent_context FOR UPDATE
USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_agent_decisions_user_id ON public.agent_decisions(user_id);
CREATE INDEX idx_agent_decisions_created_at ON public.agent_decisions(created_at DESC);
CREATE INDEX idx_agent_decisions_post_id ON public.agent_decisions(post_id);
CREATE INDEX idx_agent_context_user_id ON public.agent_context(user_id);