import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Text-to-Speech using multiple Hugging Face models with intelligent fallback
 * 
 * Priority:
 * 1. Parler-TTS Mini (Natural, expressive - works best!)
 * 2. Microsoft SpeechT5 (Good quality, multilingual)
 * 3. ESPnet VITS (Fast, decent quality)
 * 4. Fallback flag for client to use browser TTS
 */

// Hugging Face Inference API v2 endpoints
const HF_ENDPOINTS = {
  parler: "https://router.huggingface.co/hf-inference/models/parler-tts/parler-tts-mini-multilingual-v1.1",
  speechT5: "https://router.huggingface.co/hf-inference/models/microsoft/speecht5_tts",
  vits: "https://router.huggingface.co/hf-inference/models/facebook/mms-tts-por",
  // Alternative endpoints
  parlerLarge: "https://router.huggingface.co/hf-inference/models/parler-tts/parler-tts-large-v1",
  espnet: "https://router.huggingface.co/hf-inference/models/espnet/kan-bayashi_ljspeech_vits",
};

// Voice descriptions for Parler-TTS (natural language)
const PARLER_VOICES: Record<string, string> = {
  "camila": "A female speaker with a warm, professional voice delivers the news in Brazilian Portuguese with clear enunciation and moderate pace.",
  "vitoria": "A young female speaker with an enthusiastic, engaging voice speaks in Brazilian Portuguese with energy and warmth.",
  "francisca": "A mature female speaker with a calm, authoritative voice narrates in Portuguese with clarity and confidence.",
  "antonio": "A male speaker with a deep, professional voice delivers news in Brazilian Portuguese with authority and clarity.",
  "ricardo": "A young male speaker with an energetic, modern voice speaks in Portuguese with enthusiasm.",
  "thiago": "A male speaker with a friendly, conversational tone narrates in Brazilian Portuguese naturally.",
  "default": "A professional speaker with a clear, warm voice delivers content in Brazilian Portuguese with good pacing.",
};

interface BarkRequest {
  text: string;
  voice?: string;
  language?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice, language }: BarkRequest = await req.json();
    const HF_API_KEY = Deno.env.get("HF_API_KEY") || Deno.env.get("HUGGINGFACE_API_KEY");

    if (!HF_API_KEY) {
      console.error("[Bark TTS] Hugging Face API Key not configured");
      return new Response(
        JSON.stringify({ 
          error: "HF_API_KEY não configurada",
          fallback: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Texto é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const voiceKey = voice?.toLowerCase() || "default";
    const voiceDescription = PARLER_VOICES[voiceKey] || PARLER_VOICES["default"];
    
    console.log(`[Bark TTS] Voice: ${voiceKey}`);
    console.log(`[Bark TTS] Text length: ${text.length} chars`);
    console.log(`[Bark TTS] Text preview: "${text.substring(0, 100)}..."`);

    // Optimize text for TTS
    const optimizedText = optimizeTextForTTS(text);
    console.log(`[Bark TTS] Optimized text length: ${optimizedText.length} chars`);

    let audioBuffer: ArrayBuffer | null = null;
    let usedModel = "unknown";
    
    // Try Parler-TTS first (best quality for narration)
    try {
      console.log("[Bark TTS] Trying Parler-TTS Mini Multilingual...");
      audioBuffer = await callParlerTTS(HF_API_KEY, optimizedText, voiceDescription);
      usedModel = "parler-tts";
    } catch (e: any) {
      console.warn(`[Bark TTS] Parler failed: ${e.message}`);
      
      // Try Microsoft SpeechT5
      try {
        console.log("[Bark TTS] Trying Microsoft SpeechT5...");
        audioBuffer = await callSpeechT5(HF_API_KEY, optimizedText);
        usedModel = "speecht5";
      } catch (e2: any) {
        console.warn(`[Bark TTS] SpeechT5 failed: ${e2.message}`);
        
        // Try Facebook MMS-TTS
        try {
          console.log("[Bark TTS] Trying Facebook MMS-TTS...");
          audioBuffer = await callMMSTTS(HF_API_KEY, optimizedText);
          usedModel = "mms-tts";
        } catch (e3: any) {
          console.warn(`[Bark TTS] MMS-TTS failed: ${e3.message}`);
          
          // Return fallback flag
          console.log("[Bark TTS] All models failed, returning fallback");
          return new Response(
            JSON.stringify({ 
              error: "Todos os modelos TTS falharam",
              fallback: true,
              isLoading: false,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error("No audio data generated");
    }

    const base64Audio = base64Encode(audioBuffer);
    console.log(`[Bark TTS] ✅ Success with ${usedModel}! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "wav",
        voice: voiceKey,
        model: usedModel,
        duration_estimate: Math.ceil(text.length / 12),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Bark TTS] Error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao gerar narração",
        fallback: true,
        isLoading: false,
      }),
      { 
        status: 200, // Return 200 so client can fallback gracefully
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

/**
 * Optimize text for TTS
 */
function optimizeTextForTTS(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([.!?])\s*/g, '$1 ')
    .replace(/[.!?]{2,}/g, '.')
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
    .replace(/[""'']/g, '"')
    .replace(/,\s*/g, ', ')
    .trim();
}

/**
 * Call Parler-TTS API (Natural language voice descriptions)
 */
async function callParlerTTS(
  apiKey: string, 
  text: string, 
  voiceDescription: string
): Promise<ArrayBuffer> {
  const response = await fetch(HF_ENDPOINTS.parler, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: text,
      parameters: {
        description: voiceDescription,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Bark TTS] Parler error: ${response.status} - ${errorText}`);
    throw new Error(`Parler error: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    if (json.error) throw new Error(json.error);
    throw new Error("Unexpected JSON response");
  }

  return await response.arrayBuffer();
}

/**
 * Call Microsoft SpeechT5 API
 */
async function callSpeechT5(apiKey: string, text: string): Promise<ArrayBuffer> {
  const response = await fetch(HF_ENDPOINTS.speechT5, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Bark TTS] SpeechT5 error: ${response.status} - ${errorText}`);
    throw new Error(`SpeechT5 error: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    if (json.error) throw new Error(json.error);
    throw new Error("Unexpected JSON response");
  }

  return await response.arrayBuffer();
}

/**
 * Call Facebook MMS-TTS API (Portuguese)
 */
async function callMMSTTS(apiKey: string, text: string): Promise<ArrayBuffer> {
  const response = await fetch(HF_ENDPOINTS.vits, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Bark TTS] MMS-TTS error: ${response.status} - ${errorText}`);
    throw new Error(`MMS-TTS error: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    if (json.error) throw new Error(json.error);
    throw new Error("Unexpected JSON response");
  }

  return await response.arrayBuffer();
}
