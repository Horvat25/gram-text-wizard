import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * BRAND NEWS VIDEO — PIPELINE COMPLETO NEURAL UPDATE
 * 
 * Recebe uma notícia RSS e produz um vídeo brandado automaticamente:
 * 1. Gera script editorial (4 cenas)
 * 2. Gera/busca imagens para cada cena
 * 3. Aplica branding Neural Update em cada imagem (header + watermark + headline)
 * 4. Gera narração por segmento (edge-tts)
 * 5. Compõe vídeo final via Replicate (slideshow com motion)
 * 6. Salva vídeo no Storage e atualiza o post
 */

interface ScriptSegment {
  text: string;
  imagePrompt: string;
  imageUrl?: string;
  imageSource?: "article" | "pexels" | "scrape";
  audioUrl?: string;
  audioDuration?: number;
  brandedImageUrl?: string;
}

// ─── STEP 1: Generate broadcast script ───
async function generateBroadcastScript(
  title: string,
  description: string,
  lovableApiKey: string
): Promise<ScriptSegment[]> {
  console.log("[BRAND-VIDEO] 📝 Gerando roteiro editorial...");
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `Você é roteirista EDITORIAL sênior do Neural Update — perfil de Reels sobre IA e tecnologia. Tese, autoridade, zero clichê. Conteúdo VALIOSO, denso e explicativo (não superficial).

NOTÍCIA:
TÍTULO: ${title}
CONTEXTO: ${description}

ESTRUTURA OBRIGATÓRIA (6 cenas, total ~30-42s — cortes rápidos, editorial, sem imagem parada tempo demais):
1. HOOK (2-3s) — MÁXIMO 8 PALAVRAS. Afirmação polêmica/provocativa. PROIBIDO "Vamos falar", "Você sabia", "Hoje", "Atenção".
   Exemplos: "Isso vai apagar 40% dos empregos.", "O Google acabou de perder a guerra."
2. FATO CONCRETO (4-6s): Nome da empresa/produto + o que aconteceu em 1 frase fechada.
3. COMO FUNCIONA (4-6s): mecanismo técnico simples, sem enrolação.
4. TESE (4-6s): por que isso importa agora.
5. IMPACTO PRÁTICO (4-6s): o que muda para usuário/dev/profissional.
6. CTA FORTE (4-6s): fecha a tese + menciona "Neural Update no blog". PROIBIDO "siga", "curta" genéricos.
   CTAs bons: "Salva antes que apaguem — análise completa no Neural Update.", "Comenta: você usaria? Mais no blog Neural Update."

REGRAS DE REDAÇÃO (CRÍTICO):
- TOM: autoridade editorial densa, ritmo ÁGIL — direto, sem rodeios. Cada segmento entrega INFORMAÇÃO NOVA.
- FRASES COMPLETAS: NUNCA termine uma cena no meio de uma ideia. Cada texto é uma frase fechada com começo, meio e fim.
- CORTE muletas: "basicamente", "então", "vale lembrar", "tipo assim", "de certa forma".
- PT-BR PERFEITO com acentos (você, é, está, já, até, inteligência, decisão, análise)
- 10-14 palavras por segmento (HOOK = máx 8). Nunca passe disso.
- ZERO inglês na narração (exceto nomes próprios: OpenAI, ChatGPT, etc)
- ZERO clichês "futuro já chegou", "revolução da IA", "mudou tudo"
- imagePrompt: cena cinematográfica EM INGLÊS, VERTICAL 9:16, sem texto, com sujeito visual específico do trecho; evite hologramas genéricos quando houver empresa/produto/pessoa/robô/data center.

Responda APENAS JSON válido completo:
{
  "segments": [
    { "text": "narração PT-BR completa", "imagePrompt": "cinematic visual, vertical 9:16, no text" }
  ]
}`
        }],
        response_format: { type: "json_object" },
        max_tokens: 2800,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.segments?.length >= 4) {
          const generated = parsed.segments.slice(0, 6);
          while (generated.length < 6) {
            generated.push({
              text: "A análise completa está no blog Neural Update.",
              imagePrompt: "premium technology editorial newsroom, cinematic vertical 9:16, no text",
            });
          }
          return generated;
        }
      }
    }
  } catch (e) {
    console.warn("[BRAND-VIDEO] Erro no script:", e);
  }

  // Fallback
  const shortTitle = title.length > 40 ? title.substring(0, 40).replace(/\s\S*$/, "") : title;
  return [
    { text: `${shortTitle} virou sinal de alerta no mercado.`, imagePrompt: `technology newsroom, dramatic editorial lighting, vertical 9:16, no text` },
    { text: `A disputa agora é por infraestrutura, dados e distribuição.`, imagePrompt: `modern data center infrastructure, cinematic, vertical 9:16, no text` },
    { text: `Quem controlar essa camada controla a próxima onda da IA.`, imagePrompt: `AI infrastructure control room, realistic, vertical 9:16, no text` },
    { text: `Para profissionais, isso muda custo, acesso e velocidade.`, imagePrompt: `professionals using AI tools, realistic office, vertical 9:16, no text` },
    { text: `O impacto real aparece na rotina, não no hype.`, imagePrompt: `professional workflow with AI tools, cinematic, vertical 9:16, no text` },
    { text: `A análise completa está no blog Neural Update.`, imagePrompt: `premium tech editorial desk, cinematic, vertical 9:16, no text` },
  ];
}

// ─── STEP 2: Buscar IMAGENS REAIS (sem IA) — Pexels + capa do artigo ───
async function fetchRealImages(
  segments: ScriptSegment[],
  title: string,
  description: string,
  articleUrl: string | undefined,
  primaryImageUrl: string | undefined,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  console.log("[BRAND-VIDEO] 📸 Buscando imagens REAIS (Pexels + artigo)...");

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/fetch-real-news-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        title,
        description,
        articleUrl,
        primaryImageUrl,
        count: segments.length,
      }),
    });

    if (!resp.ok) {
      console.warn("[BRAND-VIDEO] fetch-real-news-images falhou:", resp.status);
      return;
    }

    const data = await resp.json();
    const images = data.images || [];

    // Capa (article) abre o vídeo; depois usa imagens únicas e evita repetição consecutiva.
    const seen = new Set<string>();
    const uniqueImages = images.filter((img: any) => {
      if (!img?.url || seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });
    const articleImg = uniqueImages.find((i: any) => i.source === "article");
    const others = uniqueImages.filter((i: any) => i.source !== "article");
    const pool = articleImg ? [articleImg, ...others] : others;
    const ordered: any[] = [];

    if (articleImg) ordered.push(articleImg);
    for (const img of others) {
      if (ordered.length >= segments.length) break;
      ordered.push(img);
    }
    let cursor = articleImg ? 1 : 0;
    while (ordered.length < segments.length && pool.length > 0) {
      const next = pool[cursor % pool.length];
      const previous = ordered[ordered.length - 1];
      cursor++;
      if (pool.length > 1 && previous?.url === next?.url) continue;
      ordered.push(next);
    }

    for (let i = 0; i < segments.length && i < ordered.length; i++) {
      segments[i].imageUrl = ordered[i].url;
      segments[i].imageSource = ordered[i].source;
    }
    console.log(`[BRAND-VIDEO] ✅ ${images.length} imagens reais (article=${images.filter((i:any)=>i.source==='article').length}, pexels=${images.filter((i:any)=>i.source==='pexels').length})`);
  } catch (e) {
    console.warn("[BRAND-VIDEO] Erro ao buscar imagens reais:", e);
  }
}

// ─── STEP 3: Apply Neural Update branding to each image ───
async function brandImage(
  imageUrl: string,
  headline: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<string | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/apply-text-overlay`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        imageUrl,
        title: headline,
        watermarkText: "Neural Update",
        generateHeadline: true,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.publicUrl) {
        console.log("[BRAND-VIDEO] ✅ Imagem brandada");
        return data.publicUrl;
      }
    }
  } catch (e) {
    console.warn("[BRAND-VIDEO] Erro ao brandar imagem:", e);
  }
  return null;
}

// ─── STEP 4: Generate narration audio per segment ───
// Usa lovable-tts (Edge Neural — voz padrão Thalita) com edge-tts (ElevenLabs Sarah) como fallback.
// Antes estava hardcoded em pt-BR-AntonioNeural via edge-tts (que nem respeitava o parâmetro).
async function generateNarration(
  segment: ScriptSegment,
  supabaseUrl: string,
  serviceRoleKey: string,
  voiceId: string = "thalita"
): Promise<void> {
  // 1) Tenta lovable-tts (Edge Neural gratuito, respeita voz)
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/lovable-tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ text: segment.text, voice: voiceId }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.audioUrl || data.audioContent) {
        segment.audioUrl = data.audioUrl || `data:audio/mp3;base64,${data.audioContent}`;
        segment.audioDuration = data.duration || Math.max(3, segment.text.split(/\s+/).length / 2.6);
        console.log(`[BRAND-VIDEO] 🎙️ Narração ${voiceId} (${data.provider || 'edge-neural'}): ${segment.audioDuration.toFixed(1)}s`);
        return;
      }
    }
    console.warn(`[BRAND-VIDEO] lovable-tts ${response.status}, fallback edge-tts`);
  } catch (e) {
    console.warn("[BRAND-VIDEO] lovable-tts erro:", e);
  }

  // 2) Fallback ElevenLabs Sarah via edge-tts
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/edge-tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ text: segment.text }),
    });
    if (response.ok) {
      const data = await response.json();
      segment.audioUrl = data.audioUrl || (data.audioContent ? `data:audio/mp3;base64,${data.audioContent}` : undefined);
      segment.audioDuration = data.duration || Math.max(3, segment.text.split(/\s+/).length / 2.6);
      console.log(`[BRAND-VIDEO] 🎙️ Narração fallback ElevenLabs: ${segment.audioDuration.toFixed(1)}s`);
    }
  } catch (e) {
    console.warn("[BRAND-VIDEO] Erro na narração:", e);
  }
}

// ─── STEP 5: Compose video via Replicate (image-to-video with motion) ───
async function composeVideoViaReplicate(
  segments: ScriptSegment[],
  replicateApiKey: string
): Promise<string | null> {
  console.log("[BRAND-VIDEO] 🎬 Compondo vídeo via Replicate...");
  
  // Use the first branded image to create an animated video
  const mainImage = segments.find(s => s.brandedImageUrl)?.brandedImageUrl 
    || segments.find(s => s.imageUrl)?.imageUrl;
  
  if (!mainImage) {
    console.warn("[BRAND-VIDEO] Sem imagem para Replicate");
    return null;
  }

  try {
    const prediction = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${replicateApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
        input: {
          input_image: mainImage,
          motion_bucket_id: 80,
          fps: 24,
          cond_aug: 0.02,
        },
      }),
    });

    if (!prediction.ok) {
      const err = await prediction.text();
      console.warn("[BRAND-VIDEO] Replicate error:", err.substring(0, 200));
      return null;
    }

    const predData = await prediction.json();
    console.log(`[BRAND-VIDEO] Prediction criada: ${predData.id}`);

    // Poll for completion (max 4 minutes)
    for (let i = 0; i < 48; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predData.id}`, {
        headers: { "Authorization": `Token ${replicateApiKey}` },
      });
      
      if (statusRes.ok) {
        const status = await statusRes.json();
        if (status.status === "succeeded" && status.output) {
          const videoUrl = Array.isArray(status.output) ? status.output[0] : status.output;
          console.log(`[BRAND-VIDEO] ✅ Vídeo renderizado: ${videoUrl}`);
          return videoUrl;
        }
        if (status.status === "failed" || status.status === "canceled") {
          console.warn(`[BRAND-VIDEO] ❌ Replicate ${status.status}:`, status.error);
          return null;
        }
      }
    }
    
    console.warn("[BRAND-VIDEO] ⏰ Timeout Replicate");
    return null;
  } catch (e) {
    console.warn("[BRAND-VIDEO] Erro Replicate:", e);
    return null;
  }
}

// ─── STEP 6: Upload final video to storage ───
async function uploadVideoToStorage(
  videoUrl: string,
  workspaceId: string,
  supabase: any
): Promise<string | null> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return null;
    
    const videoData = new Uint8Array(await response.arrayBuffer());
    const filename = `${workspaceId}/branded-news-${Date.now()}.mp4`;
    
    const { error } = await supabase.storage
      .from("post-videos")
      .upload(filename, videoData, { contentType: "video/mp4", upsert: false });
    
    if (error) {
      console.warn("[BRAND-VIDEO] Upload error:", error);
      return null;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from("post-videos")
      .getPublicUrl(filename);
    
    return publicUrl;
  } catch (e) {
    console.warn("[BRAND-VIDEO] Upload error:", e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { postId, title, description, workspaceId, userId, articleUrl, primaryImageUrl } = await req.json();

    if (!postId || !title) {
      throw new Error("postId e title são obrigatórios");
    }

    console.log(`[BRAND-VIDEO] ═══ PIPELINE NEURAL UPDATE ═══`);
    console.log(`[BRAND-VIDEO] Post: ${postId}`);
    console.log(`[BRAND-VIDEO] Título: ${title.substring(0, 60)}...`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const replicateApiKey = Deno.env.get("REPLICATE_API_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Mark post as rendering
    await supabase.from("posts").update({
      status: "draft",
      error_message: null,
      overlay_metadata: { render_status: "rendering", pipeline: "brand-news-video" },
    }).eq("id", postId);

    // ─── STEP 1: Generate broadcast script ───
    const segments = await generateBroadcastScript(title, description || "", lovableApiKey);
    console.log(`[BRAND-VIDEO] ✅ Script: ${segments.length} segmentos`);

    // ─── STEP 1.5: Revisão PT-BR (acentos, ortografia) em cada segmento ANTES do TTS ───
    for (let i = 0; i < segments.length; i++) {
      try {
        const rev = await fetch(`${supabaseUrl}/functions/v1/review-portuguese`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ text: segments[i].text, context: "narração de Reels editorial sobre tecnologia/IA" }),
        });
        if (rev.ok) {
          const r = await rev.json();
          if (r.corrected && r.corrected !== segments[i].text) {
            console.log(`[BRAND-VIDEO] ✏️  Seg ${i+1} corrigido: "${segments[i].text}" → "${r.corrected}"`);
            segments[i].text = r.corrected;
          }
        }
      } catch (e) {
        console.warn(`[BRAND-VIDEO] review-portuguese seg ${i+1} falhou:`, e);
      }
    }

    // ─── STEP 2: Generate images ───
    await fetchRealImages(segments, title, description || "", articleUrl, primaryImageUrl, supabaseUrl, serviceRoleKey);

    // ─── STEP 3: SEM headline em frames de vídeo (usuário pediu).
    // Mantemos imageUrl cru — o video-encoder cliente adiciona header/watermark da marca.
    // Apenas o thumbnail (image_url) recebe overlay com headline.
    console.log("[BRAND-VIDEO] ⏭️  Pulando overlay de headline nos frames do vídeo.");
    let thumbnailBranded: string | null = null;
    const coverImage = segments.find(s => s.imageUrl)?.imageUrl;
    if (coverImage) {
      thumbnailBranded = await brandImage(coverImage, title, supabaseUrl, serviceRoleKey);
    }

    // ─── STEP 4: Generate narration for each segment ───
    for (const segment of segments) {
      await generateNarration(segment, supabaseUrl, serviceRoleKey);
    }

    const totalDuration = segments.reduce((sum, s) => sum + (s.audioDuration || 5), 0);
    console.log(`[BRAND-VIDEO] Duração total: ${totalDuration}s`);

    // ─── STEP 4.5: Gerar legenda enriquecida (com blog link + CTA) ───
    let enrichedCaption: string | null = null;
    let enrichedHashtags: string[] | null = null;
    try {
      const capRes = await fetch(`${supabaseUrl}/functions/v1/generate-caption`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          topic: `${title}\n\n${description || ""}`.slice(0, 1200),
          postType: "noticia",
          mediaType: "reel",
          sourceUrl: articleUrl || null,
          sourceName: "Atualização Neural",
          customInstructions: "Reels: legenda MÉDIA (500-800 chars), 3 parágrafos, complementa o vídeo (não repete), entrega 1 dado/contexto que o vídeo não disse. OBRIGATÓRIO terminar com '📖 Aprofunda no blog 👉 neural-update.com.br' + '🔔 Segue @neuralupdate' + pergunta provocadora curta. Sem 'arraste pro lado', sem 'assista até o final'.",
        }),
      });
      if (capRes.ok) {
        const capData = await capRes.json();
        enrichedCaption = capData.caption || null;
        enrichedHashtags = capData.hashtags || null;
        console.log(`[BRAND-VIDEO] ✅ Legenda enriquecida: ${enrichedCaption?.length || 0} chars`);
      } else {
        console.warn(`[BRAND-VIDEO] generate-caption falhou: ${capRes.status}`);
      }
    } catch (e) {
      console.warn(`[BRAND-VIDEO] generate-caption erro:`, e);
    }

    // ─── STEP 5: Não usar image-to-video de 1 imagem ───
    // O render profissional precisa de múltiplas cenas, legendas sincronizadas e transições.
    // Replicate aqui animava só a primeira imagem e deixava o Reels com cara de travado.
    let finalVideoUrl: string | null = null;
    if (replicateApiKey) {
      console.log("[BRAND-VIDEO] ⏭️  Replicate ignorado: usando render multi-cena no cliente.");
    }

    // ─── STEP 6: Update post with results ───
    // Frames do vídeo: imagens REAIS sem headline overlay.
    // carousel_images guarda os frames crus (pro client-renderer compor o reel).
    // image_url (thumbnail) usa a versão brandada com headline pra exibição.
    const rawFrames = segments.map(s => s.imageUrl).filter(Boolean) as string[];
    const brandedImages = rawFrames;

    const captionUpdate: any = {};
    if (enrichedCaption) captionUpdate.caption = enrichedCaption;
    if (enrichedHashtags && enrichedHashtags.length) captionUpdate.hashtags = enrichedHashtags;

    if (finalVideoUrl) {
      // Full video composed
      console.log(`[BRAND-VIDEO] ✅ VÍDEO COMPLETO: ${finalVideoUrl}`);
      await supabase.from("posts").update({
        ...captionUpdate,
        video_url: finalVideoUrl,
        image_url: thumbnailBranded || brandedImages[0] || null,
        carousel_images: brandedImages,
        status: "scheduled",
        scheduled_for: getOptimalScheduleTime(),
        overlay_metadata: {
          type: "narrated_video",
          pipeline: "brand-news-video",
          render_status: "completed",
          server_rendered: true,
          rendered_at: new Date().toISOString(),
          topic: title,
          article_url: articleUrl || null,
          script: { title, segments, totalDuration },
          branded_images: brandedImages,
        },
      }).eq("id", postId);

      return new Response(
        JSON.stringify({
          success: true,
          status: "completed",
          videoUrl: finalVideoUrl,
          message: "Vídeo Neural Update renderizado e agendado",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Assets ready, needs client-side composition
      console.log(`[BRAND-VIDEO] ⚡ Assets prontos para composição client-side`);
      await supabase.from("posts").update({
        ...captionUpdate,
        image_url: thumbnailBranded || brandedImages[0] || null,
        carousel_images: brandedImages,
        status: "draft",
        overlay_metadata: {
          type: "narrated_video",
          pipeline: "brand-news-video",
          render_status: "assets_ready",
          topic: title,
          article_url: articleUrl || null,
          is_news_broadcast: true,
          needs_processing: true,
          created_by_agent: true,
          publish_after_render: false,
          script: {
            title,
            segments: segments.map(s => ({
              text: s.text,
              imagePrompt: s.imagePrompt,
              imageUrl: s.brandedImageUrl || s.imageUrl || null,
              audioUrl: s.audioUrl || null,
              duration: s.audioDuration || 5,
            })),
            segmentCount: segments.length,
            totalDuration,
          },
          branded_images: brandedImages,
        },
      }).eq("id", postId);

      return new Response(
        JSON.stringify({
          success: true,
          status: "assets_ready",
          message: `${brandedImages.length} imagens brandadas + ${segments.filter(s => s.audioUrl).length} narrações prontas`,
          segments: segments.length,
          brandedImages: brandedImages.length,
          needsClientRender: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: any) {
    console.error("[BRAND-VIDEO] ❌ Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Erro no pipeline" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getOptimalScheduleTime(): string {
  const now = new Date();
  const brasilOffset = -3;
  const brasilHour = (now.getUTCHours() + brasilOffset + 24) % 24;
  
  const target = new Date(now);
  if (brasilHour >= 20 || brasilHour < 7) {
    target.setUTCDate(target.getUTCDate() + 1);
    target.setUTCHours(10 - brasilOffset, 0, 0, 0);
  } else if (brasilHour < 10) {
    target.setUTCHours(12 - brasilOffset, 0, 0, 0);
  } else {
    target.setTime(target.getTime() + 2 * 60 * 60 * 1000);
  }
  
  return target.toISOString();
}
