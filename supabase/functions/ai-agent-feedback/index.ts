import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate engagement rate
function calculateEngagement(post: any): number {
  const total = (post.likes_count || 0) + (post.comments_count || 0) + (post.saves_count || 0);
  const reach = post.reach || 1;
  return (total / reach) * 100;
}

// Generate learning from comparison
async function generateLearning(
  decision: any,
  actualEngagement: number,
  hypothesisConfirmed: boolean,
  lovableApiKey: string
): Promise<string> {
  const systemPrompt = `Você é um analista de mídias sociais. Analise o resultado de uma postagem e gere um aprendizado conciso.

HIPÓTESE ORIGINAL: ${decision.hypothesis || 'Não especificada'}
ENGAJAMENTO ESPERADO: ${decision.expected_engagement || 'Não especificado'}%
ENGAJAMENTO REAL: ${actualEngagement.toFixed(2)}%
HIPÓTESE CONFIRMADA: ${hypothesisConfirmed ? 'SIM' : 'NÃO'}

PLANO DE CONTEÚDO USADO:
${JSON.stringify(decision.content_plan, null, 2)}

Gere um aprendizado conciso (máximo 2 frases) que possa ser usado para melhorar futuras decisões.`;

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Gere o aprendizado baseado nos dados.' }
        ]
      })
    });

    if (response.ok) {
      const result = await response.json();
      return result.choices?.[0]?.message?.content || 'Aprendizado não gerado';
    }
  } catch (e) {
    console.error('[FEEDBACK] Erro ao gerar aprendizado:', e);
  }

  return hypothesisConfirmed 
    ? 'Estratégia funcionou conforme esperado. Manter padrão.'
    : 'Resultado abaixo do esperado. Considerar ajustes na estratégia.';
}

// Update agent context with learning
async function updateAgentContext(
  supabase: any,
  userId: string,
  learning: string,
  hypothesisConfirmed: boolean,
  post: any
): Promise<void> {
  const { data: context } = await supabase
    .from('agent_context')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!context) return;

  const updates: any = {
    updated_at: new Date().toISOString()
  };

  // Update performance history
  const actualEngagement = calculateEngagement(post);
  const perfHistory = [...(context.performance_history || []), actualEngagement];
  updates.performance_history = perfHistory.slice(-50); // Keep last 50

  // If hypothesis confirmed and good engagement, add to success patterns
  if (hypothesisConfirmed && actualEngagement > 5) {
    const patterns = [...(context.success_patterns || [])];
    if (!patterns.includes(learning)) {
      patterns.push(learning);
      updates.success_patterns = patterns.slice(-10);
    }
  }

  // Update best posting times based on performance
  const postHour = new Date(post.published_at).getHours();
  if (actualEngagement > 7) {
    const times = [...(context.best_posting_times || [])];
    const timeStr = `${postHour}:00`;
    if (!times.includes(timeStr)) {
      times.push(timeStr);
      updates.best_posting_times = times.slice(-5);
    }
  }

  // Update best hashtags
  if (actualEngagement > 5 && post.hashtags?.length > 0) {
    const currentHashtags = context.best_hashtags || [];
    const newHashtags = [...new Set([...currentHashtags, ...post.hashtags])];
    updates.best_hashtags = newHashtags.slice(-20);
  }

  // Update top topics
  if (actualEngagement > 6 && post.post_type) {
    const topics = [...(context.top_topics || [])];
    if (!topics.includes(post.post_type)) {
      topics.push(post.post_type);
      updates.top_topics = topics.slice(-5);
    }
  }

  await supabase
    .from('agent_context')
    .update(updates)
    .eq('user_id', userId);

  console.log('[FEEDBACK] Contexto do agente atualizado');
}

// Process feedback for a specific post
async function processFeedbackLoop(
  supabase: any,
  postId: string,
  lovableApiKey: string
): Promise<any> {
  console.log('[FEEDBACK] Processando feedback para post:', postId);

  // Get post with real metrics
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .single();

  if (postError || !post) {
    console.error('[FEEDBACK] Post não encontrado:', postError);
    return { error: 'Post não encontrado' };
  }

  // Get original decision
  const { data: decision, error: decisionError } = await supabase
    .from('agent_decisions')
    .select('*')
    .eq('post_id', postId)
    .maybeSingle();

  if (!decision) {
    console.log('[FEEDBACK] Nenhuma decisão encontrada para este post');
    return { message: 'Post não foi criado pelo agente' };
  }

  // Calculate actual engagement
  const actualEngagement = calculateEngagement(post);
  console.log('[FEEDBACK] Engajamento real:', actualEngagement.toFixed(2) + '%');

  // Check if hypothesis was confirmed (within 20% of expected)
  const expectedEngagement = decision.expected_engagement || 5;
  const hypothesisConfirmed = actualEngagement >= (expectedEngagement * 0.8);
  console.log('[FEEDBACK] Hipótese confirmada:', hypothesisConfirmed);

  // Generate learning with LLM
  const learning = await generateLearning(
    decision,
    actualEngagement,
    hypothesisConfirmed,
    lovableApiKey
  );
  console.log('[FEEDBACK] Aprendizado:', learning);

  // Update decision with result
  const { error: updateError } = await supabase
    .from('agent_decisions')
    .update({
      actual_engagement: actualEngagement,
      hypothesis_confirmed: hypothesisConfirmed,
      learning: learning
    })
    .eq('id', decision.id);

  if (updateError) {
    console.error('[FEEDBACK] Erro ao atualizar decisão:', updateError);
  }

  // Update agent context with learning
  await updateAgentContext(
    supabase,
    decision.user_id,
    learning,
    hypothesisConfirmed,
    post
  );

  return {
    postId,
    actualEngagement,
    expectedEngagement,
    hypothesisConfirmed,
    learning
  };
}

// Process all pending feedback (posts without feedback yet)
async function processAllPendingFeedback(
  supabase: any,
  userId: string,
  lovableApiKey: string
): Promise<any[]> {
  console.log('[FEEDBACK] Buscando posts pendentes de feedback...');

  // Find decisions without actual_engagement (pending feedback)
  const { data: pendingDecisions } = await supabase
    .from('agent_decisions')
    .select('post_id')
    .eq('user_id', userId)
    .eq('decision', 'POST')
    .is('actual_engagement', null)
    .not('post_id', 'is', null);

  if (!pendingDecisions || pendingDecisions.length === 0) {
    console.log('[FEEDBACK] Nenhum feedback pendente');
    return [];
  }

  console.log(`[FEEDBACK] ${pendingDecisions.length} posts pendentes`);

  const results = [];
  for (const decision of pendingDecisions) {
    try {
      const result = await processFeedbackLoop(supabase, decision.post_id, lovableApiKey);
      results.push(result);
    } catch (e) {
      console.error('[FEEDBACK] Erro ao processar:', e);
      results.push({ postId: decision.post_id, error: String(e) });
    }
  }

  return results;
}

// MAIN HANDLER
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[FEEDBACK] ===== FEEDBACK LOOP INICIADO =====');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body or invalid JSON
    }

    const { postId, userId, processAll } = body;

    // Process single post
    if (postId) {
      const result = await processFeedbackLoop(supabase, postId, lovableApiKey);
      
      console.log('[FEEDBACK] ===== FEEDBACK LOOP FINALIZADO =====');
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process all pending for a user
    if (userId && processAll) {
      const results = await processAllPendingFeedback(supabase, userId, lovableApiKey);
      
      console.log('[FEEDBACK] ===== FEEDBACK LOOP FINALIZADO =====');
      return new Response(
        JSON.stringify({ success: true, processed: results.length, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'postId ou userId com processAll é obrigatório' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[FEEDBACK] Erro fatal:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
