import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Text-to-Speech using Bark (Suno) via Hugging Face Inference API
 * 
 * Bark is a multilingual TTS model that produces natural, human-like speech.
 * Free tier: ~1000 requests/month (can have queue delays)
 * 
 * Best practices for Bark:
 * - Short sentences (2-3 per segment)
 * - Clear, direct language
 * - Portuguese (pt-BR) supported natively
 */

const HF_API_URL = "https://api-inference.huggingface.co/models/suno/bark";
const HF_BARK_SMALL_URL = "https://api-inference.huggingface.co/models/suno/bark-small";

// Bark voice presets for Portuguese
const VOICE_PRESETS: Record<string, string> = {
  // Portuguese speakers (neutral news-style)
  "camila": "v2/pt_speaker_1",  // Female, neutral
  "vitoria": "v2/pt_speaker_2", // Female, warm
  "ricardo": "v2/pt_speaker_3", // Male, authoritative
  "thiago": "v2/pt_speaker_4",  // Male, neutral
  // English fallbacks
  "brian": "v2/en_speaker_0",
  "joanna": "v2/en_speaker_1",
  // Default
  "default": "v2/pt_speaker_1",
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

    // Get voice preset
    const voiceKey = voice?.toLowerCase() || "default";
    const voicePreset = VOICE_PRESETS[voiceKey] || VOICE_PRESETS["default"];
    
    console.log(`[Bark TTS] Voice: ${voiceKey} -> Preset: ${voicePreset}`);
    console.log(`[Bark TTS] Text length: ${text.length} chars`);
    console.log(`[Bark TTS] Text preview: "${text.substring(0, 100)}..."`);

    // Prepare text for Bark (optimize for news narration)
    // Bark works best with shorter segments and clear punctuation
    const optimizedText = optimizeTextForBark(text);
    console.log(`[Bark TTS] Optimized text length: ${optimizedText.length} chars`);

    // Try Bark full model first, then bark-small as fallback
    let audioBuffer: ArrayBuffer | null = null;
    let usedModel = "bark";
    
    try {
      audioBuffer = await callBarkAPI(HF_API_KEY, HF_API_URL, optimizedText, voicePreset);
    } catch (e: any) {
      console.warn(`[Bark TTS] Full model failed: ${e.message}, trying bark-small...`);
      try {
        audioBuffer = await callBarkAPI(HF_API_KEY, HF_BARK_SMALL_URL, optimizedText, voicePreset);
        usedModel = "bark-small";
      } catch (e2: any) {
        console.error(`[Bark TTS] Both models failed:`, e2);
        throw e2;
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
        format: "wav", // Bark outputs WAV
        voice: voiceKey,
        model: usedModel,
        duration_estimate: Math.ceil(text.length / 12),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[Bark TTS] Error:", error);
    
    // Check if it's a queue/loading error (common with free tier)
    const isLoading = error.message?.includes("loading") || error.message?.includes("queue");
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao gerar narração",
        fallback: true,
        isLoading,
      }),
      { 
        status: 200, // Return 200 so client can fallback gracefully
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

/**
 * Optimize text for Bark TTS
 * - Short sentences
 * - Clear punctuation
 * - Remove special characters that confuse the model
 */
function optimizeTextForBark(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Ensure proper sentence endings
    .replace(/([.!?])\s*/g, '$1 ')
    // Remove multiple punctuation
    .replace(/[.!?]{2,}/g, '.')
    // Remove emojis and special chars
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '')
    .replace(/[""'']/g, '"')
    // Add pauses after commas for better rhythm
    .replace(/,\s*/g, ', ')
    .trim();
}

/**
 * Call Hugging Face Bark API
 */
async function callBarkAPI(
  apiKey: string, 
  apiUrl: string, 
  text: string, 
  voicePreset: string
): Promise<ArrayBuffer> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: text,
      parameters: {
        voice_preset: voicePreset,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Bark TTS] API Error: ${response.status} - ${errorText}`);
    
    // Check for common Hugging Face errors
    if (response.status === 503) {
      throw new Error("Model is loading, please retry in a few seconds");
    }
    if (response.status === 429) {
      throw new Error("Rate limit exceeded, please retry later");
    }
    
    throw new Error(`Bark API error: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  
  // Check if response is JSON (error) instead of audio
  if (contentType.includes("application/json")) {
    const jsonResponse = await response.json();
    if (jsonResponse.error) {
      throw new Error(jsonResponse.error);
    }
    throw new Error("Unexpected JSON response from Bark API");
  }

  return await response.arrayBuffer();
}
