import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Music Generation using MusicGen (Meta) via Hugging Face Inference API
 * 
 * MusicGen generates high-quality instrumental music from text prompts.
 * Free tier: ~1000 requests/month (can have queue delays)
 * 
 * Generates music for:
 * - Breaking news: tension, serious, low bpm
 * - Technology: futuristic, electronic, minimal
 * - Analysis: neutral, professional, ambient
 */

// Updated to new Hugging Face router endpoint (api-inference is deprecated)
const HF_API_URL = "https://router.huggingface.co/hf-inference/models/facebook/musicgen-small";
const HF_MUSICGEN_MEDIUM_URL = "https://router.huggingface.co/hf-inference/models/facebook/musicgen-medium";

// Prompt templates for different content types
const MOOD_PROMPTS: Record<string, string> = {
  "breaking": "breaking news tension dramatic orchestral low bpm serious urgent",
  "technology": "futuristic electronic ambient synth pads minimal technology corporate 90bpm",
  "politics": "political analysis serious neutral ambient piano subtle tension",
  "economy": "financial corporate professional ambient electronic minimal clean",
  "science": "discovery wonder ambient electronic spacey futuristic optimistic",
  "sports": "energetic upbeat dynamic drums electronic action fast tempo",
  "entertainment": "upbeat fun modern pop electronic catchy positive",
  "neutral": "ambient tech background subtle synth pads clean minimal 80bpm",
  "default": "ambient background music subtle electronic minimal professional 80bpm",
};

interface MusicGenRequest {
  prompt?: string;
  mood?: string;
  duration?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, mood, duration }: MusicGenRequest = await req.json();
    const HF_API_KEY = Deno.env.get("HF_API_KEY") || Deno.env.get("HUGGINGFACE_API_KEY");

    if (!HF_API_KEY) {
      console.error("[MusicGen] Hugging Face API Key not configured");
      return new Response(
        JSON.stringify({ 
          error: "HF_API_KEY não configurada",
          fallback: true,
          audioContent: null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build prompt from mood or use custom prompt
    const moodKey = mood?.toLowerCase() || "default";
    const basePrompt = MOOD_PROMPTS[moodKey] || MOOD_PROMPTS["default"];
    const finalPrompt = prompt || basePrompt;
    
    // Duration in seconds (MusicGen supports up to 30s)
    const musicDuration = Math.min(duration || 15, 30);
    
    console.log(`[MusicGen] Mood: ${moodKey}`);
    console.log(`[MusicGen] Prompt: "${finalPrompt}"`);
    console.log(`[MusicGen] Duration: ${musicDuration}s`);

    // Try medium model first, then small as fallback
    let audioBuffer: ArrayBuffer | null = null;
    let usedModel = "musicgen-medium";
    
    try {
      audioBuffer = await callMusicGenAPI(HF_API_KEY, HF_MUSICGEN_MEDIUM_URL, finalPrompt, musicDuration);
    } catch (e: any) {
      console.warn(`[MusicGen] Medium model failed: ${e.message}, trying musicgen-small...`);
      try {
        audioBuffer = await callMusicGenAPI(HF_API_KEY, HF_API_URL, finalPrompt, musicDuration);
        usedModel = "musicgen-small";
      } catch (e2: any) {
        console.error(`[MusicGen] Both models failed:`, e2);
        throw e2;
      }
    }

    if (!audioBuffer || audioBuffer.byteLength === 0) {
      throw new Error("No audio data generated");
    }

    const base64Audio = base64Encode(audioBuffer);
    console.log(`[MusicGen] ✅ Success with ${usedModel}! Size: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "wav", // MusicGen outputs WAV
        mood: moodKey,
        model: usedModel,
        duration: musicDuration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[MusicGen] Error:", error);
    
    // Check if it's a queue/loading error (common with free tier)
    const isLoading = error.message?.includes("loading") || error.message?.includes("queue");
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao gerar música",
        fallback: true,
        audioContent: null,
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
 * Call Hugging Face MusicGen API
 */
async function callMusicGenAPI(
  apiKey: string, 
  apiUrl: string, 
  prompt: string,
  durationSeconds: number
): Promise<ArrayBuffer> {
  // Add random seed for variety
  const seed = Math.floor(Math.random() * 1000000);
  
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: Math.ceil(durationSeconds * 50), // ~50 tokens per second
        do_sample: true,
        temperature: 1.0,
        seed: seed,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[MusicGen] API Error: ${response.status} - ${errorText}`);
    
    // Check for common Hugging Face errors
    if (response.status === 503) {
      throw new Error("Model is loading, please retry in a few seconds");
    }
    if (response.status === 429) {
      throw new Error("Rate limit exceeded, please retry later");
    }
    
    throw new Error(`MusicGen API error: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  
  // Check if response is JSON (error) instead of audio
  if (contentType.includes("application/json")) {
    const jsonResponse = await response.json();
    if (jsonResponse.error) {
      throw new Error(jsonResponse.error);
    }
    throw new Error("Unexpected JSON response from MusicGen API");
  }

  return await response.arrayBuffer();
}
