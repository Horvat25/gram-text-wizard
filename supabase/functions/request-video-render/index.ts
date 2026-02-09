import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * REQUEST VIDEO RENDER - Orquestrador de Renderização Externa
 * 
 * Arquitetura: Lovable apenas ORQUESTRA, não renderiza.
 * A renderização é feita por um serviço externo com FFmpeg.
 * 
 * Fluxo:
 * 1. Recebe lista de imagens + parâmetros
 * 2. Faz POST para serviço externo de renderização
 * 3. Retorna video_url ou marca como erro
 * 
 * Serviço externo esperado:
 * - Baixa as imagens
 * - Usa FFmpeg para criar slideshow
 * - Aplica transições (fade)
 * - Adiciona música (opcional)
 * - Retorna MP4
 */

interface RenderRequest {
  images: string[];              // URLs das imagens
  duration_per_image?: number;   // Segundos por imagem (default: 3)
  resolution?: string;           // Formato (default: "1080x1920")
  music?: string;                // URL da música ou "default" ou null
  platform?: string;             // "instagram_reels" | "tiktok" | "youtube_shorts"
  transition?: string;           // "fade" | "slide" | "none" (default: "fade")
  post_id?: string;              // ID do post para atualizar
  workspace_id?: string;         // Workspace para contexto
}

interface RenderResponse {
  success: boolean;
  video_url?: string;
  error?: string;
  render_id?: string;
  estimated_duration?: number;
}

// Validar que temos imagens suficientes
function validateRequest(req: RenderRequest): string | null {
  if (!req.images || req.images.length === 0) {
    return "Nenhuma imagem fornecida";
  }
  if (req.images.length < 2) {
    return "Mínimo 2 imagens necessárias para slideshow";
  }
  if (req.images.length > 10) {
    return "Máximo 10 imagens por vídeo";
  }
  
  // Verificar URLs válidas
  for (const img of req.images) {
    try {
      new URL(img);
    } catch {
      return `URL inválida: ${img}`;
    }
  }
  
  return null;
}

// Fazer request para serviço externo
async function requestExternalRender(
  renderServiceUrl: string,
  payload: RenderRequest
): Promise<RenderResponse> {
  console.log("[request-video-render] Calling external service:", renderServiceUrl);
  console.log("[request-video-render] Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(`${renderServiceUrl}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Se o serviço externo precisar de autenticação, adicione aqui
        // "Authorization": `Bearer ${Deno.env.get("RENDER_SERVICE_API_KEY")}`
      },
      body: JSON.stringify({
        images: payload.images,
        duration_per_image: payload.duration_per_image || 3,
        resolution: payload.resolution || "1080x1920",
        music: payload.music || null,
        platform: payload.platform || "instagram_reels",
        transition: payload.transition || "fade",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[request-video-render] External service error:", response.status, errorText);
      return {
        success: false,
        error: `Serviço de renderização retornou erro: ${response.status}`,
      };
    }

    const result = await response.json();
    
    if (result.video_url) {
      console.log("[request-video-render] ✅ Video rendered:", result.video_url);
      return {
        success: true,
        video_url: result.video_url,
        render_id: result.render_id,
        estimated_duration: result.estimated_duration,
      };
    } else if (result.error) {
      return {
        success: false,
        error: result.error,
      };
    } else {
      return {
        success: false,
        error: "Resposta inválida do serviço de renderização",
      };
    }
  } catch (error: any) {
    console.error("[request-video-render] Request failed:", error);
    return {
      success: false,
      error: `Falha ao conectar com serviço: ${error.message}`,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RenderRequest = await req.json();
    
    // Validar request
    const validationError = validateRequest(body);
    if (validationError) {
      return new Response(
        JSON.stringify({ success: false, error: validationError }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Obter URL do serviço de renderização
    const renderServiceUrl = Deno.env.get("RENDER_SERVICE_URL");
    
    if (!renderServiceUrl) {
      console.warn("[request-video-render] RENDER_SERVICE_URL not configured");
      
      // Retornar erro claro - não tentar fallback interno
      return new Response(
        JSON.stringify({
          success: false,
          error: "Serviço de renderização não configurado. Configure RENDER_SERVICE_URL.",
          hint: "O Lovable apenas orquestra. A renderização deve ser feita por serviço externo FFmpeg.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[request-video-render] Processing render request:");
    console.log("  - Images:", body.images.length);
    console.log("  - Duration/image:", body.duration_per_image || 3, "s");
    console.log("  - Resolution:", body.resolution || "1080x1920");
    console.log("  - Platform:", body.platform || "instagram_reels");

    // Chamar serviço externo
    const renderResult = await requestExternalRender(renderServiceUrl, body);

    // Se temos post_id, atualizar o post com o resultado
    if (body.post_id) {
      if (renderResult.success && renderResult.video_url) {
        // Sucesso - atualizar post com video_url
        const { error: updateError } = await supabase
          .from("posts")
          .update({
            video_url: renderResult.video_url,
            status: "draft", // Manter como draft para revisão
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.post_id);

        if (updateError) {
          console.error("[request-video-render] Failed to update post:", updateError);
        } else {
          console.log("[request-video-render] ✅ Post updated with video_url");
        }
      } else {
        // Erro - marcar post com erro
        const { error: updateError } = await supabase
          .from("posts")
          .update({
            status: "draft",
            error_message: `Render failed: ${renderResult.error}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.post_id);

        if (updateError) {
          console.error("[request-video-render] Failed to update post error:", updateError);
        }
      }
    }

    return new Response(
      JSON.stringify(renderResult),
      { 
        status: renderResult.success ? 200 : 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("[request-video-render] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || "Erro interno" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
