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
          content: `Você é um roteirista de telejornal de tecnologia para Reels.
Crie um roteiro de narração editorial para um Reel de ~25 segundos sobre esta notícia:

TÍTULO: ${title}
CONTEXTO: ${description}

ESTRUTURA OBRIGATÓRIA (4 cenas):
1. HOOK (3-4s): Frase provocativa de abertura que prende atenção.
2. CONTEXTO (6-8s): O que aconteceu, conciso e direto. Como um âncora de TV.
3. ANÁLISE (6-8s): POR QUE isso é importante. Impacto real. Tese clara.
4. CONCLUSÃO (4-5s): Frase de encerramento forte e provocativa.

REGRAS:
- TOM: Jornalístico editorial, autoridade sem ser robótico
- JAMAIS mencione URLs, links, "clique", "comente", "compartilhe"
- 15-40 palavras por segmento
- PT-BR formal mas acessível
- imagePrompt: cena cinematográfica em inglês, VERTICAL 9:16, sem texto na imagem

Responda em JSON:
{
  "segments": [
    { "text": "narração PT-BR", "imagePrompt": "cinematic visual, vertical 9:16, no text" }
  ]
}`
        }],
        response_format: { type: "json_object" },
        max_tokens: 500,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.segments?.length >= 4) {
          return parsed.segments.slice(0, 4);
        }
      }
    }
  } catch (e) {
    console.warn("[BRAND-VIDEO] Erro no script:", e);
  }

  // Fallback
  const shortTitle = title.length > 40 ? title.substring(0, 40).replace(/\s\S*$/, "") : title;
  return [
    { text: `Atenção: essa notícia muda tudo na tecnologia.`, imagePrompt: `Breaking news technology, dramatic lighting, vertical 9:16` },
    { text: `${shortTitle}. O mercado já sentiu o impacto.`, imagePrompt: `Technology innovation, futuristic interfaces, vertical 9:16` },
    { text: `Milhões de pessoas serão impactadas em breve.`, imagePrompt: `Global impact visualization, dramatic scale, vertical 9:16` },
    { text: `O futuro está sendo escrito agora.`, imagePrompt: `Futuristic cityscape, symbolic, vertical 9:16` },
  ];
}

// ─── STEP 2: Generate images for segments ───
async function generateSegmentImages(
  segments: ScriptSegment[],
  title: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  console.log("[BRAND-VIDEO] 🎨 Gerando imagens para segmentos...");
  
  try {
    const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        topic: title,
        segments: segments.map(s => ({ text: s.text, imagePrompt: s.imagePrompt })),
      }),
    });

    if (searchResponse.ok) {
      const result = await searchResponse.json();
      const images = result.images || [];
      for (let i = 0; i < Math.min(images.length, segments.length); i++) {
        const imgUrl = images[i]?.imageUrl || images[i]?.url;
        if (imgUrl) segments[i].imageUrl = imgUrl;
      }
      console.log(`[BRAND-VIDEO] ✅ ${images.length} imagens geradas`);
    }
  } catch (e) {
    console.warn("[BRAND-VIDEO] Erro nas imagens:", e);
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
async function generateNarration(
  segment: ScriptSegment,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/edge-tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        text: segment.text,
        voice: "pt-BR-AntonioNeural",
        rate: "+5%",
      }),
    });

    if (response.ok) {
      const data = await response.json();
      segment.audioUrl = data.audioUrl;
      segment.audioDuration = data.duration || 5;
      console.log(`[BRAND-VIDEO] 🎙️ Narração: ${segment.audioDuration}s`);
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
    const { postId, title, description, workspaceId, userId, articleUrl } = await req.json();

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

    // ─── STEP 2: Generate images ───
    await generateSegmentImages(segments, title, supabaseUrl, serviceRoleKey);

    // ─── STEP 3: Brand each image with Neural Update style ───
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].imageUrl) {
        const branded = await brandImage(
          segments[i].imageUrl!,
          title,
          supabaseUrl,
          serviceRoleKey
        );
        if (branded) {
          segments[i].brandedImageUrl = branded;
          console.log(`[BRAND-VIDEO] ✅ Segmento ${i + 1} brandado`);
        }
      }
    }

    // ─── STEP 4: Generate narration for each segment ───
    for (const segment of segments) {
      await generateNarration(segment, supabaseUrl, serviceRoleKey);
    }

    const totalDuration = segments.reduce((sum, s) => sum + (s.audioDuration || 5), 0);
    console.log(`[BRAND-VIDEO] Duração total: ${totalDuration}s`);

    // ─── STEP 5: Try server-side video composition ───
    let finalVideoUrl: string | null = null;

    if (replicateApiKey) {
      const replicateVideo = await composeVideoViaReplicate(segments, replicateApiKey);
      if (replicateVideo) {
        finalVideoUrl = await uploadVideoToStorage(replicateVideo, workspaceId, supabase);
      }
    }

    // ─── STEP 6: Update post with results ───
    const brandedImages = segments
      .map(s => s.brandedImageUrl || s.imageUrl)
      .filter(Boolean);

    if (finalVideoUrl) {
      // Full video composed
      console.log(`[BRAND-VIDEO] ✅ VÍDEO COMPLETO: ${finalVideoUrl}`);
      await supabase.from("posts").update({
        video_url: finalVideoUrl,
        image_url: brandedImages[0] || null,
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
        image_url: brandedImages[0] || null,
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
