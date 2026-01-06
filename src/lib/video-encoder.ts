/**
 * Browser-based video encoder using Canvas + MediaRecorder
 * Creates real video files from images and audio
 * OPTIMIZED: Uses requestAnimationFrame for smoother rendering
 */

interface VideoSegment {
  imageUrl: string;
  duration: number; // in seconds
  text?: string;
}

interface VideoEncoderOptions {
  width?: number;
  height?: number;
  fps?: number;
  audioUrl?: string;
  segments: VideoSegment[];
  onProgress?: (progress: number) => void;
}

/**
 * Load an image and return it as HTMLImageElement with retry logic
 */
async function loadImage(url: string, retries = 3): Promise<HTMLImageElement> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        
        const timeout = setTimeout(() => {
          reject(new Error(`Image load timeout: ${url}`));
        }, 15000);
        
        image.onload = () => {
          clearTimeout(timeout);
          resolve(image);
        };
        image.onerror = () => {
          clearTimeout(timeout);
          reject(new Error(`Failed to load image: ${url}`));
        };
        image.src = url;
      });
      return img;
    } catch (error) {
      console.warn(`Image load attempt ${attempt}/${retries} failed:`, error);
      if (attempt === retries) {
        throw error;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`Failed to load image after ${retries} attempts: ${url}`);
}

/**
 * Draw image on canvas with cover fit
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number
) {
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;
  
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;
  
  if (imgRatio > canvasRatio) {
    drawWidth = height * imgRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawHeight = width / imgRatio;
    offsetY = (height - drawHeight) / 2;
  }
  
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

/**
 * Apply Ken Burns effect (subtle zoom/pan)
 */
function applyKenBurns(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
  effectType: number
) {
  ctx.save();
  
  const scale = 1 + (progress * 0.1);
  
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  
  const panX = (effectType % 2 === 0 ? 1 : -1) * progress * 20;
  const panY = (effectType % 3 === 0 ? 1 : -1) * progress * 15;
  
  ctx.translate(-width / 2 + panX, -height / 2 + panY);
  
  drawImageCover(ctx, img, width, height);
  
  ctx.restore();
}

/**
 * Draw text overlay with styling
 */
function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number
) {
  if (!text) return;
  
  const fontSize = Math.floor(width * 0.045);
  const padding = width * 0.05;
  const maxWidth = width - (padding * 2);
  
  ctx.font = `bold ${fontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight + padding;
  const startY = height - padding - totalHeight;
  
  const gradient = ctx.createLinearGradient(0, startY, 0, height);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.3, "rgba(0, 0, 0, 0.7)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, startY, width, height - startY);
  
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  lines.forEach((line, i) => {
    const y = height - padding - (lines.length - 1 - i) * lineHeight;
    ctx.fillText(line, width / 2, y);
  });
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Render a single frame to the canvas
 */
function renderFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  segments: VideoSegment[],
  images: HTMLImageElement[],
  currentTime: number
): void {
  // Find current segment
  let elapsed = 0;
  let segmentIndex = 0;
  let segmentProgress = 0;
  
  for (let i = 0; i < segments.length; i++) {
    if (currentTime < elapsed + segments[i].duration) {
      segmentIndex = i;
      segmentProgress = (currentTime - elapsed) / segments[i].duration;
      break;
    }
    elapsed += segments[i].duration;
  }

  const segment = segments[segmentIndex];
  const img = images[segmentIndex];

  // Clear canvas
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);

  // Draw image with Ken Burns effect
  applyKenBurns(ctx, img, width, height, segmentProgress, segmentIndex);

  // Draw text overlay
  if (segment.text) {
    drawTextOverlay(ctx, segment.text, width, height);
  }
}

/**
 * Generate video from images and audio
 * Returns a Blob of the video file
 * OPTIMIZED: Uses real-time recording instead of frame-by-frame
 */
export async function generateVideoFromSegments(
  options: VideoEncoderOptions
): Promise<Blob> {
  const {
    width = 1080,
    height = 1920,
    fps = 24,
    audioUrl,
    segments,
    onProgress,
  } = options;

  console.log("[VideoEncoder] Starting video generation...");
  console.log(`[VideoEncoder] Segments: ${segments.length}, FPS: ${fps}`);

  // Pre-load all images
  const imagePromises = segments.map(async (seg, index) => {
    try {
      console.log(`[VideoEncoder] Loading image ${index + 1}/${segments.length}`);
      return await loadImage(seg.imageUrl);
    } catch (error) {
      console.error(`Failed to load image for segment ${index}:`, error);
      const fallbackCanvas = document.createElement("canvas");
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      const ctx = fallbackCanvas.getContext("2d")!;
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Cena ${index + 1}`, width / 2, height / 2);
      
      const img = new Image();
      img.src = fallbackCanvas.toDataURL();
      await new Promise(r => setTimeout(r, 100));
      return img;
    }
  });
  
  const images = await Promise.all(imagePromises);
  console.log(`[VideoEncoder] All ${images.length} images loaded`);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Calculate total duration
  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
  console.log(`[VideoEncoder] Total duration: ${totalDuration}s`);

  // Create video stream from canvas
  const stream = canvas.captureStream(fps);

  // Add audio track if available
  let audioElement: HTMLAudioElement | null = null;
  let audioContext: AudioContext | null = null;
  
  if (audioUrl) {
    try {
      console.log("[VideoEncoder] Setting up audio...");
      audioElement = new Audio();
      audioElement.crossOrigin = "anonymous";
      audioElement.src = audioUrl;
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn("[VideoEncoder] Audio load timeout, continuing without audio");
          resolve();
        }, 10000);
        
        audioElement!.oncanplaythrough = () => {
          clearTimeout(timeout);
          resolve();
        };
        audioElement!.onerror = () => {
          clearTimeout(timeout);
          console.warn("[VideoEncoder] Audio load error, continuing without audio");
          resolve();
        };
        audioElement!.load();
      });

      // Create audio context and source
      audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(audioElement);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      // NOTE: Do NOT connect to audioContext.destination - that would play audio through speakers during rendering

      // Add audio track to stream
      destination.stream.getAudioTracks().forEach(track => {
        stream.addTrack(track);
      });
      console.log("[VideoEncoder] Audio setup complete");
    } catch (e) {
      console.warn("[VideoEncoder] Failed to add audio track:", e);
      audioElement = null;
    }
  }

  // Setup MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";

  console.log(`[VideoEncoder] Using codec: ${mimeType}`);

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  return new Promise((resolve, reject) => {
    // Timeout safety - max 2 minutes for video generation
    const maxTimeout = setTimeout(() => {
      console.error("[VideoEncoder] Generation timeout after 2 minutes");
      recorder.stop();
      reject(new Error("Video generation timeout"));
    }, 120000);

    recorder.onstop = () => {
      clearTimeout(maxTimeout);
      console.log(`[VideoEncoder] Recording stopped, chunks: ${chunks.length}`);
      const blob = new Blob(chunks, { type: mimeType });
      console.log(`[VideoEncoder] Final blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
      resolve(blob);
    };

    recorder.onerror = (e) => {
      clearTimeout(maxTimeout);
      console.error("[VideoEncoder] Recorder error:", e);
      reject(new Error("MediaRecorder error"));
    };

    // Start recording
    recorder.start(100);
    console.log("[VideoEncoder] Recording started");

    // Start audio if available
    if (audioElement) {
      audioElement.currentTime = 0;
      audioElement.play().catch(console.warn);
    }

    // Track time using performance.now() for accuracy
    const startTime = performance.now();
    let lastProgress = 0;

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000; // Convert to seconds
      
      if (elapsed >= totalDuration) {
        // Done - stop recording
        console.log("[VideoEncoder] Animation complete, stopping recorder");
        if (audioElement) {
          audioElement.pause();
        }
        if (audioContext) {
          audioContext.close().catch(console.warn);
        }
        recorder.stop();
        return;
      }

      // Render current frame
      renderFrame(ctx, width, height, segments, images, elapsed);

      // Report progress (throttled to avoid too many updates)
      const progress = Math.round((elapsed / totalDuration) * 100);
      if (progress !== lastProgress) {
        lastProgress = progress;
        onProgress?.(progress);
      }

      // Continue animation
      requestAnimationFrame(animate);
    };

    // Start animation loop
    console.log("[VideoEncoder] Starting animation loop");
    requestAnimationFrame(animate);
  });
}

/**
 * Convert WebM blob to base64 data URL
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload video blob to Supabase storage
 */
export async function uploadVideoToStorage(
  blob: Blob,
  supabase: any,
  bucketName: string = "post-videos",
  format: "webm" | "mp4" = "webm"
): Promise<string> {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const fileName = `cinematic-${timestamp}-${randomId}.${format}`;

  console.log(`[VideoEncoder] Uploading ${format} video: ${fileName}`);

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, blob, {
      contentType: format === "mp4" ? "video/mp4" : "video/webm",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  console.log(`[VideoEncoder] Upload complete: ${publicUrlData.publicUrl}`);
  return publicUrlData.publicUrl;
}
