import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define available tools for the agent
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_posts",
      description: "Cria um ou mais posts no banco de dados. Use quando o usuário pedir para criar conteúdo, plano de conteúdo, ou posts.",
      parameters: {
        type: "object",
        properties: {
          posts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                caption: { type: "string", description: "Texto/legenda do post" },
                hashtags: { type: "array", items: { type: "string" }, description: "Lista de hashtags" },
                post_type: { type: "string", enum: ["engajamento", "educacional", "promocional", "entretenimento"], description: "Tipo do post" },
                scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601). Se não fornecido, será rascunho." },
                platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" }
              },
              required: ["caption"]
            },
            description: "Lista de posts a criar"
          }
        },
        required: ["posts"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_image_for_post",
      description: "Gera uma imagem AI para um post existente. Use quando o usuário pedir para gerar imagem/visual para um post.",
      parameters: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID do post para adicionar a imagem" },
          image_prompt: { type: "string", description: "Descrição detalhada da imagem a gerar" }
        },
        required: ["post_id", "image_prompt"]
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "schedule_post",
      description: "Agenda um post existente para publicação. Use quando o usuário pedir para agendar um post.",
      parameters: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID do post a agendar" },
          scheduled_for: { type: "string", description: "Data/hora para publicar (ISO 8601)" }
        },
        required: ["post_id", "scheduled_for"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_performance_data",
      description: "Busca dados de performance dos posts. Use quando o usuário pedir análise, métricas ou relatórios.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Quantos dias de histórico buscar (padrão: 30)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_autonomous_agent",
      description: "Executa o agente autônomo para analisar e decidir se deve criar/publicar conteúdo. Use quando o usuário pedir para 'rodar o agente' ou 'executar ciclo'.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_posts",
      description: "Lista posts existentes. Use quando o usuário perguntar sobre posts, rascunhos ou agendados.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "scheduled", "published", "all"], description: "Filtrar por status" },
          limit: { type: "number", description: "Quantidade máxima de posts (padrão: 10)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_post",
      description: "Deleta um post. Use quando o usuário pedir para remover ou excluir um post.",
      parameters: {
        type: "object",
        properties: {
          post_id: { type: "string", description: "ID do post a deletar" }
        },
        required: ["post_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_agent_settings",
      description: "Atualiza configurações do agente. Use quando o usuário quiser mudar preferências.",
      parameters: {
        type: "object",
        properties: {
          auto_post_enabled: { type: "boolean", description: "Ativar/desativar auto-post" },
          daily_post_limit: { type: "number", description: "Limite diário de posts" },
          min_hours_between_posts: { type: "number", description: "Intervalo mínimo entre posts (horas)" },
          brand_voice: { type: "string", description: "Voz/tom da marca" },
          preferred_platforms: { type: "array", items: { type: "string" }, description: "Plataformas preferidas" }
        }
      }
    }
  }
];

// Tool execution functions
async function executeCreatePosts(supabase: any, userId: string, args: any) {
  const { posts } = args;
  const createdPosts = [];
  
  for (const post of posts) {
    const postData = {
      user_id: userId,
      caption: post.caption,
      hashtags: post.hashtags || [],
      post_type: post.post_type || 'engajamento',
      platforms: post.platforms || ['instagram'],
      status: post.scheduled_for ? 'scheduled' : 'draft',
      scheduled_for: post.scheduled_for || null,
      media_type: 'image'
    };
    
    const { data, error } = await supabase
      .from('posts')
      .insert(postData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating post:', error);
      continue;
    }
    
    createdPosts.push(data);
  }
  
  return {
    success: true,
    message: `✅ ${createdPosts.length} post(s) criado(s) com sucesso!`,
    posts: createdPosts.map(p => ({
      id: p.id,
      caption: p.caption.slice(0, 50) + '...',
      status: p.status,
      scheduled_for: p.scheduled_for
    }))
  };
}

async function executeGenerateImage(supabase: any, userId: string, args: any) {
  const { post_id, image_prompt } = args;
  
  // Call the generate-image function
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({ 
      prompt: image_prompt,
      userId,
      postId: post_id
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, message: `❌ Erro ao gerar imagem: ${errorText}` };
  }
  
  const result = await response.json();
  
  // Update the post with the image URL
  if (result.imageUrl) {
    await supabase
      .from('posts')
      .update({ image_url: result.imageUrl })
      .eq('id', post_id)
      .eq('user_id', userId);
  }
  
  return {
    success: true,
    message: `🎨 Imagem gerada com sucesso!`,
    imageUrl: result.imageUrl
  };
}

async function executeSchedulePost(supabase: any, userId: string, args: any) {
  const { post_id, scheduled_for } = args;
  
  const { data, error } = await supabase
    .from('posts')
    .update({ 
      status: 'scheduled',
      scheduled_for
    })
    .eq('id', post_id)
    .eq('user_id', userId)
    .select()
    .single();
  
  if (error) {
    return { success: false, message: `❌ Erro ao agendar: ${error.message}` };
  }
  
  return {
    success: true,
    message: `📅 Post agendado para ${new Date(scheduled_for).toLocaleString('pt-BR')}`,
    post: data
  };
}

async function executeGetPerformance(supabase: any, userId: string, args: any) {
  const days = args.days || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'published')
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: false });
  
  if (!posts || posts.length === 0) {
    return {
      success: true,
      message: `📊 Nenhum post publicado nos últimos ${days} dias.`,
      data: { posts: 0 }
    };
  }
  
  const totalLikes = posts.reduce((acc: number, p: any) => acc + (p.likes_count || 0), 0);
  const totalComments = posts.reduce((acc: number, p: any) => acc + (p.comments_count || 0), 0);
  const totalSaves = posts.reduce((acc: number, p: any) => acc + (p.saves_count || 0), 0);
  const totalReach = posts.reduce((acc: number, p: any) => acc + (p.reach || 0), 0);
  
  const avgEngagement = totalReach > 0 
    ? ((totalLikes + totalComments + totalSaves) / totalReach * 100).toFixed(2)
    : 0;
  
  return {
    success: true,
    message: `📊 Performance dos últimos ${days} dias`,
    data: {
      total_posts: posts.length,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_saves: totalSaves,
      total_reach: totalReach,
      avg_engagement: `${avgEngagement}%`,
      top_post: posts[0] ? {
        caption: posts[0].caption.slice(0, 50) + '...',
        likes: posts[0].likes_count,
        engagement: posts[0].reach > 0 
          ? ((posts[0].likes_count + posts[0].comments_count + posts[0].saves_count) / posts[0].reach * 100).toFixed(2) + '%'
          : '0%'
      } : null
    }
  };
}

async function executeRunAgent(supabase: any, userId: string) {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-agent-core`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({ userId })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, message: `❌ Erro ao executar agente: ${errorText}` };
  }
  
  const result = await response.json();
  
  return {
    success: true,
    message: `🤖 Agente executado!`,
    result: {
      decision: result.decision,
      reason: result.decisionReason,
      hypothesis: result.hypothesis,
      post_created: result.postId ? true : false
    }
  };
}

async function executeListPosts(supabase: any, userId: string, args: any) {
  const status = args.status || 'all';
  const limit = args.limit || 10;
  
  let query = supabase
    .from('posts')
    .select('id, caption, status, scheduled_for, published_at, likes_count, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (status !== 'all') {
    query = query.eq('status', status);
  }
  
  const { data: posts, error } = await query;
  
  if (error) {
    return { success: false, message: `❌ Erro: ${error.message}` };
  }
  
  return {
    success: true,
    message: `📋 ${posts.length} post(s) encontrado(s)`,
    posts: posts.map((p: any) => ({
      id: p.id,
      caption: p.caption.slice(0, 60) + (p.caption.length > 60 ? '...' : ''),
      status: p.status,
      scheduled_for: p.scheduled_for,
      likes: p.likes_count
    }))
  };
}

async function executeDeletePost(supabase: any, userId: string, args: any) {
  const { post_id } = args;
  
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', post_id)
    .eq('user_id', userId);
  
  if (error) {
    return { success: false, message: `❌ Erro ao deletar: ${error.message}` };
  }
  
  return {
    success: true,
    message: `🗑️ Post deletado com sucesso!`
  };
}

async function executeUpdateSettings(supabase: any, userId: string, args: any) {
  // Check if context exists
  const { data: existing } = await supabase
    .from('agent_context')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  
  const updateData: any = {};
  if (args.auto_post_enabled !== undefined) updateData.auto_post_enabled = args.auto_post_enabled;
  if (args.daily_post_limit !== undefined) updateData.daily_post_limit = args.daily_post_limit;
  if (args.min_hours_between_posts !== undefined) updateData.min_hours_between_posts = args.min_hours_between_posts;
  if (args.brand_voice !== undefined) updateData.brand_voice = args.brand_voice;
  if (args.preferred_platforms !== undefined) updateData.preferred_platforms = args.preferred_platforms;
  
  if (existing) {
    const { error } = await supabase
      .from('agent_context')
      .update(updateData)
      .eq('user_id', userId);
    
    if (error) {
      return { success: false, message: `❌ Erro: ${error.message}` };
    }
  } else {
    const { error } = await supabase
      .from('agent_context')
      .insert({ user_id: userId, ...updateData });
    
    if (error) {
      return { success: false, message: `❌ Erro: ${error.message}` };
    }
  }
  
  return {
    success: true,
    message: `⚙️ Configurações atualizadas!`,
    settings: updateData
  };
}

// Execute a tool call
async function executeTool(supabase: any, userId: string, toolName: string, args: any) {
  switch (toolName) {
    case 'create_posts':
      return executeCreatePosts(supabase, userId, args);
    case 'generate_image_for_post':
      return executeGenerateImage(supabase, userId, args);
    case 'schedule_post':
      return executeSchedulePost(supabase, userId, args);
    case 'get_performance_data':
      return executeGetPerformance(supabase, userId, args);
    case 'run_autonomous_agent':
      return executeRunAgent(supabase, userId);
    case 'list_posts':
      return executeListPosts(supabase, userId, args);
    case 'delete_post':
      return executeDeletePost(supabase, userId, args);
    case 'update_agent_settings':
      return executeUpdateSettings(supabase, userId, args);
    default:
      return { success: false, message: `Ferramenta desconhecida: ${toolName}` };
  }
}

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

    // Fetch context
    const { data: context } = await supabase
      .from('agent_context')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: recentPosts } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Build dynamic system prompt based on user config
    const agentName = context?.agent_name || 'Aria';
    const brandVoice = context?.brand_voice || 'Autêntico, provocador e valioso. Fala como um amigo especialista.';
    const personalityTraits = context?.personality_traits?.join(', ') || 'provocador, estratégico, autêntico, data-driven';
    const responseStyle = context?.response_style || 'storytelling';
    const languageFormality = context?.language_formality || 'informal';
    const emojiUsage = context?.emoji_usage || 'moderate';
    const contentFocus = context?.content_focus?.join(', ') || 'compartilhamento, autoridade, comunidade';
    const targetAudience = context?.target_audience || 'Empreendedores e criadores de conteúdo 25-40 anos';
    const industryNiche = context?.industry_niche || 'Marketing Digital & Criação de Conteúdo';
    const avoidTopics = context?.avoid_topics?.length > 0 ? context.avoid_topics.join(', ') : 'política, religião, polêmicas';
    const hashtagStrategy = context?.hashtag_strategy || 'nicho-focado';
    const postingStyle = context?.posting_style || 'strategic-bursts';
    const customPrompt = context?.system_prompt_template || '';

    const emojiGuide = {
      'none': 'NÃO use emojis nas respostas.',
      'minimal': 'Use 1-2 emojis por mensagem, apenas em pontos-chave para enfatizar.',
      'moderate': 'Use emojis estrategicamente para marcar transições e destacar CTAs. Não decore, comunique.',
      'frequent': 'Use emojis expressivamente para criar energia e personalidade vibrante.'
    };

    const responseStyleGuide = {
      'concise': 'Vá direto ao ponto. Cada palavra deve ter propósito. Corte o fluff.',
      'balanced': 'Equilibre clareza com profundidade. Explique o suficiente, nunca demais.',
      'detailed': 'Forneça análises completas com dados, exemplos e próximos passos acionáveis.',
      'storytelling': 'Transforme insights em narrativas. Abra loops, crie tensão, entregue a revelação. Faça o leitor sentir, não apenas entender.'
    };

    const formalityGuide = {
      'formal': 'Linguagem polida e respeitosa. Autoridade através de precisão.',
      'informal': 'Fale como um amigo expert. Descontraído mas nunca superficial.',
      'casual': 'Super casual, usa gírias e memes. Energia de conversa de bar.',
      'professional': 'Tom de consultor sênior. Acessível mas com peso de especialista.'
    };

    const hashtagGuide = {
      'minimal': 'Use apenas 3-5 hashtags ultra-específicas do nicho.',
      'nicho-focado': 'Use 5-8 hashtags. Priorize categorização sobre descoberta. 70% nicho específico, 30% médio alcance.',
      'mixed': 'Use 8-10 hashtags balanceadas entre nicho, médio e amplo alcance.',
      'aggressive': 'Use 15-20 hashtags maximizando descoberta (cuidado: pode parecer spam).'
    };

    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay(); // 0=Dom, 6=Sáb
    const isOptimalTime = (currentDay >= 2 && currentDay <= 4 && currentHour >= 11 && currentHour <= 18);

    const systemPrompt = `Você é **${agentName}**, um estrategista de conteúdo autônomo com PODER DE EXECUTAR ações reais.

## 🧠 SUA ESSÊNCIA
**Personalidade:** ${personalityTraits}
**Voz:** ${brandVoice}

**Como você comunica:**
- ${responseStyleGuide[responseStyle as keyof typeof responseStyleGuide] || responseStyleGuide.storytelling}
- ${formalityGuide[languageFormality as keyof typeof formalityGuide] || formalityGuide.informal}
- ${emojiGuide[emojiUsage as keyof typeof emojiGuide] || emojiGuide.moderate}

## 🎯 CONTEXTO ESTRATÉGICO
| Aspecto | Configuração |
|---------|-------------|
| Nicho | ${industryNiche} |
| Público | ${targetAudience} |
| Foco | ${contentFocus} |
| Hashtags | ${hashtagGuide[hashtagStrategy as keyof typeof hashtagGuide] || hashtagGuide['nicho-focado']} |
| Ritmo | ${postingStyle} (${context?.daily_post_limit || 1} posts/dia, mín ${context?.min_hours_between_posts || 8}h entre posts) |
| Evitar | ${avoidTopics} |

## 📊 INTELIGÊNCIA DE ALGORITMO 2025
**HIERARQUIA DE MÉTRICAS (em ordem de peso):**
1. 🔄 **SHARES** - Sinalizam "isso é importante pra outras pessoas" (MÁXIMO PESO)
2. 💾 **SAVES** - Sinalizam "vou usar isso depois" (alto peso)
3. 💬 **COMMENTS** - Sinalizam conversa (médio peso)
4. ❤️ **LIKES** - Sinalizam aprovação passiva (baixo peso)

**REGRAS DE OURO:**
- Primeiros 3 segundos decidem TUDO (hook ou morte)
- Consistência de tópico > quantidade de posts
- ${isOptimalTime ? '✅ AGORA é horário ótimo para postar!' : '⚠️ Horário atual NÃO é ideal. Melhores: Ter-Qui 11h-18h'}
- Sábados = pior dia (evitar agendamentos)
- Trial Reels = teste sem risco com não-seguidores

## 🔧 FERRAMENTAS DISPONÍVEIS
Você EXECUTA, não sugere. Use suas ferramentas:
| Ferramenta | Quando usar |
|------------|-------------|
| \`create_posts\` | Criar posts (rascunhos ou agendados) |
| \`generate_image_for_post\` | Gerar visual AI para um post |
| \`schedule_post\` | Agendar post existente |
| \`get_performance_data\` | Analisar métricas e performance |
| \`run_autonomous_agent\` | Executar ciclo autônomo completo |
| \`list_posts\` | Ver posts existentes |
| \`delete_post\` | Remover um post |
| \`update_agent_settings\` | Mudar configurações |

## ⚡ FÓRMULA DE CONTEÚDO VIRAL

### ESTRUTURA HOOK-VALUE-CTA
\`\`\`
[HOOK] ← Para o scroll em 3 segundos
   ↓
[REVELAÇÃO] ← Entrega o insight prometido
   ↓
[PROVA] ← Dados, resultados, casos
   ↓
[CTA] ← Otimizado para SHARE
\`\`\`

### TIPOS DE HOOK EFETIVOS:
- **Open Loop:** "O que acontece quando você..." (curiosidade)
- **Contrarian:** "Todo mundo acha X, mas na verdade..." (tensão)
- **Data Bomb:** "98% das pessoas não sabem que..." (autoridade)
- **Provocação:** "Você está fazendo isso errado" (ego)
- **Promessa:** "Em 30 dias você vai..." (transformação)

### CTAs OTIMIZADOS PARA SHARE:
- "Marca quem precisa ver isso"
- "Envia pro grupo do trabalho"
- "Salva pra quando precisar"
- Perguntas polêmicas que geram debate

## 📋 STATUS ATUAL
- Auto-post: ${context?.auto_post_enabled ? '🟢 Ativado' : '🔴 Desativado'}
- Plataformas: ${context?.preferred_platforms?.join(', ') || 'instagram'}
- Posts recentes: ${recentPosts?.length || 0}
- Data/hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}

## ⚠️ DIRETRIZES ABSOLUTAS
1. **EXECUTE** ações quando pedido - não apenas sugira
2. Ao criar plano de conteúdo, USE create_posts para criar DE VERDADE
3. Após ações, confirme o que foi feito
4. SEMPRE português brasileiro
5. Mantenha sua personalidade consistente
6. Priorize QUALIDADE sobre quantidade
7. Cada post deve passar no teste: "Alguém compartilharia isso?"

${customPrompt ? `## 📝 INSTRUÇÕES PERSONALIZADAS\n${customPrompt}` : ''}`;

    // First API call with tools
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
        ],
        tools: AGENT_TOOLS,
        tool_choice: 'auto'
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
          error: 'Créditos esgotados.' 
        }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    
    // Check if there are tool calls to execute
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      const toolResults = [];
      const executedActions = [];
      
      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        
        console.log(`Executing tool: ${toolName}`, toolArgs);
        
        const result = await executeTool(supabase, userId, toolName, toolArgs);
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
        executedActions.push({
          tool: toolName,
          ...result
        });
      }
      
      // Second API call with tool results to get final response
      const finalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-3-flash-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            choice.message,
            ...toolResults
          ]
        })
      });
      
      if (!finalResponse.ok) {
        // Return tool results even if final response fails
        return new Response(JSON.stringify({
          content: `Ações executadas:\n${executedActions.map(a => a.message).join('\n')}`,
          actions: executedActions
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      
      const finalData = await finalResponse.json();
      
      return new Response(JSON.stringify({
        content: finalData.choices?.[0]?.message?.content || 'Ações executadas com sucesso!',
        actions: executedActions
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }
    
    // No tool calls, just return the response
    return new Response(JSON.stringify({
      content: choice?.message?.content || 'Erro ao processar resposta'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error) {
    console.error('agent-chat error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Erro interno' 
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  }
});
