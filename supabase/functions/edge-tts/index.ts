import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Microsoft Edge TTS - FREE with high-quality neural voices!
 * Uses the same technology as Microsoft Edge's "Read Aloud" feature.
 * No API key required.
 * 
 * Supports many Portuguese voices:
 * - pt-BR-FranciscaNeural (female, warm)
 * - pt-BR-AntonioNeural (male, professional)
 * - pt-BR-ThalitaNeural (female, young)
 * - pt-BR-BrendaNeural (female, friendly)
 */

interface VoiceConfig {
  name: string;
  lang: string;
  gender: string;
}

const VOICES: Record<string, VoiceConfig> = {
  // Brazilian Portuguese - Neural voices
  "francisca": { name: "pt-BR-FranciscaNeural", lang: "pt-BR", gender: "Female" },
  "antonio": { name: "pt-BR-AntonioNeural", lang: "pt-BR", gender: "Male" },
  "thalita": { name: "pt-BR-ThalitaNeural", lang: "pt-BR", gender: "Female" },
  "brenda": { name: "pt-BR-BrendaNeural", lang: "pt-BR", gender: "Female" },
  // European Portuguese
  "fernanda": { name: "pt-PT-FernandaNeural", lang: "pt-PT", gender: "Female" },
  "duarte": { name: "pt-PT-DuarteNeural", lang: "pt-PT", gender: "Male" },
  // English
  "jenny": { name: "en-US-JennyNeural", lang: "en-US", gender: "Female" },
  "guy": { name: "en-US-GuyNeural", lang: "en-US", gender: "Male" },
};

// Default voice - Francisca is great for content
const DEFAULT_VOICE = "antonio"; // Male, professional voice

/**
 * Generate SSML for Edge TTS
 */
function generateSSML(text: string, voice: VoiceConfig, rate: number = 1.0, pitch: number = 0): string {
  // Rate: 0.5 to 2.0, Pitch: -50 to +50
  const ratePercent = Math.round((rate - 1) * 100);
  const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
  const pitchStr = pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`;
  
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${voice.lang}">
    <voice name="${voice.name}">
      <prosody rate="${rateStr}" pitch="${pitchStr}">
        ${escapeXML(text)}
      </prosody>
    </voice>
  </speak>`;
}

function escapeXML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Get Edge TTS token for authentication
 */
async function getEdgeToken(): Promise<{ token: string; region: string }> {
  const tokenUrl = "https://azure.microsoft.com/en-us/services/cognitive-services/text-to-speech/";
  
  // Use the free Edge endpoint that doesn't require authentication
  // This mimics what Edge browser does internally
  const response = await fetch(
    "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0",
    {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      },
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to get Edge token");
  }
  
  // Alternative: use the WebSocket approach
  return { token: "", region: "eastus" };
}

/**
 * Generate speech using Edge TTS WebSocket
 */
async function generateEdgeTTS(text: string, voiceKey: string = DEFAULT_VOICE, rate: number = 1.0): Promise<Uint8Array> {
  const voice = VOICES[voiceKey] || VOICES[DEFAULT_VOICE];
  
  console.log(`[EdgeTTS] Generating with voice: ${voice.name}`);
  console.log(`[EdgeTTS] Text length: ${text.length} chars`);
  
  // Edge TTS WebSocket endpoint (free, no auth required)
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${generateUUID()}`;
  
  return new Promise((resolve, reject) => {
    const audioChunks: Uint8Array[] = [];
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("EdgeTTS timeout"));
      }
    }, 60000); // 60 second timeout
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log("[EdgeTTS] WebSocket connected");
        
        // Send configuration
        const configMessage = `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`;
        ws.send(configMessage);
        
        // Send SSML request
        const ssml = generateSSML(text, voice, rate);
        const requestId = generateUUID();
        const ssmlMessage = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMessage);
      };
      
      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          // Text message (metadata, turn.end, etc)
          if (event.data.includes("Path:turn.end")) {
            console.log("[EdgeTTS] Turn ended, closing connection");
            ws.close();
          }
        } else if (event.data instanceof Blob) {
          // Binary audio data
          event.data.arrayBuffer().then((buffer) => {
            // Audio data starts after the header (separated by double CRLF)
            const data = new Uint8Array(buffer);
            const headerEnd = findHeaderEnd(data);
            if (headerEnd > 0) {
              const audioData = data.slice(headerEnd);
              if (audioData.length > 0) {
                audioChunks.push(audioData);
              }
            }
          });
        }
      };
      
      ws.onclose = () => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          console.log(`[EdgeTTS] Connection closed, chunks: ${audioChunks.length}`);
          
          // Concatenate all audio chunks
          const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const result = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of audioChunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }
          
          resolve(result);
        }
      };
      
      ws.onerror = (error) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          console.error("[EdgeTTS] WebSocket error:", error);
          reject(new Error("EdgeTTS WebSocket error"));
        }
      };
      
    } catch (error) {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject(error);
      }
    }
  });
}

/**
 * Find the end of the header in binary message
 */
function findHeaderEnd(data: Uint8Array): number {
  // Look for double CRLF (header/body separator)
  for (let i = 0; i < data.length - 3; i++) {
    if (data[i] === 0x0D && data[i + 1] === 0x0A && data[i + 2] === 0x0D && data[i + 3] === 0x0A) {
      return i + 4;
    }
  }
  // Look for "Path:audio" header
  const pathAudio = new TextEncoder().encode("Path:audio");
  for (let i = 0; i < data.length - pathAudio.length; i++) {
    let found = true;
    for (let j = 0; j < pathAudio.length; j++) {
      if (data[i + j] !== pathAudio[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      // Find the next CRLF after "Path:audio"
      for (let k = i + pathAudio.length; k < data.length - 1; k++) {
        if (data[k] === 0x0D && data[k + 1] === 0x0A) {
          return k + 2;
        }
      }
    }
  }
  return -1;
}

/**
 * Generate UUID for requests
 */
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }).replace(/-/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice, rate } = await req.json();

    if (!text || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[EdgeTTS] Request: ${text.substring(0, 80)}...`);
    console.log(`[EdgeTTS] Voice: ${voice || DEFAULT_VOICE}, Rate: ${rate || 1.0}`);

    // Generate audio using Edge TTS
    const audioData = await generateEdgeTTS(text, voice || DEFAULT_VOICE, rate || 1.0);
    
    if (audioData.length === 0) {
      throw new Error("No audio data generated");
    }
    
    // Encode to base64 - convert to ArrayBuffer explicitly
    const base64Audio = base64Encode(new Uint8Array(audioData).buffer as ArrayBuffer);
    
    console.log(`[EdgeTTS] Success! Size: ${(audioData.length / 1024).toFixed(1)}KB`);

    return new Response(
      JSON.stringify({
        audioContent: base64Audio,
        format: "mp3",
        voice: voice || DEFAULT_VOICE,
        duration_estimate: Math.ceil(text.length / 14), // ~14 chars per second
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[EdgeTTS] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate audio" }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
