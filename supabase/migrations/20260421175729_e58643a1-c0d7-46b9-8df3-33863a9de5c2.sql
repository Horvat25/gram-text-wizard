-- Tabela de cache para resultados de pesquisas Firecrawl
CREATE TABLE IF NOT EXISTS public.firecrawl_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  query TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Index para busca rápida por chave + expiração
CREATE INDEX IF NOT EXISTS idx_firecrawl_cache_key_expires 
  ON public.firecrawl_cache (cache_key, expires_at);

-- Enable RLS — apenas service role escreve/lê via edge functions
ALTER TABLE public.firecrawl_cache ENABLE ROW LEVEL SECURITY;

-- Bloqueia totalmente acesso direto de usuários (apenas service role usa)
CREATE POLICY "Service role only - firecrawl_cache"
  ON public.firecrawl_cache
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);