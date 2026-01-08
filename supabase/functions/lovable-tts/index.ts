import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Microsoft Edge TTS - FREE high-quality neural voices
 * Uses Microsoft's Edge browser TTS service (same as edge-tts Python library)
 * 
 * Portuguese Brazilian voices:
 * - pt-BR-FranciscaNeural (female, warm)
 * - pt-BR-AntonioNeural (male, professional)
 * - pt-BR-ThalitaNeural (female, young)
 * - pt-BR-NicolauNeural (male, casual)
 * - pt-BR-LeticiaNeural (female, expressive)
 * - pt-BR-ManuelaNeural (female, friendly)
 * - pt-BR-ElzaNeural (female, calm)
 * - pt-BR-BrendaNeural (female, cheerful)
 * - pt-BR-DonatoNeural (male, warm)
 * - pt-BR-FabioNeural (male, dynamic)
 * - pt-BR-GiovannaNeural (female, natural)
 * - pt-BR-HumbertoNeural (male, deep)
 * - pt-BR-JulioNeural (male, professional)
 * - pt-BR-LeilaNeural (female, soft)
 * - pt-BR-ValerioNeural (male, confident)
 * - pt-BR-YaraNeural (female, energetic)
 */

// Map our voice IDs to Microsoft Edge neural voices
const VOICE_MAPPING: Record<string, string> = {
  // Female voices - each is DISTINCT
  "camila": "pt-BR-ThalitaNeural",     // Young, energetic
  "vitoria": "pt-BR-LeticiaNeural",    // Expressive, dramatic
  "fernanda": "pt-BR-FranciscaNeural", // Warm, professional
  // Male voices - each is DISTINCT
  "thiago": "pt-BR-FabioNeural",       // Dynamic, engaging
  "ricardo": "pt-BR-HumbertoNeural",   // Deep, authoritative
  // Additional mappings
  "antonio": "pt-BR-AntonioNeural",
  "francisca": "pt-BR-FranciscaNeural",
  "default": "pt-BR-FranciscaNeural",
};

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSSML(text: string, voice: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="pt-BR">
    <voice name="${voice}">
      <prosody rate="0%" pitch="0%">
        ${escapeXml(text)}
      </prosody>
    </voice>
  </speak>`;
}

async function synthesizeSpeech(text: string, voiceName: string): Promise<Uint8Array> {
  const requestId = generateUUID().replace(/-/g, '');
  const timestamp = new Date().toISOString();
  
  // Microsoft Edge TTS WebSocket endpoint
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${requestId}`;
  
  console.log(`[EdgeTTS] Connecting for voice: ${voiceName}`);
  
  return new Promise((resolve, reject) => {
    const audioChunks: Uint8Array[] = [];
    let resolved = false;
    
    const ws = new WebSocket(wsUrl);
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error("WebSocket timeout"));
      }
    }, 30000);
    
    ws.onopen = () => {
      console.log("[EdgeTTS] WebSocket connected");
      
      // Send configuration
      const configMessage = `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`;
      ws.send(configMessage);
      
      // Send SSML
      const ssml = buildSSML(text, voiceName);
      const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMessage);
    };
    
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        // Text message - check for turn.end
        if (event.data.includes('turn.end')) {
          console.log(`[EdgeTTS] Received turn.end, total chunks: ${audioChunks.length}`);
          clearTimeout(timeout);
          ws.close();
          
          if (!resolved) {
            resolved = true;
            // Combine all audio chunks
            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of audioChunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }
            resolve(combined);
          }
        }
      } else if (event.data instanceof Blob) {
        // Binary audio data
        event.data.arrayBuffer().then((buffer) => {
          const data = new Uint8Array(buffer);
          // Audio data starts after the header "Path:audio\r\n"
          const headerEnd = findHeaderEnd(data);
          if (headerEnd !== -1) {
            const audioData = data.slice(headerEnd);
            if (audioData.length > 0) {
              audioChunks.push(audioData);
            }
          }
        });
      }
    };
    
    ws.onerror = (error) => {
      console.error("[EdgeTTS] WebSocket error:", error);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(new Error("WebSocket error"));
      }
    };
    
    ws.onclose = () => {
      console.log("[EdgeTTS] WebSocket closed");
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        // Return whatever we have
        const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        if (totalLength > 0) {
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of audioChunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(combined);
        } else {
          reject(new Error("No audio data received"));
        }
      }
    };
  });
}

function findHeaderEnd(data: Uint8Array): number {
  // Look for "Path:audio\r\n" followed by binary data
  const pathAudio = new TextEncoder().encode("Path:audio\r\n");
  for (let i = 0; i < data.length - pathAudio.length; i++) {
    let match = true;
    for (let j = 0; j < pathAudio.length; j++) {
      if (data[i + j] !== pathAudio[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i + pathAudio.length;
    }
  }
  return -1;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice } = await req.json();

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Texto é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map voice to Microsoft Edge neural voice
    const requestedVoice = voice || "camila";
    const edgeVoice = VOICE_MAPPING[requestedVoice] || VOICE_MAPPING["default"];
    
    console.log(`[EdgeTTS] Voice: ${requestedVoice} -> ${edgeVoice}`);
    console.log(`[EdgeTTS] Text: ${text.substring(0, 60)}...`);

    // Synthesize speech using Microsoft Edge TTS
    const audioData = await synthesizeSpeech(text, edgeVoice);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < audioData.length; i++) {
      binary += String.fromCharCode(audioData[i]);
    }
    const base64Audio = btoa(binary);

    console.log(`[EdgeTTS] ✅ Success! Size: ${(audioData.length / 1024).toFixed(1)}KB, Voice: ${edgeVoice}`);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: "mp3",
        voice: requestedVoice,
        edgeVoice: edgeVoice,
        duration_estimate: Math.ceil(text.length / 15),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[EdgeTTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro ao gerar narração" }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
