/**
 * WebM to MP4 converter using FFmpeg.wasm
 * Converts videos in the browser for Instagram compatibility
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg | null = null;
let isLoaded = false;
let loadingPromise: Promise<void> | null = null;

/**
 * Initialize FFmpeg.wasm (loads ~31MB core)
 * OPTIMIZED: Singleton pattern prevents multiple loads, caches globally
 */
export async function initFFmpeg(
  onProgress?: (message: string) => void
): Promise<void> {
  // Already loaded - instant return
  if (isLoaded && ffmpeg) {
    console.log("[FFmpeg] Already loaded - reusing instance");
    return;
  }
  
  // Loading in progress - wait for existing promise
  if (loadingPromise) {
    console.log("[FFmpeg] Loading in progress - waiting for existing promise");
    await loadingPromise;
    return;
  }

  // Start new load
  loadingPromise = (async () => {
    ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      // Only log important messages to reduce noise
      if (message.includes("error") || message.includes("Error")) {
        console.log("[FFmpeg]", message);
      }
    });

    ffmpeg.on("progress", ({ progress }) => {
      onProgress?.(`Convertendo: ${Math.round(progress * 100)}%`);
    });

    try {
      onProgress?.("Baixando FFmpeg...");
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      
      onProgress?.("Carregando núcleo FFmpeg...");
      
      // Parallel fetch for faster loading
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      ]);
      
      onProgress?.("Inicializando FFmpeg...");
      
      await ffmpeg.load({
        coreURL,
        wasmURL,
      });

      isLoaded = true;
      onProgress?.("FFmpeg pronto!");
      console.log("[FFmpeg] Loaded successfully - cached for session");
    } catch (error) {
      console.error("[FFmpeg] Failed to load:", error);
      ffmpeg = null;
      isLoaded = false;
      loadingPromise = null;
      throw new Error("Não foi possível carregar o conversor de vídeo");
    }
  })();
  
  await loadingPromise;
}

/**
 * Convert WebM blob to MP4
 */
export async function convertWebMToMP4(
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  if (!ffmpeg || !isLoaded) {
    await initFFmpeg();
  }

  if (!ffmpeg) {
    throw new Error("FFmpeg não inicializado");
  }

  try {
    // Write input file
    const inputData = await fetchFile(webmBlob);
    await ffmpeg.writeFile("input.webm", inputData);

    // Set up progress tracking
    ffmpeg.on("progress", ({ progress }) => {
      onProgress?.(Math.round(progress * 100));
    });

    // Convert to MP4 with H.264 codec (Instagram compatible)
    await ffmpeg.exec([
      "-i", "input.webm",
      "-c:v", "libx264",      // H.264 video codec
      "-preset", "fast",      // Faster encoding
      "-crf", "23",           // Good quality (lower = better, 18-28 range)
      "-c:a", "aac",          // AAC audio codec
      "-b:a", "128k",         // Audio bitrate
      "-movflags", "+faststart", // Enable fast start for web
      "-pix_fmt", "yuv420p",  // Pixel format for compatibility
      "output.mp4"
    ]);

    // Read output file
    const data = await ffmpeg.readFile("output.mp4");
    // Handle both Uint8Array and string response types
    let mp4Blob: Blob;
    if (typeof data === 'string') {
      // If string, it's base64 encoded
      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      mp4Blob = new Blob([bytes], { type: "video/mp4" });
    } else {
      // It's a Uint8Array - copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
      const buffer = new ArrayBuffer(data.byteLength);
      new Uint8Array(buffer).set(data);
      mp4Blob = new Blob([buffer], { type: "video/mp4" });
    }

    // Cleanup
    await ffmpeg.deleteFile("input.webm");
    await ffmpeg.deleteFile("output.mp4");

    return mp4Blob;
  } catch (error: any) {
    console.error("FFmpeg conversion error:", error);
    throw new Error(`Erro na conversão: ${error.message}`);
  }
}

/**
 * Check if FFmpeg is loaded
 */
export function isFFmpegLoaded(): boolean {
  return isLoaded;
}

/**
 * Cleanup FFmpeg resources
 */
export function cleanupFFmpeg(): void {
  if (ffmpeg) {
    ffmpeg = null;
    isLoaded = false;
  }
}
