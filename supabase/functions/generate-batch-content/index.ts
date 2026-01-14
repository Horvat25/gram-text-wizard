import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Best times to post on Instagram (Brazilian timezone)
const BEST_TIMES = ['09:00', '12:30', '19:00'];

const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const POST_TYPES = ['engajamento', 'educacional', 'storytelling', 'viral', 'vendas'];

interface GeneratedPost {
  topic: string;
  postType: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  scheduledFor: string;
  dayLabel: string;
  timeLabel: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { niche, period, postsPerDay = 3 } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error("Não autorizado");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Decode JWT to get user id
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error("Usuário não autenticado");
    }

    const days = period === 'day' ? 1 : 7;
    const totalPosts = postsPerDay * days;
    
    console.log(`Generating ${totalPosts} posts for ${period} (${days} days x ${postsPerDay} posts/day) for niche: ${niche}`);

    // Generate all posts at once with a single API call
    const systemPrompt = `Você é um especialista em marketing digital e criação de conteúdo para Instagram.
Sua tarefa é gerar posts completos e prontos para publicação.

REGRAS IMPORTANTES PARA LEGENDAS:
1. Cada legenda deve ter NO MÁXIMO 2-3 parágrafos curtos (máximo 4 em casos especiais)
2. Seja DIRETO e OBJETIVO - ninguém gosta de ler textos longos
3. Use 2-4 emojis estratégicos (não exagere)
4. Sempre termine com uma CTA clara
5. Total: 400-800 caracteres por legenda (NUNCA mais que 1000)
6. NÃO use markdown (**, _, \`, etc) - Instagram não suporta

ESTRUTURA IDEAL:
- Parágrafo 1: Hook forte (1-2 linhas)
- Parágrafo 2: Desenvolvimento rápido (2-3 linhas)
- Parágrafo 3: CTA direto (1-2 linhas)`;

    const userPrompt = `Gere ${totalPosts} posts COMPLETOS para Instagram no nicho: "${niche}"

Distribua variando os tipos de post: engajamento, educacional, storytelling, viral, vendas

Para cada post, retorne em JSON:
{
  "posts": [
    {
      "topic": "Tema específico do post",
      "postType": "engajamento|educacional|storytelling|viral|vendas",
      "caption": "Legenda CURTA e DIRETA (2-3 parágrafos, máx 800 caracteres)",
      "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5", "hashtag6", "hashtag7", "hashtag8"],
      "imagePrompt": "Prompt em inglês para gerar imagem"
    }
  ]
}

IMPORTANTE:
- Legendas CURTAS (2-3 parágrafos, máx 4)
- 400-800 caracteres por legenda
- Direto ao ponto
- Sem enrolação
- 8 hashtags mix (pequenas, médias, grandes)
- Retorne APENAS o JSON válido`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos à sua conta." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Nenhum conteúdo recebido da IA");
    }

    // Parse JSON from response
    let generatedPosts;
    try {
      let jsonContent = content;
      if (jsonContent.includes("```json")) {
        jsonContent = jsonContent.replace(/```json\s*/g, "").replace(/```\s*/g, "");
      } else if (jsonContent.includes("```")) {
        jsonContent = jsonContent.replace(/```\s*/g, "");
      }
      jsonContent = jsonContent.trim();
      generatedPosts = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error("Parse error:", parseError, "Content:", content.substring(0, 500));
      throw new Error("Erro ao processar resposta da IA");
    }

    const posts = generatedPosts.posts || [];
    
    // Schedule posts
    const now = new Date();
    const scheduledPosts: GeneratedPost[] = [];
    
    let postIndex = 0;
    for (let dayOffset = 0; dayOffset < days && postIndex < posts.length; dayOffset++) {
      const date = new Date(now);
      date.setDate(date.getDate() + dayOffset);
      
      for (let timeIndex = 0; timeIndex < BEST_TIMES.length && postIndex < posts.length; timeIndex++) {
        const post = posts[postIndex];
        const [hours, minutes] = BEST_TIMES[timeIndex].split(':').map(Number);
        
        const scheduledDate = new Date(date);
        scheduledDate.setHours(hours, minutes, 0, 0);
        
        // Skip if time has already passed today
        if (dayOffset === 0 && scheduledDate <= now) {
          continue;
        }
        
        scheduledPosts.push({
          topic: post.topic,
          postType: post.postType,
          caption: post.caption,
          hashtags: post.hashtags,
          imagePrompt: post.imagePrompt,
          scheduledFor: scheduledDate.toISOString(),
          dayLabel: DAYS_PT[scheduledDate.getDay()],
          timeLabel: BEST_TIMES[timeIndex],
        });
        
        postIndex++;
      }
    }

    // Save posts to database
    const postsToInsert = scheduledPosts.map(post => ({
      user_id: user.id,
      caption: post.caption,
      hashtags: post.hashtags,
      post_type: post.postType,
      status: 'scheduled',
      scheduled_for: post.scheduledFor,
      image_url: null, // User will need to generate images
    }));

    if (postsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('posts')
        .insert(postsToInsert);

      if (insertError) {
        console.error("Error inserting posts:", insertError);
        throw new Error("Erro ao salvar posts no banco de dados");
      }
    }

    console.log(`Successfully created ${scheduledPosts.length} scheduled posts`);

    return new Response(JSON.stringify({ 
      scheduledPosts,
      message: `${scheduledPosts.length} posts criados e agendados com sucesso!`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in generate-batch-content:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro ao gerar conteúdo" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
