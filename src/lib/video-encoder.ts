/**
 * Browser-based video encoder using Canvas + MediaRecorder
 * Creates real video files from images and audio
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
        }, 15000); // 15 second timeout
        
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
      // Wait before retry
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
    // Image is wider - fit by height
    drawWidth = height * imgRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    // Image is taller - fit by width
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
  progress: number, // 0 to 1
  effectType: number
) {
  ctx.save();
  
  // Different effects based on type
  const scale = 1 + (progress * 0.1); // Zoom from 100% to 110%
  
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  
  // Subtle pan
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
  
  // Word wrap
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
  
  // Draw background for text
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight + padding;
  const startY = height - padding - totalHeight;
  
  // Semi-transparent background
  const gradient = ctx.createLinearGradient(0, startY, 0, height);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.3, "rgba(0, 0, 0, 0.7)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.9)");
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, startY, width, height - startY);
  
  // Draw text
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
 * Generate video from images and audio
 * Returns a Blob of the video file
 */
export async function generateVideoFromSegments(
  options: VideoEncoderOptions
): Promise<Blob> {
  const {
    width = 1080,
    height = 1920,
    fps = 30,
    audioUrl,
    segments,
    onProgress,
  } = options;

  // Pre-load all images with error handling
  const imagePromises = segments.map(async (seg, index) => {
    try {
      return await loadImage(seg.imageUrl);
    } catch (error) {
      console.error(`Failed to load image for segment ${index}:`, error);
      // Create a fallback solid color image
      const fallbackCanvas = document.createElement("canvas");
      fallbackCanvas.width = width;
      fallbackCanvas.height = height;
      const ctx = fallbackCanvas.getContext("2d")!;
      ctx.fillStyle = "#1a1a2e"; // Dark purple background
      ctx.fillRect(0, 0, width, height);
      
      // Add segment number indicator
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

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Calculate total duration
  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
  const totalFrames = Math.floor(totalDuration * fps);

  // Create video stream from canvas
  const stream = canvas.captureStream(fps);

  // Add audio track if available
  let audioElement: HTMLAudioElement | null = null;
  if (audioUrl) {
    try {
      audioElement = new Audio();
      audioElement.crossOrigin = "anonymous";
      audioElement.src = audioUrl;
      await new Promise<void>((resolve, reject) => {
        audioElement!.oncanplaythrough = () => resolve();
        audioElement!.onerror = () => reject(new Error("Failed to load audio"));
        audioElement!.load();
      });

      // Create audio context and source
      const audioContext = new AudioContext();
      const source = audioContext.createMediaElementSource(audioElement);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.connect(audioContext.destination);

      // Add audio track to stream
      destination.stream.getAudioTracks().forEach(track => {
        stream.addTrack(track);
      });
    } catch (e) {
      console.warn("Failed to add audio track:", e);
    }
  }

  // Setup MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000, // 8 Mbps for good quality
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  // Start recording
  recorder.start(100); // Collect data every 100ms

  // Start audio if available
  if (audioElement) {
    audioElement.currentTime = 0;
    audioElement.play().catch(console.warn);
  }

  // Render frames
  return new Promise((resolve, reject) => {
    let frameIndex = 0;
    const frameInterval = 1000 / fps;

    const renderFrame = () => {
      if (frameIndex >= totalFrames) {
        // Stop recording
        recorder.stop();
        if (audioElement) {
          audioElement.pause();
        }
        
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          resolve(blob);
        };
        return;
      }

      const currentTime = frameIndex / fps;
      
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

      // Report progress
      if (onProgress) {
        onProgress(Math.round((frameIndex / totalFrames) * 100));
      }

      frameIndex++;
      
      // Use setTimeout for frame timing
      setTimeout(renderFrame, frameInterval);
    };

    // Start rendering
    renderFrame();
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
 * @param blob - Video blob (WebM or MP4)
 * @param supabase - Supabase client
 * @param bucketName - Storage bucket name
 * @param format - Video format ("webm" or "mp4")
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

  return publicUrlData.publicUrl;
}
