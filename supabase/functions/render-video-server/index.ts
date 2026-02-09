import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScriptSegment {
  text: string;
  imagePrompt?: string;
  imageUrl?: string;
  duration?: number;
}

interface VideoScript {
  title: string;
  segments: ScriptSegment[];
  totalDuration?: number;
}

// Creatomate template for dynamic video generation
// Alternative: Use Replicate's video-generation models
const CREATOMATE_API = "https://api.creatomate.com/v1/renders";
const REPLICATE_API = "https://api.replicate.com/v1/predictions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const replicateApiKey = Deno.env.get("REPLICATE_API_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { postId, script, workspaceId, userId } = await req.json();
    
    if (!postId || !script) {
      throw new Error("postId e script são obrigatórios");
    }

    console.log(`[RENDER-SERVER] Iniciando renderização do post ${postId}`);

    // STRATEGY 1: Use Lovable AI to generate individual images for each segment
    // Then combine with audio using a simple slideshow approach
    
  const segments: ScriptSegment[] = script.segments || [];
  const renderedSegments: { imageUrl: string; audioUrl?: string; duration: number }[] = [];
  
  // Generate images for each segment - PRIORITY: REAL IMAGES FROM WEB
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    let imageUrl = segment.imageUrl;
    
    // STEP 1: Search for REAL images from the web (ALWAYS TRY FIRST)
    if (!imageUrl && segment.imagePrompt) {
      console.log(`[RENDER-SERVER] Segmento ${i + 1}: buscando imagem REAL da web...`);
      
      try {
        // Search for real images via search-images-for-video
        const searchResponse = await fetch(`${supabaseUrl}/functions/v1/search-images-for-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            query: segment.imagePrompt,
            limit: 5,
          }),
        });

        if (searchResponse.ok) {
          const searchResult = await searchResponse.json();
          if (searchResult.images && searchResult.images.length > 0) {
            // Try each image until one works
            for (const candidateImage of searchResult.images) {
              try {
                // Apply watermark via add-watermark function
                const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceRoleKey}`,
                  },
                  body: JSON.stringify({ 
                    imageUrl: candidateImage,
                    watermarkText: "Neural Update"
                  }),
                });

                if (watermarkResponse.ok) {
                  const watermarkResult = await watermarkResponse.json();
                  imageUrl = watermarkResult.publicUrl;
                  console.log(`[RENDER-SERVER] Segmento ${i + 1}: imagem REAL + watermark ✅`);
                  break;
                }
              } catch (e) {
                console.log(`[RENDER-SERVER] Falha ao processar imagem, tentando próxima...`);
              }
            }
          }
        }
      } catch (e) {
        console.log(`[RENDER-SERVER] Erro na busca de imagem:`, e);
      }
    }

    // STEP 2: FALLBACK - Generate image with AI ONLY if no real image found
    if (!imageUrl && segment.imagePrompt && lovableApiKey) {
      console.log(`[RENDER-SERVER] Segmento ${i + 1}: FALLBACK - gerando com IA (sem imagem real)...`);
      
      try {
        const imgResponse = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            prompt: `${segment.imagePrompt}. Cinematográfico, vertical 9:16, ultra HD. NENHUM TEXTO.`,
            format: "portrait",
            model: "gemini",
          }),
        });

        if (imgResponse.ok) {
          const imgData = await imgResponse.json();
          
          // Apply watermark to AI-generated image too
          if (imgData.imageUrl) {
            const watermarkResponse = await fetch(`${supabaseUrl}/functions/v1/add-watermark`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({ 
                imageUrl: imgData.imageUrl,
                watermarkText: "Neural Update"
              }),
            });

            if (watermarkResponse.ok) {
              const watermarkResult = await watermarkResponse.json();
              imageUrl = watermarkResult.publicUrl;
              console.log(`[RENDER-SERVER] Segmento ${i + 1}: imagem IA + watermark ✅`);
            } else {
              imageUrl = imgData.imageUrl; // Use without watermark as last resort
            }
          }
        }
      } catch (e) {
        console.log(`[RENDER-SERVER] Erro ao gerar imagem IA:`, e);
      }
    }

      // Generate audio narration for segment
      let audioUrl: string | undefined;
      if (segment.text) {
        console.log(`[RENDER-SERVER] Segmento ${i + 1}: gerando narração...`);
        
        try {
          const ttsResponse = await fetch(`${supabaseUrl}/functions/v1/edge-tts`, {
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

          if (ttsResponse.ok) {
            const ttsResult = await ttsResponse.json();
            audioUrl = ttsResult.audioUrl;
            console.log(`[RENDER-SERVER] Segmento ${i + 1}: narração gerada`);
          }
        } catch (e) {
          console.log(`[RENDER-SERVER] Erro ao gerar áudio:`, e);
        }
      }

      renderedSegments.push({
        imageUrl: imageUrl || "",
        audioUrl,
        duration: segment.duration || 4,
      });
    }

    // STRATEGY 2: Use Replicate for video composition (if API key available)
    let finalVideoUrl: string | null = null;

    if (replicateApiKey && renderedSegments.every((s) => s.imageUrl)) {
      console.log(`[RENDER-SERVER] Usando Replicate para composição de vídeo...`);

      try {
        // Use a slideshow model or image-to-video model
        // deforum-art/deforum_stable_diffusion is good for image animations
        // Or use a simpler approach with img2vid models
        
        // For now, we'll create individual video clips and concatenate
        // Using luma/dream-machine or similar for image-to-video
        
        const videoClips: string[] = [];
        
        for (let i = 0; i < Math.min(renderedSegments.length, 4); i++) {
          const segment = renderedSegments[i];
          if (!segment.imageUrl) continue;

          // Create video from image using Replicate
          const prediction = await fetch(REPLICATE_API, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${replicateApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              version: "minimax/video-01", // Fast image-to-video
              input: {
                prompt: segments[i].text || "cinematic motion, Ken Burns effect",
                first_frame_image: segment.imageUrl,
              },
            }),
          });

          if (prediction.ok) {
            const predData = await prediction.json();
            console.log(`[RENDER-SERVER] Clip ${i + 1} iniciado: ${predData.id}`);
            
            // Poll for completion (max 2 minutes per clip)
            let attempts = 0;
            while (attempts < 24) {
              await new Promise((r) => setTimeout(r, 5000));
              
              const statusRes = await fetch(`${REPLICATE_API}/${predData.id}`, {
                headers: { "Authorization": `Bearer ${replicateApiKey}` },
              });
              
              if (statusRes.ok) {
                const status = await statusRes.json();
                if (status.status === "succeeded" && status.output) {
                  videoClips.push(status.output);
                  console.log(`[RENDER-SERVER] Clip ${i + 1} completo`);
                  break;
                } else if (status.status === "failed") {
                  console.error(`[RENDER-SERVER] Clip ${i + 1} falhou:`, status.error);
                  break;
                }
              }
              attempts++;
            }
          }
        }

        // If we got at least one clip, use the first one as the video
        if (videoClips.length > 0) {
          finalVideoUrl = videoClips[0];
          console.log(`[RENDER-SERVER] Vídeo renderizado via Replicate`);
        }
      } catch (e) {
        console.error(`[RENDER-SERVER] Erro Replicate:`, e);
      }
    }

    // STRATEGY 3: If no Replicate, create a simple image slideshow video
    // Store the rendered segments for potential client-side rendering or manual processing
    if (!finalVideoUrl) {
      console.log(`[RENDER-SERVER] Salvando assets para renderização alternativa...`);
      
      // Update post with rendered assets (images + audio)
      await supabase
        .from("posts")
        .update({
          overlay_metadata: {
            ...(script as any),
            segments: segments.map((seg, i) => ({
              ...seg,
              imageUrl: renderedSegments[i]?.imageUrl || seg.imageUrl,
              audioUrl: renderedSegments[i]?.audioUrl,
            })),
            server_rendered_assets: true,
            needs_client_composition: true,
          },
        })
        .eq("id", postId);

      return new Response(
        JSON.stringify({
          success: true,
          status: "assets_ready",
          message: "Imagens e áudios gerados. Composição final pendente.",
          segments: renderedSegments.length,
          needsClientRender: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update post with final video URL
    console.log(`[RENDER-SERVER] Atualizando post ${postId} com vídeo renderizado`);
    
    const { error: updateError } = await supabase
      .from("posts")
      .update({
        video_url: finalVideoUrl,
        status: "scheduled", // Auto-schedule for publication
        scheduled_for: new Date().toISOString(),
        overlay_metadata: {
          ...(script as any),
          server_rendered: true,
          rendered_at: new Date().toISOString(),
        },
      })
      .eq("id", postId);

    if (updateError) {
      throw new Error(`Erro ao atualizar post: ${updateError.message}`);
    }

    console.log(`[RENDER-SERVER] ✅ Post ${postId} renderizado e agendado para publicação`);

    return new Response(
      JSON.stringify({
        success: true,
        status: "completed",
        videoUrl: finalVideoUrl,
        message: "Vídeo renderizado e agendado para publicação",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[RENDER-SERVER] Erro:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Erro ao renderizar vídeo",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
