-- Criar tabela para armazenar relatórios de execução do agente
CREATE TABLE public.agent_execution_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'cron', -- 'cron' | 'manual'
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed'
  
  -- Análise do estado
  metrics_snapshot JSONB, -- avgEngagement, lastPostHours, postsToday, etc.
  
  -- Decisão tomada
  decision TEXT, -- 'POST' | 'NO_POST' | 'WAIT'
  decision_reason TEXT,
  
  -- Conteúdo criado (se houver)
  content_plan JSONB,
  post_id UUID REFERENCES public.posts(id),
  
  -- Resumo para o usuário (mensagem amigável)
  summary TEXT,
  
  -- Aprendizado
  hypothesis TEXT,
  learning TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_execution_reports ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own execution reports" 
ON public.agent_execution_reports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Service can insert execution reports" 
ON public.agent_execution_reports 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service can update execution reports" 
ON public.agent_execution_reports 
FOR UPDATE 
USING (true);

-- Index for faster queries
CREATE INDEX idx_agent_execution_reports_user_created 
ON public.agent_execution_reports(user_id, created_at DESC);