import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ContentPlan {
  theme: string;
  format: 'noticia' | 'educacional' | 'engajamento' | 'storytelling' | 'viral' | 'vendas';
  mediaType: 'image' | 'carousel' | 'video';
  cta: string;
  tone: string;
  objective: 'alcance' | 'engajamento' | 'conversao';
  platforms: ('instagram' | 'tiktok')[];
  scheduledFor?: string;
}

interface AgentDecision {
  decision: 'POST' | 'NO_POST' | 'WAIT';
  reason: string;
  contentPlan?: ContentPlan;
  hypothesis?: string;
  expectedEngagement?: number;
}

interface AgentState {
  avgEngagement: number;
  lastPostHours: number;
  postsToday: number;
  bestPerformingTypes: string[];
  saturatedTopics: string[];
  context: any;
  recentPosts: any[];
}

// Calculate engagement rate
function calculateEngagement(post: any): number {
  const total = (post.likes_count || 0) + (post.comments_count || 0) + (post.saves_count || 0);
  const reach = post.reach || 1;
  return (total / reach) * 100;
}

// ETAPA 1: LEITURA DO MUNDO
async function analyzeCurrentState(supabase: any, userId: string): Promise<AgentState> {
  console.log('[AGENT] Etapa 1: Analisando estado atual...');
  
  const now = new Date();
  const hours72Ago = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Busca posts das últimas 72h
  const { data: posts72h, error: postsError } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'published')
    .gte('published_at', hours72Ago.toISOString())
    .order('published_at', { ascending: false });
  
  if (postsError) {
    console.error('[AGENT] Erro ao buscar posts:', postsError);
  }
  
  const recentPosts = posts72h || [];
  
  // Carrega contexto do agente
  const { data: context, error: contextError } = await supabase
    .from('agent_context')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (contextError) {
    console.error('[AGENT] Erro ao buscar contexto:', contextError);
  }
  
  // Se não existe contexto, cria um
  if (!context) {
    console.log('[AGENT] Criando contexto inicial...');
    const { data: newContext } = await supabase
      .from('agent_context')
      .insert({ user_id: userId })
      .select()
      .single();
    
    return analyzeCurrentState(supabase, userId);
  }
  
  // Calcular métricas
  const engagements = recentPosts.map(calculateEngagement);
  const avgEngagement = engagements.length > 0 
    ? engagements.reduce((a: number, b: number) => a + b, 0) / engagements.length 
    : 0;
  
  // Horas desde último post
  const lastPost = recentPosts[0];
  const lastPostTime = lastPost ? new Date(lastPost.published_at) : null;
  const lastPostHours = lastPostTime 
    ? (now.getTime() - lastPostTime.getTime()) / (1000 * 60 * 60) 
    : 999;
  
  // Posts hoje
  const postsToday = recentPosts.filter((p: any) => 
    new Date(p.published_at) >= todayStart
  ).length;
  
  // Formatos vencedores (top 3 por engajamento)
  const postsByType = recentPosts.reduce((acc: any, post: any) => {
    const type = post.post_type || 'engajamento';
    if (!acc[type]) acc[type] = [];
    acc[type].push(calculateEngagement(post));
    return acc;
  }, {});
  
  const avgByType = Object.entries(postsByType).map(([type, engagements]: [string, any]) => ({
    type,
    avg: engagements.reduce((a: number, b: number) => a + b, 0) / engagements.length
  })).sort((a, b) => b.avg - a.avg);
  
  const bestPerformingTypes = avgByType.slice(0, 3).map(t => t.type);
  
  // Temas saturados (posts das últimas 24h)
  const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentThemes = recentPosts
    .filter((p: any) => new Date(p.published_at) >= hours24Ago)
    .map((p: any) => p.post_type)
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
  
  console.log('[AGENT] Estado analisado:', {
    avgEngagement: avgEngagement.toFixed(2) + '%',
    lastPostHours: Math.round(lastPostHours) + 'h',
    postsToday,
    bestPerformingTypes,
    saturatedTopics: recentThemes
  });
  
  return {
    avgEngagement,
    lastPostHours,
    postsToday,
    bestPerformingTypes,
    saturatedTopics: recentThemes,
    context,
    recentPosts
  };
}

// ETAPA 2: DECISÃO ESTRATÉGICA
async function makeStrategicDecision(state: AgentState, lovableApiKey: string): Promise<AgentDecision> {
  console.log('[AGENT] Etapa 2: Tomando decisão estratégica...');
  
  const dailyLimit = state.context?.daily_post_limit || 2;
  const minHoursBetween = state.context?.min_hours_between_posts || 4;
  const preferredPlatforms = state.context?.preferred_platforms || ['instagram'];
  const bestTimes = state.context?.best_posting_times || ['10:00', '14:00', '19:00'];
  const successPatterns = state.context?.success_patterns || [];
  
  const systemPrompt = `Você é um agente estrategista de mídias sociais autônomo. Sua função é decidir se vale a pena postar agora e, se sim, planejar o conteúdo ideal.

REGRAS OBRIGATÓRIAS:
- NÃO poste se já foram feitos ${dailyLimit} posts hoje (atual: ${state.postsToday})
- Espere pelo menos ${minHoursBetween}h entre posts (última postagem há ${state.lastPostHours.toFixed(1)}h)
- Se engajamento médio < 3%, sugira testar formato diferente
- Se engajamento médio > 8%, mantenha o padrão vencedor
- Evite temas saturados (já usados nas últimas 24h): ${state.saturatedTopics.join(', ') || 'nenhum'}

DADOS ATUAIS:
- Engajamento médio 72h: ${state.avgEngagement.toFixed(2)}%
- Horas desde último post: ${state.lastPostHours.toFixed(1)}h
- Posts hoje: ${state.postsToday}
- Limite diário: ${dailyLimit}
- Formatos vencedores: ${state.bestPerformingTypes.join(', ') || 'dados insuficientes'}
- Melhores horários: ${bestTimes.join(', ')}
- Plataformas: ${preferredPlatforms.join(', ')}
- Padrões de sucesso anteriores: ${successPatterns.slice(0, 3).join('; ') || 'ainda aprendendo'}

FORMATOS DISPONÍVEIS:
- noticia: Conteúdo baseado em notícias atuais
- educacional: Dicas, tutoriais, how-to
- engajamento: Perguntas, enquetes, debates
- storytelling: Histórias pessoais ou de marca
- viral: Trends, memes, conteúdo compartilhável
- vendas: Promoções, CTAs diretos

Analise os dados e tome uma decisão. Seja disciplinado - NÃO poste se as condições não forem ideais.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Analise os dados e decida a próxima ação. Responda em JSON com os campos: decision (POST/NO_POST/WAIT), reason, contentPlan (se POST), hypothesis, expectedEngagement.' }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AGENT] Erro na API:', errorText);
    throw new Error(`Erro na API de decisão: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('Resposta vazia da API');
  }

  try {
    const decision = JSON.parse(content);
    console.log('[AGENT] Decisão tomada:', decision.decision, '-', decision.reason);
    return decision;
  } catch (e) {
    console.error('[AGENT] Erro ao parsear decisão:', content);
    return {
      decision: 'WAIT',
      reason: 'Erro ao processar decisão da IA'
    };
  }
}

// ETAPA 3 & 4: PLANEJAMENTO E EXECUÇÃO
async function executeContentPlan(
  supabase: any, 
  plan: ContentPlan, 
  userId: string,
  supabaseUrl: string
): Promise<any> {
  console.log('[AGENT] Etapa 3-4: Executando plano de conteúdo...');
  console.log('[AGENT] Plano:', JSON.stringify(plan, null, 2));
  
  let newsData: any = null;
  let imageUrl: string | null = null;
  
  // 1. Buscar notícias se formato for notícia
  if (plan.format === 'noticia') {
    console.log('[AGENT] Buscando notícias para tema:', plan.theme);
    try {
      const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `${plan.theme} notícias Brasil`,
          limit: 5,
          lang: 'pt-BR',
          country: 'BR'
        })
      });
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        newsData = searchData?.results?.[0];
        if (newsData?.image) {
          imageUrl = newsData.image;
          console.log('[AGENT] Imagem de notícia encontrada:', imageUrl);
        }
      }
    } catch (e) {
      console.error('[AGENT] Erro ao buscar notícias:', e);
    }
  }
  
  // 2. Gerar legenda
  console.log('[AGENT] Gerando legenda...');
  const captionResponse = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: newsData?.title || plan.theme,
      postType: plan.format,
      customInstructions: `Tom: ${plan.tone || 'profissional'}. CTA: ${plan.cta || 'Comente sua opinião!'}`
    })
  });
  
  let caption = plan.theme;
  let hashtags: string[] = [];
  
  if (captionResponse.ok) {
    const captionData = await captionResponse.json();
    caption = captionData.caption || caption;
    hashtags = captionData.hashtags || [];
    console.log('[AGENT] Legenda gerada com', caption.length, 'caracteres');
  } else {
    console.error('[AGENT] Erro ao gerar legenda');
  }
  
  // 3. Gerar imagem se não tiver da notícia
  if (!imageUrl) {
    console.log('[AGENT] Gerando imagem com IA...');
    const imageResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `Imagem profissional para post de mídia social sobre: ${plan.theme}`,
        format: 'square'
      })
    });
    
    if (imageResponse.ok) {
      const imageData = await imageResponse.json();
      imageUrl = imageData.url;
      console.log('[AGENT] Imagem gerada:', imageUrl);
    } else {
      console.error('[AGENT] Erro ao gerar imagem');
    }
  } else {
    // Adicionar watermark na imagem de notícia
    console.log('[AGENT] Adicionando watermark...');
    try {
      const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl })
      });
      
      if (watermarkResponse.ok) {
        const watermarkData = await watermarkResponse.json();
        imageUrl = watermarkData.url || imageUrl;
      }
    } catch (e) {
      console.error('[AGENT] Erro ao adicionar watermark:', e);
    }
  }
  
  // 4. Criar post no banco
  console.log('[AGENT] Salvando post no banco...');
  const { data: post, error: postError } = await supabase
    .from('posts')
    .insert({
      user_id: userId,
      caption,
      hashtags,
      image_url: imageUrl,
      post_type: plan.format,
      media_type: plan.mediaType || 'image',
      platforms: plan.platforms || ['instagram'],
      status: plan.scheduledFor ? 'scheduled' : 'draft',
      scheduled_for: plan.scheduledFor || null,
      ai_model_used: 'gemini-2.5-flash'
    })
    .select()
    .single();
  
  if (postError) {
    console.error('[AGENT] Erro ao salvar post:', postError);
    throw new Error('Falha ao salvar post no banco');
  }
  
  console.log('[AGENT] Post criado:', post.id);
  
  // 5. Publicar se auto_post_enabled e não agendado
  if (!plan.scheduledFor) {
    for (const platform of (plan.platforms || ['instagram'])) {
      console.log(`[AGENT] Publicando no ${platform}...`);
      
      try {
        if (platform === 'instagram') {
          const publishResponse = await fetch(`${supabaseUrl}/functions/v1/publish-post`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: post.id })
          });
          
          if (publishResponse.ok) {
            console.log('[AGENT] Publicado no Instagram com sucesso!');
          } else {
            console.error('[AGENT] Erro ao publicar no Instagram');
          }
        } else if (platform === 'tiktok') {
          const publishResponse = await fetch(`${supabaseUrl}/functions/v1/publish-to-tiktok`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: post.id })
          });
          
          if (publishResponse.ok) {
            console.log('[AGENT] Publicado no TikTok com sucesso!');
          } else {
            console.error('[AGENT] Erro ao publicar no TikTok');
          }
        }
      } catch (e) {
        console.error(`[AGENT] Erro ao publicar no ${platform}:`, e);
      }
    }
  }
  
  return post;
}

// ETAPA 5: MEMÓRIA E APRENDIZADO
async function recordDecisionAndLearn(
  supabase: any,
  decision: AgentDecision,
  state: AgentState,
  postId: string | null,
  userId: string
): Promise<void> {
  console.log('[AGENT] Etapa 5: Registrando decisão e aprendizados...');
  
  // Salvar decisão
  const { error: decisionError } = await supabase.from('agent_decisions').insert({
    user_id: userId,
    metrics_snapshot: {
      avgEngagement: state.avgEngagement,
      lastPostHours: state.lastPostHours,
      postsToday: state.postsToday,
      bestPerformingTypes: state.bestPerformingTypes,
      saturatedTopics: state.saturatedTopics
    },
    decision: decision.decision,
    decision_reason: decision.reason,
    content_plan: decision.contentPlan || null,
    hypothesis: decision.hypothesis || null,
    expected_engagement: decision.expectedEngagement || null,
    post_id: postId
  });
  
  if (decisionError) {
    console.error('[AGENT] Erro ao salvar decisão:', decisionError);
  } else {
    console.log('[AGENT] Decisão registrada com sucesso');
  }
  
  // Atualizar contexto do agente se houve sucesso
  if (decision.decision === 'POST' && state.avgEngagement > 5) {
    const newPatterns = [...(state.context.success_patterns || [])];
    if (decision.reason && !newPatterns.includes(decision.reason)) {
      newPatterns.push(decision.reason);
    }
    
    await supabase
      .from('agent_context')
      .update({
        success_patterns: newPatterns.slice(-10), // Keep last 10
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    console.log('[AGENT] Contexto atualizado com novo padrão de sucesso');
  }
}

// MAIN HANDLER
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[AGENT] ===== CICLO DO AGENTE INICIADO =====');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Parse request body
    let userId: string | null = null;
    let trigger = 'manual';
    
    try {
      const body = await req.json();
      userId = body.userId;
      trigger = body.trigger || 'manual';
    } catch {
      // No body or invalid JSON
    }
    
    // If triggered by cron, process all users with auto_post_enabled
    if (trigger === 'cron' && !userId) {
      console.log('[AGENT] Trigger: CRON - Processando todos os usuários ativos...');
      
      const { data: activeContexts } = await supabase
        .from('agent_context')
        .select('user_id')
        .eq('auto_post_enabled', true);
      
      if (!activeContexts || activeContexts.length === 0) {
        console.log('[AGENT] Nenhum usuário com auto_post ativo');
        return new Response(
          JSON.stringify({ success: true, message: 'Nenhum usuário ativo' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const results = [];
      for (const ctx of activeContexts) {
        try {
          const result = await processUser(supabase, ctx.user_id, lovableApiKey, supabaseUrl);
          results.push({ userId: ctx.user_id, ...result });
        } catch (e) {
          console.error(`[AGENT] Erro ao processar usuário ${ctx.user_id}:`, e);
          results.push({ userId: ctx.user_id, error: String(e) });
        }
      }
      
      console.log('[AGENT] ===== CICLO CRON FINALIZADO =====');
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Single user processing
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId é obrigatório para trigger manual' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const result = await processUser(supabase, userId, lovableApiKey, supabaseUrl);
    
    console.log('[AGENT] ===== CICLO FINALIZADO =====');
    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[AGENT] Erro fatal:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Process a single user
async function processUser(
  supabase: any, 
  userId: string, 
  lovableApiKey: string,
  supabaseUrl: string
): Promise<any> {
  console.log(`[AGENT] Processando usuário: ${userId}`);
  
  // ETAPA 1: Análise
  const state = await analyzeCurrentState(supabase, userId);
  
  // ETAPA 2: Decisão
  const decision = await makeStrategicDecision(state, lovableApiKey);
  
  let post = null;
  
  // ETAPA 3 & 4: Execução (se decisão for POST)
  if (decision.decision === 'POST' && decision.contentPlan) {
    // Check if auto_post is enabled
    if (state.context?.auto_post_enabled) {
      post = await executeContentPlan(supabase, decision.contentPlan, userId, supabaseUrl);
    } else {
      console.log('[AGENT] auto_post desativado - post criado como rascunho');
      // Create as draft only
      const { data: draftPost } = await supabase
        .from('posts')
        .insert({
          user_id: userId,
          caption: `[SUGESTÃO DO AGENTE] Tema: ${decision.contentPlan.theme}`,
          post_type: decision.contentPlan.format,
          media_type: decision.contentPlan.mediaType || 'image',
          platforms: decision.contentPlan.platforms || ['instagram'],
          status: 'draft',
          ai_model_used: 'gemini-2.5-flash'
        })
        .select()
        .single();
      
      post = draftPost;
    }
  }
  
  // ETAPA 5: Registro
  await recordDecisionAndLearn(supabase, decision, state, post?.id || null, userId);
  
  return {
    decision: decision.decision,
    reason: decision.reason,
    hypothesis: decision.hypothesis,
    expectedEngagement: decision.expectedEngagement,
    postId: post?.id,
    contentPlan: decision.contentPlan
  };
}
