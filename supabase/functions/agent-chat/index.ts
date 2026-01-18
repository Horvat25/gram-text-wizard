import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userId } = await req.json();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar contexto do usuário
    const { data: context } = await supabase
      .from('agent_context')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: recentPosts } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(10);

    const { data: recentDecisions } = await supabase
      .from('agent_decisions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    // Calcular engajamento médio
    const avgEngagement = recentPosts && recentPosts.length > 0
      ? recentPosts.reduce((acc: number, p: any) => {
          const total = (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0);
          const reach = p.reach || 1;
          return acc + (total / reach * 100);
        }, 0) / recentPosts.length
      : 0;

    // Construir contexto para o prompt
    const contextSummary = context ? `
## Configurações do Agente:
- Voz da Marca: ${context.brand_voice || 'Não definida'}
- Auto-post: ${context.auto_post_enabled ? 'Ativado' : 'Desativado'}
- Limite diário: ${context.daily_post_limit || 3} posts
- Intervalo mínimo: ${context.min_hours_between_posts || 4} horas
- Plataformas: ${context.preferred_platforms?.join(', ') || 'Instagram'}

## Aprendizados Acumulados:
- Padrões de Sucesso: ${context.success_patterns?.slice(0, 3).join('; ') || 'Nenhum ainda'}
- Melhores Horários: ${context.best_posting_times?.join(', ') || 'A definir'}
- Melhores Hashtags: ${context.best_hashtags?.slice(0, 5).join(', ') || 'Nenhuma ainda'}
- Tópicos Populares: ${context.top_topics?.slice(0, 5).join(', ') || 'Nenhum ainda'}
` : 'Contexto do agente ainda não configurado.';

    const postsSummary = recentPosts && recentPosts.length > 0 ? `
## Últimos 10 Posts Publicados:
${recentPosts.map((p: any, i: number) => `${i + 1}. "${p.caption?.slice(0, 50)}..." - ${p.likes_count || 0} likes, ${p.comments_count || 0} comentários, ${p.saves_count || 0} salvos`).join('\n')}

## Engajamento Médio: ${avgEngagement.toFixed(2)}%
` : 'Nenhum post publicado ainda.';

    const decisionsSummary = recentDecisions && recentDecisions.length > 0 ? `
## Últimas 5 Decisões do Agente:
${recentDecisions.map((d: any, i: number) => `${i + 1}. ${d.decision} - "${d.decision_reason?.slice(0, 80)}..."`).join('\n')}
` : 'Nenhuma decisão registrada ainda.';

    const systemPrompt = `Você é um agente estrategista de mídias sociais especializado em Instagram e TikTok. 
Você ajuda o usuário a criar conteúdo viral, analisar métricas e desenvolver estratégias de crescimento.

${contextSummary}

${postsSummary}

${decisionsSummary}

## Suas Capacidades:
1. **Análise de Métricas**: Avaliar performance de posts e identificar padrões
2. **Planejamento de Conteúdo**: Sugerir ideias, horários e hashtags
3. **Otimização**: Recomendar melhorias baseadas em dados
4. **Tendências**: Identificar tópicos em alta
5. **Estratégia**: Desenvolver planos de crescimento

## Diretrizes:
- Seja específico e baseado em dados quando disponíveis
- Sugira ações concretas e executáveis
- Use o contexto e histórico do usuário para personalizar respostas
- Responda em português brasileiro
- Seja proativo em sugerir melhorias
- Quando solicitado um plano de conteúdo, forneça ideias específicas com horários, hashtags e formatos`;

    // Chamar Lovable AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Limite de requisições atingido. Tente novamente em alguns segundos.' 
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos esgotados. Adicione mais créditos ao workspace.' 
        }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    
    return new Response(JSON.stringify({
      content: data.choices?.[0]?.message?.content || 'Erro ao processar resposta'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error) {
    console.error('agent-chat error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro interno' 
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
});
