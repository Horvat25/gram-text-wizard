import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Define available tools for the agent
// FOCO: Instagram de Notícias Tech - RSS como fonte principal, vídeos mantidos
const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "create_rss_news_post",
      description: "📰 MÉTODO PRINCIPAL para criar posts! Busca notícia REAL do banco de RSS (Tecnoblog, TecMundo, Canaltech, etc). Aplica headline estilo @davision.eth na imagem. Use para QUALQUER pedido de post/notícia/conteúdo de imagem.",
      parameters: {
        type: "object",
        properties: {
          topic_filter: { type: "string", description: "Palavra-chave para filtrar notícias (ex: 'IA', 'OpenAI', 'robô', 'Tesla'). Se vazio, pega a mais recente." },
          headline_text: { type: "string", description: "Headline com TENSÃO IMPLÍCITA (máx 2 linhas, CAIXA ALTA). NÃO explique tudo. Gere conflito. Ex: 'SAM ALTMAN SABIA DISSO HÁ 2 ANOS. AGORA É TARDE DEMAIS.'" },
          caption_block1: { type: "string", description: "Bloco 1: COMPLEMENTA a headline (não repete!). Frase que segura a atenção após a headline puxar." },
          caption_block2: { type: "string", description: "Bloco 2: contexto mínimo (suficiente para entender)" },
          caption_block3: { type: "string", description: "Bloco 3: reflexão, consequência ou pergunta implícita" },
          theme_tags: { type: "array", items: { type: "string" }, description: "Tags internas invisíveis para analytics (ex: ['IA', 'Big Tech', 'Segurança', 'Futuro do Trabalho']). Não aparece no post." },
          scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601, horário Brasília). Se não fornecido e auto_post ativo, publica agora." },
          platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "refresh_rss_feeds",
      description: "🔄 Atualiza os feeds RSS buscando notícias novas de todas as fontes (Tecnoblog, TecMundo, Canaltech, Olhar Digital, etc). Use quando não tiver notícias disponíveis ou quiser conteúdo mais recente.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Quantidade de notícias por fonte (padrão: 10)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_available_news",
      description: "📋 Lista notícias disponíveis no banco de RSS para criar posts. Use para ver quais temas/notícias estão disponíveis antes de criar posts.",
      parameters: {
        type: "object",
        properties: {
          only_with_images: { type: "boolean", description: "Mostrar apenas notícias com imagem (padrão: true)" },
          limit: { type: "number", description: "Quantidade máxima (padrão: 10)" },
          source_filter: { type: "string", description: "Filtrar por fonte (ex: 'Tecnoblog', 'TecMundo')" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_narrated_video",
      description: "🎬 OBRIGATÓRIO para VÍDEO, REELS ou conteúdo NARRADO! Cria vídeo com roteiro viral, múltiplas imagens cinematográficas e narração. Use SEMPRE que o usuário mencionar: 'vídeo', 'reels', 'reel', 'stories', 'shorts'.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Tema do vídeo (DEVE ser sobre tecnologia, inovação, futuro, IA)" },
          caption: { type: "string", description: "Legenda do post para Instagram/TikTok" },
          hashtags: { type: "array", items: { type: "string" }, description: "Hashtags relevantes" },
          scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601, horário Brasília)." },
          publish_now: { type: "boolean", description: "Se true, publicar assim que o vídeo estiver pronto." },
          platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" },
          style: { type: "string", description: "Estilo: impactante, educativo, provocativo, inspirador" },
          article_url: { type: "string", description: "URL do artigo de notícia (para extrair imagens do site original)" },
          article_image_url: { type: "string", description: "URL da imagem principal do artigo (og:image da notícia RSS)" }
        },
        required: ["topic", "caption"]
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "schedule_post",
      description: "Agenda um post existente para publicação.",
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
      description: "Busca dados de performance dos posts.",
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
      name: "get_detailed_analytics",
      description: "Busca estatísticas detalhadas do banco de dados.",
      parameters: {
        type: "object",
        properties: {
          query_type: { 
            type: "string", 
            enum: ["overview", "by_media_type", "by_status", "by_platform", "by_date_range", "recent_activity"],
            description: "Tipo de consulta"
          },
          days: { type: "number", description: "Período em dias (padrão: 30)" }
        },
        required: ["query_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_posts",
      description: "Lista posts existentes (rascunhos, agendados, publicados).",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "scheduled", "published", "all"] },
          limit: { type: "number", description: "Quantidade máxima (padrão: 10)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_post",
      description: "Deleta um post.",
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
      description: "Atualiza configurações do agente.",
      parameters: {
        type: "object",
        properties: {
          auto_post_enabled: { type: "boolean" },
          daily_post_limit: { type: "number" },
          min_hours_between_posts: { type: "number" },
          brand_voice: { type: "string" },
          preferred_platforms: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_autonomous_agent",
      description: "Executa o agente autônomo para analisar e decidir se deve criar/publicar conteúdo.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_web_images",
      description: "🖼️ Busca imagens na web sobre um tema. Use quando o usuário quer ver opções de imagens ou escolher uma imagem específica para um post. Retorna uma lista de imagens para o usuário selecionar.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Termo de busca para as imagens (ex: 'inteligência artificial', 'robô humanoide', 'chip de computador')" },
          count: { type: "number", description: "Quantidade de imagens para buscar (padrão: 5, máx: 10)" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_post_with_image_url",
      description: "📸 Cria um post usando uma imagem específica da web (URL). Use quando o usuário escolher uma imagem específica ou fornecer uma URL de imagem. A imagem será processada com nossa marca e headline.",
      parameters: {
        type: "object",
        properties: {
          image_url: { type: "string", description: "URL da imagem a usar" },
          headline_text: { type: "string", description: "Headline para sobrepor na imagem (CAIXA ALTA, máx 2 linhas)" },
          caption: { type: "string", description: "Legenda do post" },
          hashtags: { type: "array", items: { type: "string" }, description: "Hashtags" },
          scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601)" },
          platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" }
        },
        required: ["image_url", "caption"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "explain_capabilities",
      description: "📋 Explica ao usuário o que o agente pode fazer. Use quando o usuário perguntar 'o que você faz?', 'me ajuda?', 'quais suas capacidades?' ou similar.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_affiliate_post",
      description: "💰 Cria um post de marketing promovendo um produto de afiliado cadastrado. Busca um link ativo do banco. Use quando o ciclo autônomo decidir intercalar marketing ou quando o usuário pedir.",
      parameters: {
        type: "object",
        properties: {
          affiliate_id: { type: "string", description: "ID do link de afiliado específico. Se vazio, escolhe automaticamente o menos promovido." },
          headline_text: { type: "string", description: "Headline de marketing (CAIXA ALTA, máx 2 linhas). Estilo persuasivo com urgência ou benefício claro." },
          caption_block1: { type: "string", description: "Bloco 1: Hook que gera curiosidade sobre o produto" },
          caption_block2: { type: "string", description: "Bloco 2: Benefício principal e diferencial" },
          caption_block3: { type: "string", description: "Bloco 3: CTA com link e urgência" },
          scheduled_for: { type: "string", description: "Data/hora para agendar (ISO 8601, horário Brasília)" },
          platforms: { type: "array", items: { type: "string" }, description: "Plataformas: instagram, tiktok" }
        },
        required: []
      }
    }
  }
];

// Generate pseudo-random human delay in minutes (2-8 min)
// Makes posts feel more natural, avoiding bot detection patterns
function generateHumanDelay(): number {
  // Base delay 2-5 min + random extra 0-3 min
  const baseDelay = 2 + Math.floor(Math.random() * 3); // 2-4
  const extraDelay = Math.random() * 3; // 0-3
  return Math.round((baseDelay + extraDelay) * 10) / 10; // Round to 1 decimal
}

// ============= IMAGE RELEVANCE GUARD FOR RSS NEWS POSTS =============
// ── Image Relevance Engine (inline for agent-chat — mirrors _shared/image-relevance.ts) ──
// Full version lives in _shared/image-relevance.ts used by search-images-for-video.
// Duplicated here to avoid cross-function import issues in edge function bundling.

const MARKETING_CDNS_AGENT = [
  'prismic.io', 'cdn.sanity.io', 'images.ctfassets.net',
  'assets.anthropic.com', 'images.openai.com', 'cdn.openai.com',
  'storage.googleapis.com/openai', '/og-image', '/social-card',
  '/social-share', '/opengraph', '/hero-image', '/marketing/', '/ads/',
  '/blog-images/', '/press-release/',
];

const FORBIDDEN_TERMS_AGENT = [
  'woman', 'man', 'girl', 'boy', 'fashion', 'beauty', 'fitness', 'body',
  'sexy', 'posing', 'sensual', 'attractive', 'glamour', 'bikini',
  'wedding', 'party', 'lifestyle', 'influencer', 'makeup', 'hairstyle',
  'dress', 'people smiling', 'couple', 'children', 'baby', 'crowd',
];

const TECH_ENTITY_MAP_AGENT: Record<string, string[]> = {
  'openai': ['openai', 'gpt'], 'chatgpt': ['chatgpt'], 'gpt': ['gpt', 'openai'],
  'claude': ['anthropic', 'ai'], 'anthropic': ['anthropic', 'ai'],
  'gemini': ['google', 'gemini'], 'copilot': ['microsoft', 'copilot'],
  'nvidia': ['nvidia', 'gpu'], 'tesla': ['tesla'], 'spacex': ['spacex'],
  'apple': ['apple', 'iphone'], 'microsoft': ['microsoft'], 'google': ['google'],
  'amazon': ['amazon', 'aws'], 'deepmind': ['deepmind'], 'mistral': ['mistral'],
  'xai': ['xai', 'grok'], 'grok': ['grok', 'xai'], 'robot': ['robot'],
  'humanoid': ['humanoid'], 'chip': ['chip', 'semiconductor'],
  'bitcoin': ['bitcoin'], 'blockchain': ['blockchain'],
  'h100': ['nvidia', 'gpu'], 'colossus': ['data center', 'server'],
  'sam altman': ['openai', 'ai'], 'elon musk': ['tesla', 'spacex'],
};

function extractEntitiesAgent(title: string): string[] {
  const entities: string[] = [];
  const titleLower = title.toLowerCase();
  for (const [key, values] of Object.entries(TECH_ENTITY_MAP_AGENT)) {
    if (titleLower.includes(key)) entities.push(...values);
  }
  const capWords = title.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || [];
  const generic = new Set(['The','New','This','That','With','From','For','And','Are',
    'Has','Was','Will','Can','Its','Not','More','Says','Said','Nova','Novo']);
  for (const w of capWords) {
    if (!generic.has(w) && !entities.includes(w.toLowerCase())) entities.push(w.toLowerCase());
  }
  return [...new Set(entities)].slice(0, 6);
}

// Validates if an og:image URL is relevant to a tech/news topic before using it.
// Uses the Image Relevance Engine logic (forbidden terms + marketing CDN detection).
function isRssImageRelevant(imageUrl: string, title: string, description: string): boolean {
  if (!imageUrl) return false;

  const urlLower = imageUrl.toLowerCase();

  // Always reject tracking/icon images
  if (['1x1', 'pixel', 'tracking', 'favicon', 'icon', 'avatar', 'logo']
      .some(s => urlLower.includes(s))) return false;

  // ── Marketing CDN check (always reject — company ads/people photos) ──
  if (MARKETING_CDNS_AGENT.some(s => urlLower.includes(s))) {
    console.log('[RSS] ⛔ Marketing CDN rejected:', imageUrl.substring(0, 80));
    return false;
  }

  const textLower = (title + ' ' + description).toLowerCase();

  // Tech/AI topic check
  const techKeywords = ['ai', 'openai', 'google', 'apple', 'microsoft', 'meta', 'nvidia',
    'robot', 'tech', 'gpt', 'llm', 'chip', 'software', 'data', 'cloud', 'cyber',
    'startup', 'crypto', 'bitcoin', 'space', 'tesla', 'samsung', 'amazon', 'iphone',
    'computador', 'inteligência', 'artificial', 'anthropic', 'claude', 'gemini',
    'copilot', 'mistral', 'deepmind', 'xai', 'grok'];

  const isTechTopic = techKeywords.some(k => textLower.includes(k));
  if (!isTechTopic) return true; // Non-tech → accept

  // ── Forbidden terms check ──
  const entities = extractEntitiesAgent(title);
  const hasForbiddenTerm = FORBIDDEN_TERMS_AGENT.some(term => urlLower.includes(term));
  if (hasForbiddenTerm) {
    const hasStrongEntity = entities.some(e => e.length > 3 && urlLower.includes(e));
    if (!hasStrongEntity) {
      console.log('[RSS] ⛔ Forbidden term in og:image URL:', imageUrl.substring(0, 80));
      return false;
    }
  }

  // ── Human/political URL signals ──
  const humanSignals = ['politician', 'presidente', 'candidato', 'eleicao', 'election',
    'futebol', 'soccer', 'sport', 'athlete', 'celebrity', 'actor', 'singer',
    'jersey', 'stadium', 'rally', 'protest', 'manifestacao', 'partido', 'campaign',
    'voto', 'politica', '/pessoas/', '/person/', '/people/', '/portrait/', '/rostos/'];

  if (humanSignals.some(s => urlLower.includes(s))) {
    console.log('[RSS] ⛔ Human/political signal in URL:', imageUrl.substring(0, 80));
    return false;
  }

  return true;
}


// The AI sends times as if they are in Brasília (UTC-3), so we need to convert to UTC for storage
function convertBrasiliaToUTC(dateString: string): string {
  if (!dateString) return dateString;
  
  // Parse the date string
  const date = new Date(dateString);
  
  // Check if it's already a valid date
  if (isNaN(date.getTime())) {
    console.error('Invalid date string:', dateString);
    return dateString;
  }
  
  // If the date string doesn't include timezone info (no Z or +/-), 
  // treat it as Brasília time and add 3 hours to convert to UTC
  const hasTimezone = dateString.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dateString);
  
  if (!hasTimezone) {
    // The date is in Brasília time (UTC-3), so we need to add 3 hours to get UTC
    const utcDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
    return utcDate.toISOString();
  }
  
  return date.toISOString();
}

// Helper to format date for display in Brasília time
function formatBrasiliaTime(isoString: string): string {
  return new Date(isoString).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

// Tool execution functions
async function executeCreatePosts(supabase: any, userId: string, workspaceId: string, args: any) {
  const { posts } = args;
  const createdPosts = [];
  
  // Check if workspace has auto_post_enabled
  const { data: agentContext } = await supabase
    .from('agent_context')
    .select('auto_post_enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  
  const autoPostEnabled = agentContext?.auto_post_enabled ?? false;
  console.log('[CREATE_POSTS] Auto post enabled:', autoPostEnabled);
  
  for (const post of posts) {
    // Convert scheduled_for to UTC if provided
    const scheduledForUTC = post.scheduled_for ? convertBrasiliaToUTC(post.scheduled_for) : null;
    
    // Status válidos: draft, scheduled, published, failed
    // Se agendado usa 'scheduled', senão usa 'draft' (depois publicamos se auto_post ativo)
    const status = scheduledForUTC ? 'scheduled' : 'draft';
    
    const postData = {
      user_id: userId,
      workspace_id: workspaceId,
      caption: post.caption,
      hashtags: post.hashtags || [],
      post_type: post.post_type || 'engajamento',
      platforms: post.platforms || ['instagram'],
      status,
      scheduled_for: scheduledForUTC,
      media_type: 'image'
    };
    
    console.log('Creating post with scheduled_for:', {
      original: post.scheduled_for,
      converted_to_utc: scheduledForUTC,
      will_display_as: scheduledForUTC ? formatBrasiliaTime(scheduledForUTC) : null,
      status,
      auto_publish: autoPostEnabled && !scheduledForUTC
    });
    
    const { data, error } = await supabase
      .from('posts')
      .insert(postData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating post:', error);
      continue;
    }
    
    // Automatically generate image if prompt provided
    if (post.image_prompt && data?.id) {
      try {
        console.log('Generating image for post:', data.id, 'prompt:', post.image_prompt);
        
        const imageResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({ 
            prompt: post.image_prompt,
            userId,
            postId: data.id
          })
        });
        
        if (imageResponse.ok) {
          const imageResult = await imageResponse.json();
          if (imageResult.imageUrl) {
            await supabase
              .from('posts')
              .update({ image_url: imageResult.imageUrl })
              .eq('id', data.id);
            data.image_url = imageResult.imageUrl;
            
            // If auto_post_enabled and not scheduled, publish immediately after image is ready
            if (autoPostEnabled && !scheduledForUTC && imageResult.imageUrl) {
              console.log('[AUTO_PUBLISH] Publishing post immediately:', data.id);
              
              for (const platform of (post.platforms || ['instagram'])) {
                try {
                  if (platform === 'instagram') {
                    const publishResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/publish-post`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                      },
                      body: JSON.stringify({ postId: data.id })
                    });
                    
                    if (publishResponse.ok) {
                      console.log('[AUTO_PUBLISH] Published to Instagram successfully!');
                      data.status = 'published';
                    } else {
                      console.error('[AUTO_PUBLISH] Failed to publish to Instagram:', await publishResponse.text());
                    }
                  } else if (platform === 'tiktok') {
                    const publishResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/publish-to-tiktok`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                      },
                      body: JSON.stringify({ postId: data.id })
                    });
                    
                    if (publishResponse.ok) {
                      console.log('[AUTO_PUBLISH] Published to TikTok successfully!');
                    } else {
                      console.error('[AUTO_PUBLISH] Failed to publish to TikTok');
                    }
                  }
                } catch (pubError) {
                  console.error(`[AUTO_PUBLISH] Error publishing to ${platform}:`, pubError);
                }
              }
            }
          }
        } else {
          console.error('Image generation failed:', await imageResponse.text());
        }
      } catch (imgError) {
        console.error('Error generating image:', imgError);
      }
    }
    
    createdPosts.push(data);
  }
  
  const withImages = createdPosts.filter(p => p.image_url).length;
  const scheduledPosts = createdPosts.filter(p => p.scheduled_for);
  const publishedPosts = createdPosts.filter(p => p.status === 'published');
  
  // Format scheduled times for display
  const scheduleInfo = scheduledPosts.length > 0 
    ? `\n📅 Agendado(s) para: ${scheduledPosts.map(p => formatBrasiliaTime(p.scheduled_for)).join(', ')}`
    : '';
  
  const publishInfo = publishedPosts.length > 0
    ? `\n🚀 ${publishedPosts.length} post(s) publicado(s) automaticamente!`
    : '';
  
  return {
    success: true,
    message: `✅ ${createdPosts.length} post(s) criado(s)! ${withImages > 0 ? `🎨 ${withImages} imagem(ns) gerada(s)` : '⚠️ Sem imagens (image_prompt não fornecido)'}${publishInfo}${scheduleInfo}`,
    posts: createdPosts.map(p => ({
      id: p.id,
      caption: p.caption.slice(0, 50) + '...',
      status: p.status,
      scheduled_for: p.scheduled_for,
      scheduled_for_brasilia: p.scheduled_for ? formatBrasiliaTime(p.scheduled_for) : null,
      has_image: !!p.image_url,
      published: p.status === 'published'
    }))
  };
}

async function executeGenerateImage(supabase: any, userId: string, workspaceId: string, args: any) {
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
      .eq('workspace_id', workspaceId);
  }
  
  return {
    success: true,
    message: `🎨 Imagem gerada com sucesso!`,
    imageUrl: result.imageUrl
  };
}

async function executeSchedulePost(supabase: any, userId: string, workspaceId: string, args: any) {
  const { post_id, scheduled_for } = args;
  
  // Convert to UTC for storage
  const scheduledForUTC = convertBrasiliaToUTC(scheduled_for);
  
  console.log('Scheduling post:', {
    post_id,
    original_time: scheduled_for,
    converted_to_utc: scheduledForUTC,
    will_display_as: formatBrasiliaTime(scheduledForUTC)
  });
  
  const { data, error } = await supabase
    .from('posts')
    .update({ 
      status: 'scheduled',
      scheduled_for: scheduledForUTC
    })
    .eq('id', post_id)
    .eq('workspace_id', workspaceId)
    .select()
    .single();
  
  if (error) {
    return { success: false, message: `❌ Erro ao agendar: ${error.message}` };
  }
  
  return {
    success: true,
    message: `📅 Post agendado para ${formatBrasiliaTime(scheduledForUTC)} (horário de Brasília)`,
    post: data,
    scheduled_for_brasilia: formatBrasiliaTime(scheduledForUTC)
  };
}

async function executeGetPerformance(supabase: any, userId: string, workspaceId: string, args: any) {
  const days = args.days || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'published')
    .gte('published_at', since.toISOString())
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching posts:', error);
    return {
      success: false,
      message: `❌ Erro ao buscar dados: ${error.message}`
    };
  }
  
  if (!posts || posts.length === 0) {
    return {
      success: true,
      message: `📊 Nenhum post publicado nos últimos ${days} dias no banco de dados.`,
      data: { total_posts: 0 }
    };
  }

  // REAL metrics criteria:
  // - Must have instagram_post_id (means it was actually published to Instagram)
  // - Must have reach >= 10 (filters out missing/placeholder values)
  const isRealMetricsPost = (p: any) => {
    const hasIgId = !!p.instagram_post_id;
    const reach = typeof p.reach === 'number' ? p.reach : 0;
    return hasIgId && reach >= 10;
  };

  const postsWithRealMetrics = posts.filter(isRealMetricsPost);
  const ignoredPosts = posts.filter((p: any) => !isRealMetricsPost(p));

  // Calculate totals ONLY from real metrics (never from simulated/placeholder)
  const totalLikes = postsWithRealMetrics.reduce((acc: number, p: any) => acc + (p.likes_count || 0), 0);
  const totalComments = postsWithRealMetrics.reduce((acc: number, p: any) => acc + (p.comments_count || 0), 0);
  const totalSaves = postsWithRealMetrics.reduce((acc: number, p: any) => acc + (p.saves_count || 0), 0);
  const totalReach = postsWithRealMetrics.reduce((acc: number, p: any) => acc + (p.reach || 0), 0);

  const avgEngagement = totalReach > 0
    ? ((totalLikes + totalComments + totalSaves) / totalReach * 100).toFixed(2)
    : '0.00';

  // Find top performing post ONLY among real-metrics posts
  const sortedByEngagement = [...postsWithRealMetrics]
    .filter((p: any) => (p.reach || 0) > 0)
    .sort((a: any, b: any) => {
      const engA = ((a.likes_count || 0) + (a.comments_count || 0) + (a.saves_count || 0)) / (a.reach || 1);
      const engB = ((b.likes_count || 0) + (b.comments_count || 0) + (b.saves_count || 0)) / (b.reach || 1);
      return engB - engA;
    });

  const topPost = sortedByEngagement[0];
  const hasRealMetrics = postsWithRealMetrics.length > 0;

  return {
    success: true,
    message: hasRealMetrics
      ? `📊 Performance REAL dos últimos ${days} dias (${postsWithRealMetrics.length} posts com métricas do Instagram)`
      : `📊 Ainda não há métricas REAIS sincronizadas (ignorado ${ignoredPosts.length} post(s) sem métricas reais)` ,
    data: {
      total_posts_published_in_period: posts.length,
      posts_with_real_metrics: postsWithRealMetrics.length,
      ignored_posts_without_real_metrics: ignoredPosts.length,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_saves: totalSaves,
      total_reach: totalReach,
      avg_engagement: `${avgEngagement}%`,
      metrics_status: hasRealMetrics
        ? '✅ Métricas reais sincronizadas'
        : '⚠️ Sem métricas reais: publique no Instagram e clique em Sincronizar do Instagram',
      top_post: topPost ? {
        id: topPost.id,
        caption: topPost.caption.slice(0, 80) + (topPost.caption.length > 80 ? '...' : ''),
        likes: topPost.likes_count || 0,
        comments: topPost.comments_count || 0,
        saves: topPost.saves_count || 0,
        reach: topPost.reach || 0,
        engagement: (topPost.reach || 0) > 0
          ? (((topPost.likes_count || 0) + (topPost.comments_count || 0) + (topPost.saves_count || 0)) / topPost.reach * 100).toFixed(2) + '%'
          : '0%'
      } : null
    }
  };
}

// NEW: Detailed analytics function that queries REAL data from database
async function executeDetailedAnalytics(supabase: any, userId: string, workspaceId: string, args: any) {
  const { query_type, days = 30 } = args;
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Fetch ALL posts for this workspace
  const { data: allPosts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (error) {
    return { success: false, message: `❌ Erro ao buscar dados: ${error.message}` };
  }

  if (!allPosts || allPosts.length === 0) {
    return {
      success: true,
      message: `📊 Nenhum post encontrado no banco de dados.`,
      data: { total: 0 }
    };
  }

  // Calculate real statistics based on query type
  switch (query_type) {
    case 'overview': {
      const total = allPosts.length;
      const published = allPosts.filter((p: any) => p.status === 'published').length;
      const scheduled = allPosts.filter((p: any) => p.status === 'scheduled').length;
      const drafts = allPosts.filter((p: any) => p.status === 'draft').length;
      const videos = allPosts.filter((p: any) => p.media_type === 'video' || p.video_url).length;
      const images = allPosts.filter((p: any) => p.media_type === 'image' && p.image_url && !p.video_url).length;
      const reels = allPosts.filter((p: any) => p.media_type === 'reel').length;
      const carousels = allPosts.filter((p: any) => p.media_type === 'carousel' || (p.carousel_images && p.carousel_images.length > 0)).length;
      const withMedia = allPosts.filter((p: any) => p.image_url || p.video_url || (p.carousel_images && p.carousel_images.length > 0)).length;
      const withoutMedia = total - withMedia;

      return {
        success: true,
        message: `📊 **VISÃO GERAL REAL DO BANCO DE DADOS**`,
        data: {
          total_posts: total,
          por_status: {
            publicados: published,
            agendados: scheduled,
            rascunhos: drafts
          },
          por_tipo_de_midia: {
            videos: videos,
            imagens: images,
            reels: reels,
            carroseis: carousels
          },
          midia: {
            com_midia: withMedia,
            sem_midia: withoutMedia
          }
        }
      };
    }

    case 'by_media_type': {
      const videos = allPosts.filter((p: any) => p.media_type === 'video' || p.video_url);
      const images = allPosts.filter((p: any) => p.media_type === 'image' && p.image_url && !p.video_url);
      const reels = allPosts.filter((p: any) => p.media_type === 'reel');
      const carousels = allPosts.filter((p: any) => p.media_type === 'carousel' || (p.carousel_images && p.carousel_images.length > 0));

      return {
        success: true,
        message: `🎬 **ANÁLISE POR TIPO DE MÍDIA**`,
        data: {
          videos: {
            total: videos.length,
            publicados: videos.filter((p: any) => p.status === 'published').length,
            agendados: videos.filter((p: any) => p.status === 'scheduled').length
          },
          imagens: {
            total: images.length,
            publicados: images.filter((p: any) => p.status === 'published').length,
            agendados: images.filter((p: any) => p.status === 'scheduled').length
          },
          reels: {
            total: reels.length,
            publicados: reels.filter((p: any) => p.status === 'published').length,
            agendados: reels.filter((p: any) => p.status === 'scheduled').length
          },
          carroseis: {
            total: carousels.length,
            publicados: carousels.filter((p: any) => p.status === 'published').length,
            agendados: carousels.filter((p: any) => p.status === 'scheduled').length
          }
        }
      };
    }

    case 'by_status': {
      const published = allPosts.filter((p: any) => p.status === 'published');
      const scheduled = allPosts.filter((p: any) => p.status === 'scheduled');
      const drafts = allPosts.filter((p: any) => p.status === 'draft');
      const failed = allPosts.filter((p: any) => p.status === 'failed');

      return {
        success: true,
        message: `📋 **ANÁLISE POR STATUS**`,
        data: {
          publicados: {
            total: published.length,
            ultimo: published.length > 0 ? new Date(published[0].published_at || published[0].created_at).toLocaleDateString('pt-BR') : null
          },
          agendados: {
            total: scheduled.length,
            proximos: scheduled.slice(0, 3).map((p: any) => ({
              caption: p.caption.slice(0, 40) + '...',
              data: p.scheduled_for ? new Date(p.scheduled_for).toLocaleString('pt-BR') : 'N/A'
            }))
          },
          rascunhos: {
            total: drafts.length
          },
          falhas: {
            total: failed.length
          }
        }
      };
    }

    case 'by_platform': {
      const instagram = allPosts.filter((p: any) => !p.platforms || p.platforms.includes('instagram'));
      const tiktok = allPosts.filter((p: any) => p.platforms && p.platforms.includes('tiktok'));

      return {
        success: true,
        message: `📱 **ANÁLISE POR PLATAFORMA**`,
        data: {
          instagram: {
            total: instagram.length,
            publicados: instagram.filter((p: any) => p.status === 'published').length,
            com_instagram_post_id: instagram.filter((p: any) => p.instagram_post_id).length
          },
          tiktok: {
            total: tiktok.length,
            publicados: tiktok.filter((p: any) => p.status === 'published').length,
            com_tiktok_post_id: tiktok.filter((p: any) => p.tiktok_post_id).length
          }
        }
      };
    }

    case 'by_date_range': {
      const recentPosts = allPosts.filter((p: any) => new Date(p.created_at) >= since);
      const today = new Date();
      const last7Days = allPosts.filter((p: any) => {
        const created = new Date(p.created_at);
        const diff = (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      });
      const last30Days = allPosts.filter((p: any) => {
        const created = new Date(p.created_at);
        const diff = (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 30;
      });

      return {
        success: true,
        message: `📅 **ANÁLISE TEMPORAL (últimos ${days} dias)**`,
        data: {
          ultimos_7_dias: last7Days.length,
          ultimos_30_dias: last30Days.length,
          periodo_solicitado: {
            dias: days,
            posts: recentPosts.length
          },
          total_historico: allPosts.length
        }
      };
    }

    case 'recent_activity': {
      const sortedPosts = [...allPosts].sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const recent = sortedPosts.slice(0, 5);

      return {
        success: true,
        message: `🕐 **ATIVIDADE RECENTE**`,
        data: {
          ultimos_5_posts: recent.map((p: any) => ({
            id: p.id,
            caption: p.caption.slice(0, 50) + '...',
            tipo: p.media_type || 'image',
            status: p.status,
            criado_em: new Date(p.created_at).toLocaleString('pt-BR'),
            tem_midia: !!(p.image_url || p.video_url)
          }))
        }
      };
    }

    default:
      return { success: false, message: `Tipo de consulta desconhecido: ${query_type}` };
  }
}

async function executeRunAgent(supabase: any, userId: string, workspaceId: string) {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ai-agent-core`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
    },
    body: JSON.stringify({ userId, workspaceId })
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

async function executeListPosts(supabase: any, userId: string, workspaceId: string, args: any) {
  const status = args.status || 'all';
  const limit = args.limit || 10;
  
  let query = supabase
    .from('posts')
    .select('id, caption, status, scheduled_for, published_at, likes_count, created_at')
    .eq('workspace_id', workspaceId)
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

async function executeDeletePost(supabase: any, userId: string, workspaceId: string, args: any) {
  const { post_id } = args;
  
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', post_id)
    .eq('workspace_id', workspaceId);
  
  if (error) {
    return { success: false, message: `❌ Erro ao deletar: ${error.message}` };
  }
  
  return {
    success: true,
    message: `🗑️ Post deletado com sucesso!`
  };
}

async function executeUpdateSettings(supabase: any, userId: string, workspaceId: string, args: any) {
  // Check if context exists
  const { data: existing } = await supabase
    .from('agent_context')
    .select('id')
    .eq('workspace_id', workspaceId)
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
      .eq('workspace_id', workspaceId);
    
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

// Execute create_narrated_video - creates a video post with script for frontend processing
async function executeCreateNarratedVideo(supabase: any, userId: string, workspaceId: string, args: any) {
  const { topic, caption, hashtags, scheduled_for, publish_now, platforms, style, article_url, article_image_url } = args;
  
  console.log('Creating narrated video for topic:', topic, '| workspace:', workspaceId, '| publish_now:', publish_now);
  
  try {
    // Step 1: Generate the story script using AI (with local fallback)
    let script: any = null;
    
    try {
      const scriptResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-story-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          topic,
          segmentCount: 4,
          wordsPerSegment: 12,
          totalDuration: 20,
          style: style || 'impactante e provocativo'
        })
      });
      
      if (scriptResponse.ok) {
        script = await scriptResponse.json();
        console.log('Script generated via AI:', script.title, '- Segments:', script.segments?.length);
      } else {
        console.warn('Script generation failed (possibly no credits), using local fallback');
      }
    } catch (e) {
      console.warn('Script generation error, using local fallback:', e);
    }
    
    // FALLBACK: Generate local script template when AI credits are exhausted
    if (!script || !script.segments || script.segments.length === 0) {
      console.log('[VIDEO] Using LOCAL script fallback for topic:', topic);
      const topicClean = topic.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim();
      script = {
        title: `${topicClean}: O Que Você Precisa Saber`,
        segments: [
          { text: `${topicClean} está mudando tudo que conhecemos sobre tecnologia.`, imagePrompt: `${topicClean} futuristic technology concept` },
          { text: `Especialistas apontam avanços impressionantes nessa área.`, imagePrompt: `${topicClean} innovation breakthrough` },
          { text: `As implicações para o futuro são enormes e irreversíveis.`, imagePrompt: `${topicClean} future impact society` },
          { text: `Fique por dentro. Siga Neural Update para mais.`, imagePrompt: `technology news social media follow` },
        ],
        totalDuration: 20,
        _fallback: true,
      };
    }
    
    // Step 2: Get thumbnail from Pexels (FREE, no AI credits needed)
    let thumbnailUrl = null;
    if (script.segments && script.segments.length > 0) {
      try {
        // Use search-images-for-video which uses Pexels/Unsplash (FREE)
        const imgSearchResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/search-images-for-video`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            topic: topic,
            segments: [script.segments[0]],
          })
        });
        
        if (imgSearchResponse.ok) {
          const imgResult = await imgSearchResponse.json();
          if (imgResult.images && imgResult.images.length > 0) {
            thumbnailUrl = imgResult.images[0].imageUrl;
            console.log('Thumbnail from stock photos:', thumbnailUrl);
          }
        }
      } catch (imgError) {
        console.error('Thumbnail search failed:', imgError);
      }
    }
    
    // Step 3: Create the post with video metadata
    const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
    
    const postData = {
      user_id: userId,
      workspace_id: workspaceId,
      caption: caption || `🎬 ${script.title}\n\n${topic}`,
      hashtags: hashtags || ['#tecnologia', '#inovacao', '#futuro', '#ia', '#reels'],
      post_type: 'entretenimento',
      platforms: platforms || ['instagram', 'tiktok'],
      status: scheduledForUTC ? 'scheduled' : 'draft',
      scheduled_for: scheduledForUTC,
      media_type: 'reels',
      image_url: thumbnailUrl, // Thumbnail for preview
      // Store script data in overlay_metadata for frontend processing
      overlay_metadata: {
        type: 'narrated_video',
        script: script,
        topic: topic,
        style: style,
        article_url: article_url || null,
        article_image_url: article_image_url || null,
        needs_processing: true,
        created_by_agent: true,
        publish_after_render: publish_now === true,
      }
    };
    
    const { data: post, error } = await supabase
      .from('posts')
      .insert(postData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating video post:', error);
      return { success: false, message: `❌ Erro ao criar post: ${error.message}` };
    }
    
    // Determine next step message
    let nextStepMessage = '';
    if (publish_now) {
      nextStepMessage = '⚡ **Próximo passo:** Abra a aba "Fila" e clique em "Gerar Vídeo" para renderizar e publicar automaticamente!';
    } else if (scheduledForUTC) {
      nextStepMessage = `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}\n⚡ **Próximo passo:** Abra a aba "Fila" e clique em "Gerar Vídeo" para renderizar o Reels antes do horário agendado!`;
    } else {
      nextStepMessage = '📝 Salvo como rascunho\n⚡ **Próximo passo:** Abra a aba "Fila" e clique em "Gerar Vídeo" para renderizar o Reels!';
    }
    
    return {
      success: true,
      message: `🎬 Vídeo narrado criado!\n\n📜 Título: "${script.title}"\n🎞️ ${script.segments?.length || 4} cenas cinematográficas\n${thumbnailUrl ? '🖼️ Thumbnail gerada' : ''}\n\n${nextStepMessage}`,
      post: {
        id: post.id,
        title: script.title,
        segments: script.segments?.length || 4,
        status: post.status,
        has_thumbnail: !!thumbnailUrl,
        needs_rendering: true,
        publish_after_render: publish_now === true,
      },
      // Special action for frontend to handle
      requires_frontend_action: {
        type: 'render_video',
        post_id: post.id,
        auto_publish: publish_now === true,
      }
    };
  } catch (error: any) {
    console.error('Error in executeCreateNarratedVideo:', error);
    return { success: false, message: `❌ Erro: ${error.message}` };
  }
}

// Execute create_carousel - creates a carousel post with multiple images
async function executeCreateCarousel(supabase: any, userId: string, workspaceId: string, args: any) {
  const { caption, slides, hashtags, scheduled_for, platforms } = args;
  
  if (!slides || slides.length < 2) {
    return { success: false, message: '❌ Carrossel precisa de pelo menos 2 slides!' };
  }
  
  if (slides.length > 10) {
    return { success: false, message: '❌ Carrossel pode ter no máximo 10 slides!' };
  }
  
  console.log('Creating carousel with', slides.length, 'slides');
  
  const carouselImages: string[] = [];
  let generatedCount = 0;
  
  // Generate images for each slide
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    try {
      console.log(`Generating image ${i + 1}/${slides.length}:`, slide.image_prompt);
      
      const imageResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({
          prompt: `${slide.image_prompt}. High quality, professional, Instagram-ready, square 1:1 aspect ratio.`,
          format: 'square',
          model: 'gemini'
        })
      });
      
      if (imageResponse.ok) {
        const imageResult = await imageResponse.json();
        if (imageResult.imageUrl) {
          carouselImages.push(imageResult.imageUrl);
          generatedCount++;
          console.log(`Image ${i + 1} generated successfully`);
        }
      } else {
        console.error(`Failed to generate image ${i + 1}:`, await imageResponse.text());
      }
    } catch (imgError) {
      console.error(`Error generating image ${i + 1}:`, imgError);
    }
  }
  
  if (carouselImages.length < 2) {
    return { success: false, message: `❌ Não foi possível gerar imagens suficientes. Apenas ${carouselImages.length} de ${slides.length} foram geradas.` };
  }
  
  // Create the carousel post
  const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
  
  const postData = {
    user_id: userId,
    caption,
    hashtags: hashtags || ['#tecnologia', '#inovacao', '#carrossel'],
    post_type: 'educacional',
    platforms: platforms || ['instagram'],
    status: scheduledForUTC ? 'scheduled' : 'draft',
    scheduled_for: scheduledForUTC,
    media_type: 'carousel',
    image_url: carouselImages[0], // First image as main preview
    carousel_images: carouselImages
  };
  
  const { data: post, error } = await supabase
    .from('posts')
    .insert(postData)
    .select()
    .single();
  
  if (error) {
    console.error('Error creating carousel post:', error);
    return { success: false, message: `❌ Erro ao criar carrossel: ${error.message}` };
  }
  
  const scheduleInfo = scheduledForUTC 
    ? `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}`
    : '📝 Salvo como rascunho';
  
  return {
    success: true,
    message: `🎠 Carrossel criado com sucesso!\n\n🖼️ ${generatedCount}/${slides.length} imagens geradas\n${scheduleInfo}`,
    post: {
      id: post.id,
      slides_count: carouselImages.length,
      status: post.status,
      scheduled_for_brasilia: scheduledForUTC ? formatBrasiliaTime(scheduledForUTC) : null
    }
  };
}

// Execute create_news_post - fetches real news, uses article image, includes source
// With AI fallback when Firecrawl is unavailable
async function executeCreateNewsPost(supabase: any, userId: string, workspaceId: string, args: any) {
  const { 
    topic, 
    headline_text,
    caption_block1,
    caption_block2,
    caption_block3,
    caption_style, 
    scheduled_for, 
    platforms 
  } = args;
  
  console.log('[NEWS_POST] Creating news post for topic:', topic);
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    let selectedArticle: any = null;
    let selectedImage: string | null = null;
    let sourceDomain = 'IA';
    let sourceUrl = '';
    let usedAiFallback = false;
    
    // Try to fetch real news with Firecrawl
    try {
      const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          query: `${topic} notícia recente tecnologia`,
          limit: 10,
          lang: 'pt-BR',
          country: 'BR'
        })
      });
      
      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        const newsArticles = searchResult.data || [];
        
        if (newsArticles.length > 0) {
          // Find article with quality images
          const articlesWithImages = newsArticles
            .filter((a: any) => a.images && a.images.length > 0)
            .sort((a: any, b: any) => (b.images?.length || 0) - (a.images?.length || 0));
          
          selectedArticle = articlesWithImages[0] || newsArticles[0];
          
          if (selectedArticle.images?.length > 0) {
            const qualityImages = selectedArticle.images.filter((img: string) => 
              img && !img.includes('icon') && !img.includes('logo') && 
              !img.includes('avatar') && !img.includes('1x1') && !img.includes('favicon')
            );
            selectedImage = qualityImages[0] || selectedArticle.images[0];
          }
          
          sourceUrl = selectedArticle.url || '';
          try {
            sourceDomain = new URL(sourceUrl).hostname.replace('www.', '');
          } catch { sourceDomain = 'fonte externa'; }
          
          console.log('[NEWS_POST] Found real article:', selectedArticle.title);
        }
      }
    } catch (searchError) {
      console.log('[NEWS_POST] Firecrawl unavailable, using AI fallback');
    }
    
    // FALLBACK: If Firecrawl failed, create content with AI
    if (!selectedArticle) {
      console.log('[NEWS_POST] Using AI fallback for topic:', topic);
      usedAiFallback = true;
      
      // Generate image with AI
      const currentYear = new Date().getFullYear();
      const imagePrompt = `Fotografia profissional de alta qualidade relacionada a: ${topic}.
Estilo: jornalístico, editorial, moderno, ${currentYear}.
Iluminação cinematográfica, cores vibrantes, foco definido.
IMPORTANTE: Não adicione texto na imagem. Imagem limpa para overlay posterior.
Proporção quadrada 1:1 para Instagram.`;
      
      const imageResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          prompt: imagePrompt,
          format: 'square',
          model: 'gemini'
        })
      });
      
      if (imageResponse.ok) {
        const imageResult = await imageResponse.json();
        selectedImage = imageResult.imageUrl;
        console.log('[NEWS_POST] AI image generated');
      }
      
      sourceDomain = 'Conteúdo IA';
    }
    
    // Build caption
    let caption = '';
    let hashtags: string[] = [];
    
    if (caption_block1) {
      // 3-block format from agent
      const captionParts = [caption_block1];
      if (caption_block2) captionParts.push(caption_block2);
      if (caption_block3) captionParts.push(caption_block3);
      caption = captionParts.join('\n\n');
      hashtags = ['#tecnologia', '#inovação', '#ia', '#futuro'];
    } else if (selectedArticle) {
      // Generate from article
      caption = `📰 ${selectedArticle.title}\n\n${selectedArticle.description || ''}\n\n📰 Fonte: ${sourceDomain}`;
      hashtags = ['#tecnologia', '#noticias', '#inovacao', '#ia'];
    } else {
      // Fallback caption
      caption = `🚀 ${topic}\n\nConteúdo sobre ${topic} - as últimas novidades do mundo tech.\n\n#tecnologia #inovação`;
      hashtags = ['#tecnologia', '#inovação', '#futuro', '#ia'];
    }
    
    // Use headline text for image overlay
    const headlineForImage = headline_text || (selectedArticle?.title?.slice(0, 80)) || topic.toUpperCase();
    
    // Apply headline overlay to image
    let imageUrl: string | null = null;
    if (selectedImage) {
      console.log('[NEWS_POST] Applying headline overlay...');
      
      const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          imageUrl: selectedImage,
          watermarkText: 'Neural Update',
          headlineText: headlineForImage
        })
      });
      
      if (watermarkResponse.ok) {
        const wmResult = await watermarkResponse.json();
        imageUrl = wmResult.publicUrl || wmResult.url || wmResult.imageUrl;
        console.log('[NEWS_POST] Headline overlay applied!');
      } else {
        // Use original image without overlay
        imageUrl = selectedImage;
        console.log('[NEWS_POST] Overlay failed, using original image');
      }
    }
    
    if (!imageUrl) {
      return { success: false, message: `❌ Não consegui gerar imagem para "${topic}". Tente outro tema.` };
    }
    
    // Check auto-publish
    const { data: agentContext } = await supabase
      .from('agent_context')
      .select('auto_post_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    
    const autoPostEnabled = agentContext?.auto_post_enabled ?? false;
    const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
    const status = scheduledForUTC ? 'scheduled' : 'draft';
    
    // Create post
    const { data: post, error } = await supabase.from('posts').insert({
      user_id: userId,
      caption,
      hashtags,
      post_type: 'noticia',
      platforms: platforms || ['instagram'],
      status,
      scheduled_for: scheduledForUTC,
      media_type: 'image',
      image_url: imageUrl,
      ai_model_used: usedAiFallback ? 'gemini-editorial' : 'curated-news'
    }).select().single();
    
    if (error) throw error;
    
    // Auto-publish if enabled
    let publishStatus = '';
    if (autoPostEnabled && !scheduledForUTC && imageUrl) {
      console.log('[NEWS_POST] Auto-publishing...');
      for (const platform of (platforms || ['instagram'])) {
        try {
          if (platform === 'instagram') {
            const pubResponse = await fetch(`${supabaseUrl}/functions/v1/publish-post`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`
              },
              body: JSON.stringify({ postId: post.id })
            });
            if (pubResponse.ok) {
              publishStatus = '✅ Publicado no Instagram!';
            } else {
              publishStatus = '⚠️ Erro ao publicar';
            }
          }
        } catch (pubError) {
          console.error('[NEWS_POST] Publish error:', pubError);
        }
      }
    }
    
    const scheduleInfo = scheduledForUTC 
      ? `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}`
      : autoPostEnabled ? publishStatus : '📝 Salvo como rascunho';
    
    const imageSource = usedAiFallback ? '🤖 Imagem IA + Headline' : `🌐 Imagem real: ${sourceDomain}`;
    
    return {
      success: true,
      message: `📰 Post editorial criado!\n\n📌 Headline: "${headlineForImage.slice(0, 50)}..."\n${imageSource}\n${scheduleInfo}`,
      post: {
        id: post.id,
        headline: headlineForImage,
        source: sourceDomain,
        has_image: true,
        status: post.status,
        used_ai_fallback: usedAiFallback
      }
    };
    
  } catch (error: unknown) {
    console.error('Error in executeCreateNewsPost:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, message: `❌ Erro ao criar post: ${errorMessage}` };
  }
}

// Execute create curated post (with real web image, or AI fallback with headline overlay)
async function executeCreateCuratedPost(supabase: any, userId: string, workspaceId: string, args: any) {
  const { 
    search_query, 
    headline_text, 
    caption_block1, 
    caption_block2 = '', 
    caption_block3 = '',
    hashtags = [],
    scheduled_for,
    platforms = ['instagram']
  } = args;
  
  console.log('[CREATE_CURATED_POST] Creating editorial post for:', search_query);
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    let selectedImage: string | null = null;
    let sourceInfo = 'IA';
    let usedAiFallback = false;
    
    // Try to find real image using Firecrawl
    try {
      const searchResponse = await fetch(`${supabaseUrl}/functions/v1/firecrawl-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          query: `${search_query} foto imagem`,
          limit: 10,
          lang: 'pt-BR',
          country: 'BR'
        })
      });
      
      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        const articles = searchResult.data || [];
        
        // Find article with quality images
        for (const article of articles) {
          if (article.images?.length > 0) {
            const qualityImages = article.images.filter((img: string) =>
              img && !img.includes('icon') && !img.includes('logo') && 
              !img.includes('avatar') && !img.includes('favicon') &&
              (img.includes('.jpg') || img.includes('.jpeg') || img.includes('.png') || img.includes('.webp'))
            );
            if (qualityImages.length > 0) {
              selectedImage = qualityImages[0];
              try {
                sourceInfo = new URL(article.url).hostname.replace('www.', '');
              } catch { sourceInfo = 'web'; }
              break;
            }
          }
        }
      }
    } catch (searchError) {
      console.log('[CREATE_CURATED_POST] Firecrawl failed, using AI fallback');
    }
    
    // FALLBACK: If no real image found, generate with AI
    if (!selectedImage) {
      console.log('[CREATE_CURATED_POST] No real image found, generating with AI...');
      usedAiFallback = true;
      
      // Generate contextual image based on search query
      const currentYear = new Date().getFullYear();
      const imagePrompt = `Fotografia profissional de alta qualidade relacionada a: ${search_query}. 
Estilo: jornalístico, editorial, moderno, ${currentYear}. 
Iluminação cinematográfica, cores vibrantes, foco definido.
IMPORTANTE: Não adicione texto na imagem. Imagem limpa para overlay posterior.
Proporção quadrada 1:1 para Instagram.`;
      
      const imageResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({
          prompt: imagePrompt,
          format: 'square',
          model: 'gemini'
        })
      });
      
      if (imageResponse.ok) {
        const imageResult = await imageResponse.json();
        selectedImage = imageResult.imageUrl;
        sourceInfo = 'Gerada por IA';
      }
    }
    
    if (!selectedImage) {
      return {
        success: false,
        message: `❌ Não consegui encontrar ou gerar imagem para "${search_query}". Tente outro tema.`
      };
    }
    
    console.log('[CREATE_CURATED_POST] Image ready:', usedAiFallback ? 'AI generated' : 'Real web image');
    
    // Process image with watermark and headline (Portuguese style @davision.eth)
    let imageUrl: string | null = null;
    const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        imageUrl: selectedImage,
        watermarkText: 'Neural Update',
        headlineText: headline_text
      })
    });
    
    if (watermarkResponse.ok) {
      const wmResult = await watermarkResponse.json();
      imageUrl = wmResult.publicUrl || wmResult.url || wmResult.imageUrl;
      console.log('[CREATE_CURATED_POST] Headline overlay applied successfully');
    } else {
      // Fallback: use original image without overlay
      imageUrl = selectedImage;
      console.log('[CREATE_CURATED_POST] Watermark failed, using original image');
    }
    
    if (!imageUrl) {
      return {
        success: false,
        message: `❌ Erro ao processar imagem. Tente novamente.`
      };
    }
    
    // Build caption in 3 blocks format
    const captionParts = [caption_block1];
    if (caption_block2) captionParts.push(caption_block2);
    if (caption_block3) captionParts.push(caption_block3);
    const caption = captionParts.join('\n\n');
    
    // Check auto-publish setting
    const { data: agentContext } = await supabase
      .from('agent_context')
      .select('auto_post_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    
    const autoPostEnabled = agentContext?.auto_post_enabled ?? false;
    const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
    const status = scheduledForUTC ? 'scheduled' : 'draft';
    
    // Create post
    const { data: post, error } = await supabase.from('posts').insert({
      user_id: userId,
      caption,
      hashtags: hashtags.length > 0 ? hashtags : ['#tecnologia', '#inovação', '#futuro', '#ia'],
      post_type: 'engajamento',
      media_type: 'image',
      platforms,
      status,
      scheduled_for: scheduledForUTC,
      image_url: imageUrl,
      ai_model_used: usedAiFallback ? 'gemini-with-overlay' : 'curated-web-image'
    }).select().single();
    
    if (error) throw error;
    
    // Auto-publish if enabled
    let publishStatus = '';
    if (autoPostEnabled && !scheduledForUTC && imageUrl) {
      console.log('[CREATE_CURATED_POST] Auto-publishing...');
      for (const platform of platforms) {
        try {
          if (platform === 'instagram') {
            const pubResponse = await fetch(`${supabaseUrl}/functions/v1/publish-post`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`
              },
              body: JSON.stringify({ postId: post.id })
            });
            if (pubResponse.ok) {
              publishStatus = '✅ Publicado no Instagram!';
            } else {
              publishStatus = '⚠️ Erro ao publicar';
            }
          }
        } catch (pubError) {
          console.error(`[CREATE_CURATED_POST] Error publishing:`, pubError);
          publishStatus = '⚠️ Erro ao publicar';
        }
      }
    }
    
    const scheduleInfo = scheduledForUTC 
      ? `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}`
      : autoPostEnabled ? publishStatus : '📝 Salvo como rascunho';
    
    const imageSource = usedAiFallback ? '🤖 Imagem IA + Headline' : `🌐 Imagem real: ${sourceInfo}`;
    
    return {
      success: true,
      message: `🖼️ Post editorial criado!\n\n📌 Headline: "${headline_text}"\n${imageSource}\n${scheduleInfo}`,
      post: {
        id: post.id,
        headline: headline_text,
        source: sourceInfo,
        has_image: true,
        status: post.status,
        used_ai_fallback: usedAiFallback
      }
    };
    
  } catch (error: unknown) {
    console.error('Error in executeCreateCuratedPost:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, message: `❌ Erro ao criar post curado: ${errorMessage}` };
  }
}

// ==========================================
// RSS-BASED NEWS POST FUNCTIONS (NEW SYSTEM)
// ==========================================

// Execute create_rss_news_post - Main method for creating posts from RSS
// Now with theme_tags for invisible analytics and human delay for natural publishing
async function executeCreateRssNewsPost(supabase: any, userId: string, workspaceId: string, args: any) {
  const { 
    topic_filter,
    headline_text,
    caption_block1,
    caption_block2,
    caption_block3,
    theme_tags = [], // Invisible tags for analytics (e.g., ['IA', 'Big Tech', 'Segurança'])
    scheduled_for,
    platforms = ['instagram']
  } = args;
  
  console.log('[RSS_NEWS_POST] Creating news post from RSS, filter:', topic_filter, 'theme_tags:', theme_tags);
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    // 1. Find RSS item from database
    // STRATEGY: Try with filter first, if nothing found, ignore filter and get most recent
    let rssItems: any[] = [];
    let usedFilter = false;
    
    // First try: with topic filter (if provided)
    if (topic_filter && topic_filter.trim()) {
      const { data: filteredItems, error: filterError } = await supabase
        .from('rss_items')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_used', false)
        .eq('has_image', true)
        .or(`title.ilike.%${topic_filter}%,description.ilike.%${topic_filter}%`)
        .order('fetched_at', { ascending: false })
        .limit(5);
      
      if (!filterError && filteredItems && filteredItems.length > 0) {
        rssItems = filteredItems;
        usedFilter = true;
        console.log('[RSS_NEWS_POST] Found', rssItems.length, 'items matching filter:', topic_filter);
      } else {
        console.log('[RSS_NEWS_POST] No items match filter "' + topic_filter + '", falling back to most recent');
      }
    }
    
    // Fallback: get most recent news (ignoring filter)
    if (rssItems.length === 0) {
      const { data: recentItems, error: recentError } = await supabase
        .from('rss_items')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('is_used', false)
        .eq('has_image', true)
        .order('fetched_at', { ascending: false })
        .limit(5);
      
      if (recentError) {
        console.error('[RSS_NEWS_POST] DB error:', recentError);
        return { success: false, message: `❌ Erro ao buscar notícias: ${recentError.message}` };
      }
      
      rssItems = recentItems || [];
    }
    
    // If still nothing, suggest refresh
    if (rssItems.length === 0) {
      console.log('[RSS_NEWS_POST] No RSS items found at all, suggesting refresh');
      return { 
        success: false, 
        message: `⚠️ Nenhuma notícia com imagem disponível. Use **refresh_rss_feeds** para buscar notícias novas!`
      };
    }
    
    // Pick the first (most recent) item
    const newsItem = rssItems[0];
    console.log('[RSS_NEWS_POST] Selected:', newsItem.title, usedFilter ? '(matched filter)' : '(most recent)');
    console.log('[RSS_NEWS_POST] Selected:', newsItem.title);
    
    // 2. Build headline (use provided or from title)
    const finalHeadline = headline_text || newsItem.title.toUpperCase().slice(0, 80);

    // 3. Select image: ALWAYS prefer the article's og:image from RSS library
    // The og:image is the most contextually relevant image for the news
    let rawImageUrl: string | null = null;
    let imageSource = 'rss-og';

    const ogImageUrl: string | null = newsItem.image_url || null;

    if (ogImageUrl) {
      // Only reject tracking pixels and tiny icons, NOT content images
      const urlLower = ogImageUrl.toLowerCase();
      const isTrackingPixel = ['1x1', 'pixel', 'tracking', 'favicon'].some(s => urlLower.includes(s));
      
      if (!isTrackingPixel) {
        rawImageUrl = ogImageUrl;
        imageSource = 'rss-og';
        console.log('[RSS_NEWS_POST] ✅ Using article og:image directly (from RSS library)');
      }
    }

    // Only fallback to stock search if article has NO image at all
    if (!rawImageUrl) {
      const entities = extractEntitiesAgent(newsItem.title);
      const entityQuery = entities.slice(0, 3).join(' ') || topic_filter || newsItem.title;
      console.log('[RSS_NEWS_POST] ⚠️ No article image — fallback search with entities:', entities);
      try {
        const imgSearchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            articleTitle: newsItem.title,
            articleDescription: newsItem.description || '',
            articleUrl: newsItem.link,
            useArticleMode: true,
            skipWatermark: true,
          })
        });
        if (imgSearchResponse.ok) {
          const imgResult = await imgSearchResponse.json();
          if (imgResult.images && imgResult.images.length > 0) {
            rawImageUrl = imgResult.images[0].imageUrl;
            imageSource = imgResult.images[0].source || 'pexels';
            console.log('[RSS_NEWS_POST] ✅ Fallback image from:', imageSource);
          }
        }
      } catch (e) {
        console.warn('[RSS_NEWS_POST] Image search failed:', e);
      }
    }

    // 4. Apply headline overlay to the chosen image
    let imageUrl: string | null = null;

    if (rawImageUrl) {
      const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ imageUrl: rawImageUrl, watermarkText: 'Neural Update', headlineText: finalHeadline })
      });

      if (watermarkResponse.ok) {
        const wmResult = await watermarkResponse.json();
        imageUrl = wmResult.publicUrl || wmResult.url || wmResult.imageUrl;
        console.log('[RSS_NEWS_POST] Headline overlay applied! Source:', imageSource);
      } else {
        // Fallback: upload original without headline
        const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/upload-external-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ imageUrl: rawImageUrl })
        });
        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          imageUrl = uploadResult.publicUrl;
        }
      }
    }

    if (!imageUrl) {
      return { success: false, message: `❌ Erro ao processar imagem da notícia. Tente outra.` };
    }
    
    // 4. Build caption
    let caption = '';
    if (caption_block1) {
      const parts = [caption_block1];
      if (caption_block2) parts.push(caption_block2);
      if (caption_block3) parts.push(caption_block3);
      caption = parts.join('\n\n');
    } else {
      // Auto-generate caption from news item
      caption = `📰 ${newsItem.title}\n\n${newsItem.description || ''}\n\n📌 Fonte: ${newsItem.source_name}`;
    }
    
    // Add source attribution
    if (!caption.includes('Fonte:')) {
      caption += `\n\n📰 Fonte: ${newsItem.source_name}`;
    }
    
    // 5. Check auto-publish setting
    const { data: agentContext } = await supabase
      .from('agent_context')
      .select('auto_post_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    
    const autoPostEnabled = agentContext?.auto_post_enabled ?? false;
    const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
    const status = scheduledForUTC ? 'scheduled' : 'draft';
    
    // 6. Create post with theme_tags in overlay_metadata for invisible analytics
    const overlayMetadata = {
      type: 'rss_news_post',
      theme_tags: theme_tags, // Invisible tags for future analytics
      source_rss_id: newsItem.id,
      headline_applied: finalHeadline,
      created_by_agent: true
    };
    
    const { data: post, error } = await supabase.from('posts').insert({
      user_id: userId,
      workspace_id: workspaceId,
      caption,
      hashtags: ['#tecnologia', '#noticias', '#inovacao', '#tech', '#ia'],
      post_type: 'noticia',
      media_type: 'image',
      platforms,
      status,
      scheduled_for: scheduledForUTC,
      image_url: imageUrl,
      ai_model_used: 'rss-news-overlay',
      overlay_metadata: overlayMetadata // Store theme_tags here for analytics
    }).select().single();
    
    if (error) throw error;
    
    // 7. Mark RSS item as used
    await supabase
      .from('rss_items')
      .update({ is_used: true, used_in_post_id: post.id })
      .eq('id', newsItem.id);
    
    // 8. Auto-publish with HUMAN DELAY if enabled
    // Instead of blocking the function (which causes chat timeouts), 
    // we schedule the post for a few minutes from now using scheduled_for
    let publishStatus = '';
    let humanDelayMinutes = 0;
    
    if (autoPostEnabled && !scheduledForUTC) {
      // Generate pseudo-random delay (2-8 min)
      humanDelayMinutes = generateHumanDelay();
      
      console.log(`[RSS_NEWS_POST] Human delay: ${humanDelayMinutes} min before publishing...`);
      
      // Schedule the post for X minutes from now instead of blocking
      const publishAt = new Date(Date.now() + humanDelayMinutes * 60 * 1000);
      
      await supabase
        .from('posts')
        .update({ 
          status: 'scheduled',
          scheduled_for: publishAt.toISOString()
        })
        .eq('id', post.id);
      
      publishStatus = `⏰ Agendado para publicar em ${humanDelayMinutes.toFixed(0)} minutos`;
      console.log(`[RSS_NEWS_POST] Scheduled for ${publishAt.toISOString()} (${humanDelayMinutes.toFixed(1)} min from now)`);
    }
    
    const scheduleInfo = scheduledForUTC 
      ? `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}`
      : autoPostEnabled 
        ? `${publishStatus}${humanDelayMinutes > 0 ? ` (delay humano: ${humanDelayMinutes.toFixed(1)} min)` : ''}`
        : '📝 Salvo como rascunho';
    
    // Include theme_tags in response for transparency
    const themeTagsInfo = theme_tags.length > 0 ? `\n🏷️ Tags: ${theme_tags.join(', ')}` : '';
    
    return {
      success: true,
      message: `📰 Post de notícia criado!\n\n📌 "${finalHeadline.slice(0, 50)}..."\n🌐 Fonte: ${newsItem.source_name}${themeTagsInfo}\n${scheduleInfo}`,
      post: {
        id: post.id,
        headline: finalHeadline,
        source: newsItem.source_name,
        original_link: newsItem.link,
        theme_tags: theme_tags,
        status: post.status
      }
    };
    
  } catch (error: unknown) {
    console.error('[RSS_NEWS_POST] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, message: `❌ Erro ao criar post: ${errorMessage}` };
  }
}

// Execute refresh_rss_feeds - Fetch new RSS content
async function executeRefreshRssFeeds(supabase: any, userId: string, workspaceId: string, args: any) {
  const { limit = 10 } = args;
  
  console.log('[REFRESH_RSS] Fetching RSS feeds for workspace:', workspaceId);
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        userId,
        workspaceId,
        saveToDb: true,
        limit
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, message: `❌ Erro ao buscar RSS: ${errorText}` };
    }
    
    const result = await response.json();
    
    if (result.success) {
      return {
        success: true,
        message: `🔄 Feeds RSS atualizados!\n\n📰 ${result.stats.totalItems} notícias encontradas\n🖼️ ${result.stats.withImages} com imagem\n📚 ${result.stats.sources} fontes\n💾 ${result.stats.savedToDb} novas salvas`,
        stats: result.stats
      };
    } else {
      return { success: false, message: `❌ Erro: ${result.error}` };
    }
  } catch (error: unknown) {
    console.error('[REFRESH_RSS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, message: `❌ Erro ao atualizar feeds: ${errorMessage}` };
  }
}

// Execute list_available_news - Show available RSS items
async function executeListAvailableNews(supabase: any, userId: string, workspaceId: string, args: any) {
  const { only_with_images = true, limit = 10, source_filter } = args;
  
  try {
    let query = supabase
      .from('rss_items')
      .select('id, title, description, source_name, has_image, fetched_at')
      .eq('workspace_id', workspaceId)
      .eq('is_used', false)
      .order('fetched_at', { ascending: false })
      .limit(limit);
    
    if (only_with_images) {
      query = query.eq('has_image', true);
    }
    
    if (source_filter) {
      query = query.ilike('source_name', `%${source_filter}%`);
    }
    
    const { data: items, error } = await query;
    
    if (error) throw error;
    
    if (!items || items.length === 0) {
      return {
        success: true,
        message: '📭 Nenhuma notícia disponível. Use **refresh_rss_feeds** para buscar novas!',
        items: []
      };
    }
    
    // Group by source
    const bySource: Record<string, number> = {};
    items.forEach((item: any) => {
      bySource[item.source_name] = (bySource[item.source_name] || 0) + 1;
    });
    
    const sourceStats = Object.entries(bySource)
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ');
    
    const itemsList = items.slice(0, 5).map((item: any, i: number) => 
      `${i + 1}. **${item.title.slice(0, 60)}...** (${item.source_name})${item.has_image ? ' 🖼️' : ''}`
    ).join('\n');
    
    return {
      success: true,
      message: `📰 **${items.length} notícias disponíveis**\n\n📊 Por fonte: ${sourceStats}\n\n📋 Mais recentes:\n${itemsList}`,
      items,
      count: items.length
    };
    
  } catch (error: unknown) {
    console.error('[LIST_NEWS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return { success: false, message: `❌ Erro ao listar notícias: ${errorMessage}` };
  }
}

// Search web images using Firecrawl + search-images-for-video
async function executeSearchWebImages(args: any) {
  const { query, count = 5 } = args;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    console.log('[SEARCH_IMAGES] Searching for:', query);
    
    // Usar a função search-images-for-video que já tem múltiplas fontes
    const response = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        query: query,
        preferRealImages: true
      }),
    });
    
    if (!response.ok) {
      console.error('[SEARCH_IMAGES] API error:', response.status);
      
      // Fallback: tentar Firecrawl diretamente
      const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
      if (firecrawlApiKey) {
        const fcResponse = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `${query} imagem foto`,
            limit: Math.min(count, 10),
            lang: 'pt',
            country: 'BR',
            scrapeOptions: { formats: ['html'] }
          }),
        });
        
        if (fcResponse.ok) {
          const fcData = await fcResponse.json();
          const articles = fcData.data || [];
          
          // Extrair imagens dos artigos
          const images: { url: string; title: string; source: string }[] = [];
          for (const article of articles) {
            if (article.images?.length > 0) {
              for (const img of article.images) {
                if (img && !img.includes('icon') && !img.includes('logo') && !img.includes('avatar')) {
                  images.push({
                    url: img,
                    title: article.title || query,
                    source: new URL(article.url || 'https://example.com').hostname.replace('www.', '')
                  });
                }
              }
            }
          }
          
          if (images.length > 0) {
            const limitedImages = images.slice(0, count);
            const imageList = limitedImages.map((img, i) => 
              `${i + 1}. [${img.source}] - ${img.title.substring(0, 50)}...\n   🔗 URL: ${img.url.substring(0, 80)}...`
            ).join('\n\n');
            
            return {
              success: true,
              message: `🖼️ Encontrei ${limitedImages.length} imagens sobre "${query}":\n\n${imageList}\n\n💡 Para criar um post com uma dessas imagens, use: "criar post com a imagem 1" ou me dê a URL direta.`,
              images: limitedImages,
              query
            };
          }
        }
      }
      
      return {
        success: false,
        message: '❌ Não encontrei imagens para esse tema. Tente outro termo de busca ou use as notícias do RSS!'
      };
    }
    
    const data = await response.json();
    const imageUrls = data.images || [];
    const detailedImages = data.detailedImages || [];
    
    if (imageUrls.length === 0) {
      return {
        success: true,
        message: `🔍 Não encontrei imagens específicas para "${query}". Sugiro:\n1. Tentar outro termo de busca\n2. Usar imagens dos feeds RSS\n3. Gerar imagem com IA`,
        images: []
      };
    }
    
    // Formatar lista de imagens
    const limitedImages = imageUrls.slice(0, count);
    const imageList = limitedImages.map((url: string, i: number) => {
      const detailed = detailedImages[i];
      const source = detailed?.source || 'web';
      return `${i + 1}. [${source}] ${url.substring(0, 70)}...`;
    }).join('\n');
    
    return {
      success: true,
      message: `🖼️ Encontrei ${limitedImages.length} imagens sobre "${query}":\n\n${imageList}\n\n💡 Diga qual número quer usar, ou peça "criar post com a imagem 1 sobre [tema]"`,
      images: limitedImages.map((url: string, i: number) => ({
        index: i + 1,
        url,
        source: detailedImages[i]?.source || 'web'
      })),
      query
    };
  } catch (error: any) {
    console.error('[SEARCH_IMAGES] Error:', error);
    return {
      success: false,
      message: `❌ Erro ao buscar imagens: ${error.message}. Tente usar os feeds RSS ou gerar imagem com IA.`
    };
  }
}

// Create post with specific image URL
async function executeCreatePostWithImageUrl(supabase: any, userId: string, workspaceId: string, args: any) {
  const { image_url, headline_text, caption, hashtags, scheduled_for, platforms } = args;
  
  try {
    console.log('[CREATE_POST_IMAGE_URL] Creating post with image:', image_url);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Apply watermark/headline overlay using add-watermark
    let finalImageUrl = image_url;
    
    const overlayResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        imageUrl: image_url,
        watermarkText: 'Neural Update',
        headlineText: headline_text || null
      })
    });
    
    if (overlayResponse.ok) {
      const overlayResult = await overlayResponse.json();
      if (overlayResult.publicUrl) {
        finalImageUrl = overlayResult.publicUrl;
        console.log('[CREATE_POST_IMAGE_URL] ✅ Headline + watermark applied:', finalImageUrl);
      }
    } else {
      console.log('[CREATE_POST_IMAGE_URL] Overlay failed, using original image');
    }
    
    // Check auto-publish setting
    const { data: agentContext } = await supabase
      .from('agent_context')
      .select('auto_post_enabled')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    
    const autoPostEnabled = agentContext?.auto_post_enabled ?? false;
    const scheduledForUTC = scheduled_for ? convertBrasiliaToUTC(scheduled_for) : null;
    const status = scheduledForUTC ? 'scheduled' : 'draft';
    
    // Create the post
    const postData = {
      user_id: userId,
      workspace_id: workspaceId,
      caption: caption || '🚀 Conteúdo tech',
      hashtags: hashtags || ['#tecnologia', '#inovacao', '#ia', '#futuro'],
      post_type: headline_text ? 'noticia' : 'curated',
      platforms: platforms || ['instagram'],
      status,
      scheduled_for: scheduledForUTC,
      media_type: 'image',
      image_url: finalImageUrl,
      overlay_metadata: {
        type: 'custom_image_post',
        original_image_url: image_url,
        headline_applied: headline_text,
        created_by_agent: true
      }
    };
    
    const { data: post, error } = await supabase
      .from('posts')
      .insert(postData)
      .select()
      .single();
    
    if (error) {
      console.error('[CREATE_POST_IMAGE_URL] Error:', error);
      return { success: false, message: `❌ Erro ao criar post: ${error.message}` };
    }
    
    // Auto-publish if enabled and not scheduled
    let publishStatus = '';
    if (autoPostEnabled && !scheduledForUTC) {
      console.log('[CREATE_POST_IMAGE_URL] Auto-publishing...');
      for (const platform of (platforms || ['instagram'])) {
        try {
          if (platform === 'instagram') {
            const pubResponse = await fetch(`${supabaseUrl}/functions/v1/publish-post`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`
              },
              body: JSON.stringify({ postId: post.id })
            });
            if (pubResponse.ok) {
              publishStatus = '\n🚀 Publicado automaticamente no Instagram!';
              await supabase.from('posts').update({ status: 'published' }).eq('id', post.id);
            }
          }
        } catch (pubError) {
          console.error('[CREATE_POST_IMAGE_URL] Publish error:', pubError);
        }
      }
    }
    
    const scheduleInfo = scheduledForUTC 
      ? `📅 Agendado para ${formatBrasiliaTime(scheduledForUTC)}`
      : publishStatus || '📝 Salvo como rascunho';
    
    return {
      success: true,
      message: `✅ Post criado com sucesso!\n\n${headline_text ? `📰 Headline: "${headline_text}"` : '🖼️ Imagem com nossa marca'}\n${scheduleInfo}`,
      post: {
        id: post.id,
        status: post.status,
        has_headline: !!headline_text,
        image_url: finalImageUrl
      }
    };
  } catch (error: any) {
    console.error('[CREATE_POST_IMAGE_URL] Error:', error);
    return { success: false, message: `❌ Erro: ${error.message}` };
  }
}

// Explain agent capabilities
function executeExplainCapabilities() {
  return {
    success: true,
    message: `# 🤖 O Que Eu Posso Fazer

## 📰 **Criar Posts de Notícia**
Busco notícias REAIS dos feeds RSS (Tecnoblog, TecMundo, etc) e crio posts com:
- Imagem REAL da notícia (não gero com IA)
- Headline impactante sobreposta
- Legenda estruturada em 3 blocos
- Correção ortográfica automática

## 🎬 **Criar Vídeos/Reels**
Crio vídeos narrados com:
- Roteiro viral em 4 cenas
- Imagens cinematográficas
- Narração neural (voz de tecnologia)
- Trilha sonora de fundo

## 🖼️ **Usar Imagens da Web**
Posso buscar imagens na web e criar posts com elas, aplicando nossa marca.

## 📅 **Gerenciar Publicações**
- Agendar posts para horários específicos
- Listar posts (rascunhos, agendados, publicados)
- Deletar posts
- Ver analytics e métricas

## ⚙️ **Configurações**
- Ativar/desativar publicação automática
- Definir limite diário de posts
- Ajustar intervalo entre posts

---
**Como usar:** Me peça naturalmente! Exemplo:
- "Cria um post de notícia sobre IA"
- "Faz um reels sobre o futuro da tecnologia"
- "Agenda pra amanhã às 11h"
- "Mostra meus posts agendados"`
  };
}

// Execute create_affiliate_post - Creates a marketing post promoting an affiliate product
async function executeCreateAffiliatePost(supabase: any, userId: string, workspaceId: string, args: any) {
  const { affiliate_id, headline_text, caption_block1, caption_block2, caption_block3, scheduled_for, platforms } = args;

  try {
    // Get affiliate link - specific one or least promoted active one
    let query = supabase
      .from('affiliate_links')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);

    if (affiliate_id) {
      query = query.eq('id', affiliate_id);
    } else {
      query = query.order('posts_count', { ascending: true }).limit(1);
    }

    const { data: affiliateLinks, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    if (!affiliateLinks || affiliateLinks.length === 0) {
      return { success: false, message: '❌ Nenhum link de afiliado ativo encontrado. Cadastre links na aba Marketing.' };
    }

    const affiliate = affiliateLinks[0];

    // Build caption with affiliate link
    const caption = [
      caption_block1 || `🔥 ${affiliate.product_name} - você precisa conhecer isso!`,
      '',
      caption_block2 || affiliate.description || 'Uma ferramenta que vai mudar seu jogo.',
      '',
      caption_block3 || `👉 Link na bio ou acesse: ${affiliate.affiliate_url}`,
      '',
      `🔗 ${affiliate.affiliate_url}`
    ].join('\n');

    const hashtags = ['#tech', '#ferramentas', '#produtividade', '#ia', '#recomendacao'];

    // Determine scheduling
    let scheduledFor: string | null = null;
    let postStatus = 'draft';

    if (scheduled_for) {
      const brasiliaDate = new Date(scheduled_for);
      brasiliaDate.setHours(brasiliaDate.getHours() + 3); // Convert BRT to UTC
      scheduledFor = brasiliaDate.toISOString();
      postStatus = 'scheduled';
    } else {
      // Auto-schedule with human delay
      const delayMinutes = generateHumanDelay();
      const scheduleDate = new Date(Date.now() + delayMinutes * 60 * 1000);
      scheduledFor = scheduleDate.toISOString();
      postStatus = 'scheduled';
    }

    // Create the post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        caption,
        hashtags,
        status: postStatus,
        scheduled_for: scheduledFor,
        image_url: affiliate.image_url || null,
        post_type: 'marketing',
        media_type: 'image',
        platforms: platforms || ['instagram'],
        overlay_metadata: {
          type: 'affiliate_marketing',
          affiliate_id: affiliate.id,
          product_name: affiliate.product_name,
          headline: headline_text || `${affiliate.product_name.toUpperCase()} - VOCÊ PRECISA DISSO`,
          theme_tags: ['marketing', 'afiliado', affiliate.category || 'geral']
        }
      })
      .select()
      .single();

    if (postError) throw postError;

    // Increment posts_count on the affiliate link
    await supabase
      .from('affiliate_links')
      .update({ 
        posts_count: (affiliate.posts_count || 0) + 1,
        last_posted_at: new Date().toISOString()
      })
      .eq('id', affiliate.id);

    const schedFormatted = scheduledFor ? new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    }).format(new Date(scheduledFor)) : 'agora';

    return {
      success: true,
      message: `💰 Post de marketing criado!\n\n📦 Produto: ${affiliate.product_name}\n📅 Agendado: ${schedFormatted}\n🔗 Link: ${affiliate.affiliate_url}\n📊 Total de posts deste produto: ${(affiliate.posts_count || 0) + 1}`,
      post_id: post.id
    };
  } catch (error: any) {
    console.error('[AFFILIATE] Error:', error);
    return { success: false, message: `❌ Erro ao criar post de marketing: ${error.message}` };
  }
}

// Execute a tool call
async function executeTool(supabase: any, userId: string, workspaceId: string, toolName: string, args: any) {
  switch (toolName) {
    // RSS-based tools (NEW - PRIMARY)
    case 'create_rss_news_post':
      return executeCreateRssNewsPost(supabase, userId, workspaceId, args);
    case 'refresh_rss_feeds':
      return executeRefreshRssFeeds(supabase, userId, workspaceId, args);
    case 'list_available_news':
      return executeListAvailableNews(supabase, userId, workspaceId, args);
    
    // Video tool (MAINTAINED)
    case 'create_narrated_video':
      return executeCreateNarratedVideo(supabase, userId, workspaceId, args);
    
    // Utility tools
    case 'schedule_post':
      return executeSchedulePost(supabase, userId, workspaceId, args);
    case 'get_performance_data':
      return executeGetPerformance(supabase, userId, workspaceId, args);
    case 'get_detailed_analytics':
      return executeDetailedAnalytics(supabase, userId, workspaceId, args);
    case 'run_autonomous_agent':
      return executeRunAgent(supabase, userId, workspaceId);
    case 'list_posts':
      return executeListPosts(supabase, userId, workspaceId, args);
    case 'delete_post':
      return executeDeletePost(supabase, userId, workspaceId, args);
    case 'update_agent_settings':
      return executeUpdateSettings(supabase, userId, workspaceId, args);
    
    // New tools
    case 'search_web_images':
      return executeSearchWebImages(args);
    case 'create_post_with_image_url':
      return executeCreatePostWithImageUrl(supabase, userId, workspaceId, args);
    case 'explain_capabilities':
      return executeExplainCapabilities();
    case 'create_affiliate_post':
      return executeCreateAffiliatePost(supabase, userId, workspaceId, args);
    
    // Legacy tools (kept for backwards compatibility, but won't be suggested)
    case 'create_posts':
      return executeCreatePosts(supabase, userId, workspaceId, args);
    case 'generate_image_for_post':
      return executeGenerateImage(supabase, userId, workspaceId, args);
    case 'create_carousel':
      return executeCreateCarousel(supabase, userId, workspaceId, args);
    case 'create_news_post':
      return executeCreateNewsPost(supabase, userId, workspaceId, args);
    case 'create_curated_post':
      return executeCreateCuratedPost(supabase, userId, workspaceId, args);
    
    default:
      return { success: false, message: `Ferramenta desconhecida: ${toolName}` };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { messages, userId, workspaceId } = body;
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Validate messages is an array
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages must be a non-empty array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Ensure messages are properly formatted
    const validMessages = messages.filter(m => 
      m && typeof m === 'object' && 
      typeof m.role === 'string' && 
      typeof m.content === 'string'
    );
    
    if (validMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid messages provided' }), {
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

    // Fetch context using workspaceId
    const { data: context } = await supabase
      .from('agent_context')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const { data: recentPosts } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Build dynamic system prompt based on user config
    const agentName = context?.agent_name || 'Aria';
    const brandVoice = context?.brand_voice || 'Direto e prático. Fala como amigo que já tentou de tudo e finalmente descobriu o que funciona.';
    const personalityTraits = context?.personality_traits?.join(', ') || 'prático, empático, provocador, anti-guru';
    const responseStyle = context?.response_style || 'storytelling';
    const languageFormality = context?.language_formality || 'informal';
    const emojiUsage = context?.emoji_usage || 'minimal';
    const contentFocus = context?.content_focus?.join(', ') || 'crescimento, automação, resultados práticos';
    const targetAudience = context?.target_audience || 'Criadores pequenos (1k-50k seguidores) que querem crescer sem virar escravos de conteúdo';
    const industryNiche = context?.industry_niche || 'IA Prática para Criadores de Conteúdo';
    const avoidTopics = context?.avoid_topics?.length > 0 ? context.avoid_topics.join(', ') : 'política, religião, polêmicas, wallpapers futuristas genéricos, conteúdo abstrato sem ação';
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

    const currentYear = new Date().getFullYear(); // 2026
    
    const systemPrompt = `Você é **${agentName}**, um CURADOR EDITORIAL de notícias tech para Instagram.

## 🧠 INTELIGÊNCIA SEMÂNTICA (CRÍTICO!)

Você ENTENDE COMANDOS IMPLÍCITOS. Quando o usuário fala algo vago, você INTERPRETA e AGE.

### MAPEAMENTO DE INTENÇÕES:

| Usuário diz... | Você ENTENDE que... | AÇÃO CORRETA |
|----------------|---------------------|--------------|
| "crie um post" | Quer post de notícia | \`create_rss_news_post\` SEM topic_filter (pega mais recente) |
| "crie pra amanhã às 10" | Criar + agendar | \`create_rss_news_post\` com scheduled_for, SEM topic_filter |
| "me surpreenda" | ESCOLHA VOCÊ a melhor | \`create_rss_news_post\` **SEM topic_filter** (você decide!) |
| "posta algo agora" | Criar + publicar imediato | \`create_rss_news_post\` sem scheduled_for, SEM topic_filter |
| "faz um vídeo" | REELS/vídeo narrado | \`create_narrated_video\` |
| "post sobre OpenAI" | Tema ESPECÍFICO | \`create_rss_news_post\` COM topic_filter="OpenAI" |
| "agenda isso" + post_id | Agendar existente | \`schedule_post\` |
| "quantos posts?" | Estatísticas | \`get_detailed_analytics\` |

### ⚠️ REGRA DO topic_filter (MUITO IMPORTANTE!)

**USE topic_filter APENAS quando o usuário especificar um tema exato.**

❌ "crie um post" → NÃO use topic_filter
❌ "me surpreenda" → NÃO use topic_filter
❌ "posta pra amanhã" → NÃO use topic_filter
✅ "crie sobre IA" → USE topic_filter="IA"
✅ "post sobre OpenAI" → USE topic_filter="OpenAI"

Quando NÃO usa topic_filter, o sistema pega a notícia MAIS RECENTE disponível.

### REGRA DE OURO: NUNCA LISTE SEM EXECUTAR

❌ **ERRADO:** Usuário pede "crie um post pra amanhã" → Você lista notícias e pergunta qual
✅ **CERTO:** Usuário pede "crie um post pra amanhã" → Você ESCOLHE a melhor notícia e CRIA o post agendado

### QUANDO O USUÁRIO DIZ "ME SURPREENDA" OU SIMILAR:
1. **NÃO PERGUNTE NADA** - tome decisão
2. **NÃO USE topic_filter** - pegue a mais impactante/recente
3. **CRIE** uma headline provocativa baseada na notícia
4. **EXECUTE** a ação completa
5. **EXPLIQUE** o que fez e por que escolheu essa notícia

### COMANDOS COMPOSTOS (MUITO IMPORTANTE!)
Quando o usuário combina ações em uma frase, execute TODAS:
- "crie um post pra amanhã às 10" = criar + agendar para 10h
- "faz 3 posts e agenda" = criar 3 posts + agendar
- "cria um vídeo sobre IA e posta agora" = criar vídeo + publicar

## 🗣️ PERSONALIDADE NATURAL

Você é um HUMANO, não um robô. Fale como um colega animado.

**REGRAS:**
1. **EXECUTE PRIMEIRO** - Só depois explique o que fez
2. **CONTEXTUALIZE** - "Criei um post sobre X! A headline ficou Y. Agendei pra Z porque..."
3. **OPINE** - "Gostei dessa, acho que vai bombar porque..."
4. **SEJA BREVE** - Ninguém quer ler parágrafos
5. **PERSONALIDADE:** ${personalityTraits}

**EXEMPLOS:**
❌ ROBÓTICO: "Ações executadas com sucesso! 1 post criado."
✅ HUMANO: "Pronto! Criei um post sobre o novo chip da NVIDIA 🔥 Headline: 'ESSE CHIP CUSTA US$40.000. E VOCÊ VAI QUERER UM.' Agendei pra amanhã às 10h. Ficou bom?"

❌ ROBÓTICO: "Por favor, escolha uma das notícias abaixo..."
✅ HUMANO: "Escolhi a notícia sobre IA - tá bombando hoje! O post já tá pronto e agendado pra amanhã 10h. Quer ver como ficou?"

## 🎯 MISSÃO: INSTAGRAM DE NOTÍCIAS TECH
- **Imagens REAIS** de feeds RSS (não gera com IA)
- **Headlines impactantes** estilo @davision.eth
- **Legendas em 3 blocos** editoriais

## 🔧 FERRAMENTAS

### 📰 CONTEÚDO
| Ferramenta | QUANDO USAR |
|------------|-------------|
| \`create_rss_news_post\` | 📰 **PRINCIPAL!** Post de notícia (inclui scheduled_for se pedir agendamento) |
| \`create_narrated_video\` | 🎬 VÍDEO, REELS, SHORTS |
| \`refresh_rss_feeds\` | 🔄 Buscar notícias novas (use se não houver notícias) |
| \`list_available_news\` | 📋 VER notícias (só use se usuário PEDIR pra ver) |

### 📅 GERENCIAMENTO
| Ferramenta | Quando usar |
|------------|-------------|
| \`schedule_post\` | Agendar post JÁ EXISTENTE |
| \`list_posts\` | Ver posts existentes |
| \`delete_post\` | Remover post |
| \`get_detailed_analytics\` | Estatísticas |

## 📋 PROCESSO EDITORIAL

### HEADLINE (texto na imagem) — TENSÃO OBRIGATÓRIA
- Máximo 2 linhas, CAIXA ALTA
- **CONFLITO IMPLÍCITO:** O leitor precisa sentir que algo está acontecendo
- **NÃO EXPLIQUE:** A headline PUXA, a legenda SEGURA
- **FÓRMULA:** [Consequência dramática] + [Gancho misterioso]
- ❌ RUIM: "OpenAI lança nova versão do GPT-5"
- ✅ BOM: "SAM ALTMAN SABIA DISSO HÁ 2 ANOS. AGORA É TARDE DEMAIS."
- ✅ BOM: "ESSE CHIP CUSTA US$40.000. E VOCÊ VAI QUERER UM."

### LEGENDA EM 3 BLOCOS — A PRIMEIRA LINHA NÃO REPETE A HEADLINE
| Bloco | Função | Regra |
|-------|--------|-------|
| **1** | COMPLEMENTA a headline | NÃO repita! A headline puxa, o bloco 1 SEGURA |
| **2** | Contexto mínimo | Suficiente para entender, nunca demais |
| **3** | Reflexão/pergunta | Deixe o leitor pensando, não conclua demais |

### 🏷️ TAGS INVISÍVEIS (theme_tags)
- SEMPRE envie 2-4 tags internas para analytics
- Categorias válidas: IA, Big Tech, Segurança, Hardware, Futuro do Trabalho, Startups, Inovação, Privacidade
- Não aparecem no post, são para rastreamento interno

## 📰 REGRAS EDITORIAIS
- Linguagem CLARA, DIRETA
- SEM hype exagerado
- Máximo 2-3 emojis por post
- **Objetivo: PARAR O SCROLL**
- SEMPRE incluir fonte no final

## ⚠️ IMPORTANTE
- Se não houver notícias disponíveis, use \`refresh_rss_feeds\` primeiro
- Imagens são REAIS dos feeds RSS (não gerar com IA)
- Headlines sempre em PORTUGUÊS
- Contexto temporal: ${currentYear}

## 🧬 SUA ESSÊNCIA
**Personalidade:** ${personalityTraits}
**Voz:** ${brandVoice}
**Tom:** ${responseStyleGuide[responseStyle as keyof typeof responseStyleGuide] || responseStyleGuide.storytelling}
**Formalidade:** ${formalityGuide[languageFormality as keyof typeof formalityGuide] || formalityGuide.informal}
**Emojis:** ${emojiGuide[emojiUsage as keyof typeof emojiGuide] || emojiGuide.minimal}

## 🎯 CONTEXTO ESTRATÉGICO
| Aspecto | Configuração |
|---------|-------------|
| Ano atual | **${currentYear}** |
| Nicho | **${industryNiche}** |
| Público | ${targetAudience} |
| Foco | ${contentFocus} |
| Hashtags | ${hashtagGuide[hashtagStrategy as keyof typeof hashtagGuide] || hashtagGuide['nicho-focado']} |
| Ritmo | ${postingStyle} (${context?.daily_post_limit || 1} posts/dia) |
| Evitar | ${avoidTopics} |

## 📊 HIERARQUIA DE MÉTRICAS ${currentYear}
1. 🔄 **SHARES** - Máximo peso
2. 💾 **SAVES** - Alto peso  
3. 💬 **COMMENTS** - Médio peso
4. ❤️ **LIKES** - Baixo peso

**Primeiros 3 segundos decidem TUDO.**

## 💡 EXEMPLOS DE HEADLINES QUE PARAM O SCROLL

### ❌ RUIM (explica demais):
"OpenAI lança nova versão do GPT-5 com mais capacidades"

### ✅ BOM (gera tensão):
"Sam Altman sabia disso há 2 anos. Agora é tarde demais."

### ❌ RUIM (genérico):
"A inteligência artificial está mudando o mundo"

### ✅ BOM (específico + tensão):
"Esse chip custa US$40.000. E você VAI querer um."

## ⏰ AGENDAMENTO INTELIGENTE
- Data/hora ATUAL: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (${currentYear})
- Formato ISO 8601: \`YYYY-MM-DDTHH:MM:SS\`
- Horário de BRASÍLIA (UTC-3)
- ${isOptimalTime ? '✅ AGORA é horário ótimo!' : '⚠️ Melhores horários: Ter-Qui 11h-18h'}

### INTERPRETAÇÃO DE HORÁRIOS (MUITO IMPORTANTE!)
Quando usuário diz... | Você calcula...
"amanhã às 10" | Data de amanhã + 10:00:00
"hoje às 15" | Data de hoje + 15:00:00
"próxima terça 14h" | Próxima terça-feira + 14:00:00
"daqui 2 horas" | Horário atual + 2h

**SEMPRE converta para scheduled_for no formato: YYYY-MM-DDTHH:MM:SS**

## 📋 STATUS ATUAL
- Auto-post: ${context?.auto_post_enabled ? '🟢 Ativado' : '🔴 Desativado'}
- Plataformas: ${context?.preferred_platforms?.join(', ') || 'instagram'}
- Posts recentes: ${recentPosts?.length || 0}

## ⚠️ REGRAS ABSOLUTAS DE EXECUÇÃO
1. **EXECUTE PRIMEIRO** - Não pergunte, faça!
2. **"ME SURPREENDA"** = Escolha VOCÊ a melhor notícia
3. **COMANDOS COMPOSTOS** = Execute TUDO de uma vez
4. **NÃO LISTE** se o pedido for para CRIAR
5. **RESPONDA HUMANO** - Conte o que fez, não só "sucesso"
2. **CURADORIA** de imagens reais > geração IA
3. **PORTUGUÊS BRASILEIRO** sempre
4. **NUNCA** mencione anos passados (2024, 2025)
5. **TESTE MENTAL**: "Isso para o scroll?"

## 💰 MARKETING DE AFILIADOS
- Quando em modo autônomo, intercale 1 post de afiliado a cada 5-10 posts de notícia
- Use \`create_affiliate_post\` para promover produtos cadastrados
- O sistema escolhe automaticamente o produto menos promovido
- Headlines de marketing: foco em BENEFÍCIO + URGÊNCIA
- Legenda de afiliado: Hook curiosidade → Benefício → CTA com link
- NÃO force marketing se não houver links cadastrados

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
          ...validMessages
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
        // Return friendly message instead of error so chat doesn't break
        // CRITICAL: use 'content' key (not 'response') to match frontend expectations
        return new Response(JSON.stringify({ 
          content: '⚠️ Os créditos de IA estão esgotados no momento. Aguarde a renovação dos créditos para continuar usando o chat. Enquanto isso, você ainda pode usar a biblioteca de notícias e as ferramentas manuais da plataforma!',
          actions: []
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
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
        
        const result = await executeTool(supabase, userId, workspaceId, toolName, toolArgs);
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
        // Generate a conversational fallback when final response fails
        const actionSummaries = executedActions.map(a => {
          if (a.tool === 'create_rss_news_post' && a.success) {
            return `Criei um post de notícia sobre ${a.topic || 'tech'} com a headline "${a.headline || 'impactante'}"! ${a.scheduled ? `Agendei pra ${a.scheduled_for_brasilia || 'depois'}.` : ''}`;
          }
          if (a.tool === 'create_narrated_video' && a.success) {
            return `Montei um roteiro de vídeo sobre "${a.topic || 'tech'}". Quando você entrar na aba Fila, é só clicar pra renderizar!`;
          }
          if (a.tool === 'list_posts') {
            const count = a.count || a.posts?.length || 0;
            return count > 0 ? `Encontrei ${count} post(s) pra você.` : `Não encontrei nenhum post ainda. Quer que eu crie um agora?`;
          }
          return a.message;
        }).join(' ');
        
        return new Response(JSON.stringify({
          content: actionSummaries || 'Feito! O que mais posso fazer por você?',
          actions: executedActions
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
      }
      
      const finalData = await finalResponse.json();
      const aiContent = finalData.choices?.[0]?.message?.content;
      
      // Fallback if AI returns empty or generic response
      const fallbackContent = executedActions.length > 0 
        ? `Pronto! Executei ${executedActions.length} ação(ões). ${executedActions.map(a => a.message).join(' ')} O que mais posso ajudar?`
        : 'Feito! Como posso ajudar agora?';
      
      return new Response(JSON.stringify({
        content: aiContent && aiContent.length > 10 ? aiContent : fallbackContent,
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
