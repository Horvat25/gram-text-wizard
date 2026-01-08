import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Lovable TTS - High quality voices via Lovable AI Gateway (FREE)
 * 
 * OpenAI TTS voices available:
 * - alloy: Neutral, balanced
 * - echo: Warm, conversational male
 * - fable: Expressive, storytelling
 * - onyx: Deep, authoritative male
 * - nova: Warm, friendly female
 * - shimmer: Soft, gentle female
 */

// Map our voice IDs to OpenAI TTS voices
const VOICE_MAPPING: Record<string, string> = {
  // Female voices
  "camila": "nova",      // Warm, friendly Brazilian-style
  "vitoria": "shimmer",  // Soft, gentle
  "fernanda": "alloy",   // Neutral, European-style
  // Male voices  
  "thiago": "echo",      // Warm, dynamic
  "ricardo": "onyx",     // Deep, authoritative
  // Fallbacks
  "antonio": "echo",
  "francisca": "nova",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("[LovableTTS] LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { 
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Texto é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map voice to OpenAI voice
    const requestedVoice = voice || "camila";
    const openaiVoice = VOICE_MAPPING[requestedVoice] || "nova";
    
    console.log(`[LovableTTS] Voice mapping: ${requestedVoice} -> ${openaiVoice}`);
    console.log(`[LovableTTS] Text: ${text.substring(0, 60)}...`);

    // Use TTS-1-HD for better quality
    const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1-hd", // HD model for better quality
        input: text,
        voice: openaiVoice,
        response_format: "mp3",
        speed: 1.0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LovableTTS] Error: ${response.status} - ${errorText}`);
      
      return new Response(
        JSON.stringify({ 
          error: `Lovable TTS error: ${response.status}`,
          status: response.status,
        }),
        { 
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = base64Encode(audioBuffer);

    console.log(`[LovableTTS] ✅ Success! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB, Voice: ${openaiVoice}`);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: "mp3",
        voice: requestedVoice,
        openaiVoice: openaiVoice,
        duration_estimate: Math.ceil(text.length / 15),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[LovableTTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar narração" }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
