import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * TTS Neural Premium - Voz Humana Natural (GRATUITO)
 * 
 * Hierarquia de qualidade:
 * 1. 🥇 Hugging Face - Facebook MMS-TTS (multilingual, neural, muito natural)
 * 2. 🥈 Hugging Face - Suno Bark (expressivo, emocional)
 * 3. 🥉 TikTok TTS (informal, viral)
 * 4. 🔄 Edge TTS Neural (fallback estável)
 */

const HF_API_KEY = Deno.env.get("HF_API_KEY");

const MAX_CHUNK_SIZE = 250;
const TIMEOUT_MS = 25000;

interface TTSRequest {
  text: string;
  voice?: string;
  language?: string;
  style?: "professional" | "casual" | "expressive";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice = "neural", language = "pt-BR", style = "professional" }: TTSRequest = await req.json();

    console.log("[TTS-Premium] ========== INICIADO ==========");
    console.log(`[TTS-Premium] Texto: ${text?.length || 0} chars`);
    console.log(`[TTS-Premium] Estilo: ${style}`);

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ tts_status: "failed", error: "Texto é obrigatório" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedText = prepareTextForTTS(text);
    console.log(`[TTS-Premium] Texto preparado: ${cleanedText.length} chars`);

    let audioData: Uint8Array | null = null;
    let usedProvider = "unknown";
    let voiceUsed = "neural";

    // 🥇 Tentativa 1: Facebook MMS-TTS (Hugging Face) - MUITO NATURAL
    if (HF_API_KEY) {
      try {
        console.log("[TTS-Premium] 🥇 Tentando Facebook MMS-TTS (ultra natural)...");
        audioData = await generateFacebookMMS(cleanedText, HF_API_KEY);
        usedProvider = "Facebook MMS-TTS";
        voiceUsed = "mms-tts-por";
        console.log(`[TTS-Premium] ✅ MMS-TTS sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS-Premium] MMS falhou: ${e.message}`);
        
        // 🥈 Tentativa 2: Bark (Hugging Face) - EXPRESSIVO
        try {
          console.log("[TTS-Premium] 🥈 Tentando Suno Bark (expressivo)...");
          audioData = await generateBarkTTS(cleanedText, HF_API_KEY);
          usedProvider = "Suno Bark";
          voiceUsed = "bark-small";
          console.log(`[TTS-Premium] ✅ Bark sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
        } catch (e2: any) {
          console.warn(`[TTS-Premium] Bark falhou: ${e2.message}`);
        }
      }
    }

    // 🥉 Tentativa 3: TikTok TTS (viral, informal)
    if (!audioData) {
      try {
        console.log("[TTS-Premium] 🥉 Tentando TikTok TTS...");
        audioData = await generateTikTokTTS(cleanedText);
        usedProvider = "TikTok TTS";
        voiceUsed = "br_005";
        console.log(`[TTS-Premium] ✅ TikTok TTS sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS-Premium] TikTok TTS falhou: ${e.message}`);
      }
    }

    // 🔄 Fallback: StreamElements (mais estável que Google)
    if (!audioData) {
      try {
        console.log("[TTS-Premium] 🔄 Fallback StreamElements...");
        audioData = await generateStreamElementsTTS(cleanedText);
        usedProvider = "StreamElements";
        voiceUsed = "Polly.Vitoria";
        console.log(`[TTS-Premium] ✅ StreamElements sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.warn(`[TTS-Premium] StreamElements falhou: ${e.message}`);
      }
    }

    // 🔄 Último fallback: ResponsiveVoice
    if (!audioData) {
      try {
        console.log("[TTS-Premium] 🔄 Último fallback ResponsiveVoice...");
        audioData = await generateResponsiveVoice(cleanedText);
        usedProvider = "ResponsiveVoice";
        voiceUsed = "Brazilian Female";
        console.log(`[TTS-Premium] ✅ ResponsiveVoice sucesso! ${(audioData.length / 1024).toFixed(1)}KB`);
      } catch (e: any) {
        console.error(`[TTS-Premium] ❌ Todos falharam: ${e.message}`);
        return new Response(
          JSON.stringify({ tts_status: "failed", error: "Todos os provedores TTS falharam" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const base64Audio = base64Encode(audioData);
    
    console.log(`[TTS-Premium] ✅ SUCESSO! Provider: ${usedProvider}, Voice: ${voiceUsed}`);
    console.log("[TTS-Premium] ========== FINALIZADO ==========");

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        tts_status: "success",
        model: usedProvider,
        voice: voiceUsed,
        size_kb: (audioData.length / 1024).toFixed(1),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[TTS-Premium] ❌ ERRO:", error.message);
    return new Response(
      JSON.stringify({ tts_status: "failed", error: error.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Prepara texto para TTS neural
 */
function prepareTextForTTS(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F6FF}]/gu, '') // Emojis
    .replace(/[""'']/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/…/g, '...')
    .replace(/[#@]/g, '')
    .replace(/\bR\$/g, 'reais ')
    .replace(/\bUS\$/g, 'dólares ')
    .replace(/(\d+)%/g, '$1 por cento')
    .replace(/(\d+)k/gi, '$1 mil')
    .replace(/(\d+)M/g, '$1 milhões')
    .replace(/(\d+)B/g, '$1 bilhões')
    .trim();
}

/**
 * Split para chunks
 */
function splitChunks(text: string, maxSize: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  
  for (const sentence of sentences) {
    if ((current + " " + sentence).length <= maxSize) {
      current = (current + " " + sentence).trim();
    } else {
      if (current) chunks.push(current);
      current = sentence.length > maxSize 
        ? sentence.substring(0, maxSize) 
        : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * 🥇 Facebook MMS-TTS (Hugging Face) - ULTRA NATURAL
 * Modelo multilíngue treinado em 1000+ idiomas
 */
async function generateFacebookMMS(text: string, apiKey: string): Promise<Uint8Array> {
  const chunks = splitChunks(text, MAX_CHUNK_SIZE);
  const audioBuffers: Uint8Array[] = [];
  
  for (const chunk of chunks) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    try {
      const response = await fetch(
        "https://api-inference.huggingface.co/models/facebook/mms-tts-por",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: chunk }),
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`MMS error ${response.status}: ${errText}`);
      }
      
      const buffer = await response.arrayBuffer();
      audioBuffers.push(new Uint8Array(buffer));
      
      // Pequena pausa entre chunks
      await new Promise(r => setTimeout(r, 200));
      
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
    }
  }
  
  return concatBuffers(audioBuffers);
}

/**
 * 🥈 Suno Bark (Hugging Face) - EXPRESSIVO
 * Modelo neural que captura emoção e entonação
 */
async function generateBarkTTS(text: string, apiKey: string): Promise<Uint8Array> {
  // Bark precisa de texto mais curto
  const shortText = text.length > 200 ? text.substring(0, 200) + "..." : text;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/suno/bark-small",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          inputs: shortText,
        }),
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Bark error ${response.status}: ${errText}`);
    }
    
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
    
  } catch (e: any) {
    clearTimeout(timeoutId);
    throw e;
  }
}

/**
 * 🥉 TikTok TTS - Viral e informal
 */
async function generateTikTokTTS(text: string): Promise<Uint8Array> {
  const chunks = splitChunks(text, 250);
  const audioBuffers: Uint8Array[] = [];
  
  // Vozes brasileiras do TikTok
  const voices = ["br_005", "br_003", "br_004"];
  const voice = voices[0];
  
  for (const chunk of chunks) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      // Usando um proxy público do TikTok TTS
      const response = await fetch("https://tiktok-tts.weilnet.workers.dev/api/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: chunk, voice }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`TikTok TTS error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.data) {
        // Decode base64
        const binaryString = atob(data.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        audioBuffers.push(bytes);
      }
      
      await new Promise(r => setTimeout(r, 100));
      
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
    }
  }
  
  return concatBuffers(audioBuffers);
}

/**
 * 🔄 StreamElements TTS (usa AWS Polly por baixo)
 */
async function generateStreamElementsTTS(text: string): Promise<Uint8Array> {
  const chunks = splitChunks(text, 250);
  const audioBuffers: Uint8Array[] = [];
  
  // Vitória = voz feminina brasileira natural da AWS Polly
  const voice = "Vitoria";
  
  for (const chunk of chunks) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(chunk)}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`StreamElements error: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      audioBuffers.push(new Uint8Array(buffer));
      
      await new Promise(r => setTimeout(r, 150));
      
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
    }
  }
  
  return concatBuffers(audioBuffers);
}

/**
 * 🔄 ResponsiveVoice (último fallback)
 */
async function generateResponsiveVoice(text: string): Promise<Uint8Array> {
  const chunks = splitChunks(text, 200);
  const audioBuffers: Uint8Array[] = [];
  
  for (const chunk of chunks) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const params = new URLSearchParams({
        t: chunk,
        tl: "pt-BR",
        sv: "",
        vn: "",
        pitch: "0.5",
        rate: "0.5",
        vol: "1",
      });
      
      const url = `https://texttospeech.responsivevoice.org/v1/text:synthesize?${params}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`ResponsiveVoice error: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      audioBuffers.push(new Uint8Array(buffer));
      
      await new Promise(r => setTimeout(r, 100));
      
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
    }
  }
  
  return concatBuffers(audioBuffers);
}

/**
 * Concatena buffers de áudio
 */
function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const totalSize = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  
  for (const buffer of buffers) {
    combined.set(buffer, offset);
    offset += buffer.length;
  }
  
  return combined;
}
