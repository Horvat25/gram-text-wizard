/**
 * Browser-based video encoder using Canvas + MediaRecorder
 * Creates real MP4-compatible video files from images and audio
 * Uses H.264 codec where available for Instagram compatibility
 * BRANDING: Neural Update watermark + marketing CTA at end
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
  ctaAudioUrl?: string; // Narration for the CTA at the end
  segments: VideoSegment[];
  onProgress?: (progress: number) => void;
  brandName?: string;
  instagramHandle?: string;
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
 * Draw text overlay with styling - CENTERED on screen
 * Position: Middle of screen (not bottom) to avoid Instagram caption overlap
 */
function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number
) {
  if (!text) return;
  
  const fontSize = Math.floor(width * 0.05);
  const padding = width * 0.08;
  const maxWidth = width - (padding * 2);
  
  ctx.font = `bold ${fontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
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
  
  const lineHeight = fontSize * 1.4;
  const totalTextHeight = lines.length * lineHeight;
  
  // CENTER position - middle of screen
  const centerY = height / 2;
  const boxPadding = width * 0.04;
  const boxWidth = maxWidth + boxPadding * 2;
  const boxHeight = totalTextHeight + boxPadding * 2;
  const boxX = (width - boxWidth) / 2;
  const boxY = centerY - boxHeight / 2;
  
  // Semi-transparent background box
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 16);
  ctx.fill();
  ctx.restore();
  
  // Draw text
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  
  const startY = centerY - (totalTextHeight / 2) + (lineHeight / 2);
  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    ctx.fillText(line, width / 2, y);
  });
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Draw watermark (Neural Update branding) - STATIC, no animations
 * Position: Top-right corner, fixed in all 4 images
 */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brandName: string = "Neural Update"
) {
  const fontSize = Math.floor(width * 0.028);
  const padding = width * 0.03;
  
  ctx.save();
  
  // Position: top-right corner (static)
  ctx.font = `600 ${fontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  
  const text = `⚡ ${brandName}`;
  const metrics = ctx.measureText(text);
  const pillPadding = fontSize * 0.5;
  const pillWidth = metrics.width + pillPadding * 2;
  const pillHeight = fontSize + pillPadding * 1.2;
  const pillX = width - padding - pillWidth;
  const pillY = padding;
  
  // Static gradient background (no glow animation)
  const gradient = ctx.createLinearGradient(pillX, pillY, pillX + pillWidth, pillY + pillHeight);
  gradient.addColorStop(0, "rgba(138, 43, 226, 0.9)");
  gradient.addColorStop(1, "rgba(75, 0, 130, 0.9)");
  
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  
  // Draw text (static, no shadow animation)
  ctx.fillStyle = "white";
  ctx.fillText(text, width - padding - pillPadding, padding + pillPadding * 0.6);
  
  ctx.restore();
}

/**
 * Draw marketing CTA frame (follow page)
 */
function drawMarketingCTA(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  instagramHandle: string = "@neuralupdate"
) {
  // Animated gradient background
  const gradientOffset = Math.sin(progress * Math.PI * 2) * 0.3;
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, width
  );
  gradient.addColorStop(0, `hsl(${270 + gradientOffset * 30}, 70%, 15%)`);
  gradient.addColorStop(0.5, `hsl(${280 + gradientOffset * 20}, 60%, 8%)`);
  gradient.addColorStop(1, "rgb(5, 5, 15)");
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Animated particles/stars
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const x = ((Math.sin(i * 1.5 + progress * 3) + 1) / 2) * width;
    const y = ((Math.cos(i * 2.3 + progress * 2) + 1) / 2) * height;
    const size = 2 + Math.sin(progress * 5 + i) * 2;
    const alpha = 0.3 + Math.sin(progress * 4 + i * 0.5) * 0.3;
    
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(138, 43, 226, ${alpha})`;
    ctx.fill();
  }
  ctx.restore();
  
  // Main content
  const centerY = height / 2;
  
  // Animated icon (pulsing circle)
  ctx.save();
  const pulseScale = 1 + Math.sin(progress * Math.PI * 4) * 0.1;
  const iconSize = width * 0.15 * pulseScale;
  
  // Outer glow
  const glowGradient = ctx.createRadialGradient(
    width / 2, centerY - height * 0.12, iconSize * 0.5,
    width / 2, centerY - height * 0.12, iconSize * 1.5
  );
  glowGradient.addColorStop(0, "rgba(138, 43, 226, 0.6)");
  glowGradient.addColorStop(1, "rgba(138, 43, 226, 0)");
  ctx.fillStyle = glowGradient;
  ctx.beginPath();
  ctx.arc(width / 2, centerY - height * 0.12, iconSize * 1.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Icon background
  const iconGradient = ctx.createLinearGradient(
    width / 2 - iconSize, centerY - height * 0.12 - iconSize,
    width / 2 + iconSize, centerY - height * 0.12 + iconSize
  );
  iconGradient.addColorStop(0, "#8B5CF6");
  iconGradient.addColorStop(0.5, "#A855F7");
  iconGradient.addColorStop(1, "#7C3AED");
  
  ctx.fillStyle = iconGradient;
  ctx.beginPath();
  ctx.arc(width / 2, centerY - height * 0.12, iconSize, 0, Math.PI * 2);
  ctx.fill();
  
  // Lightning bolt icon
  ctx.fillStyle = "white";
  ctx.font = `bold ${iconSize * 1.2}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚡", width / 2, centerY - height * 0.12);
  ctx.restore();
  
  // Brand name with animation
  ctx.save();
  const titleFontSize = Math.floor(width * 0.09);
  ctx.font = `800 ${titleFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // Text gradient
  const textGradient = ctx.createLinearGradient(
    width / 2 - width * 0.3, 0,
    width / 2 + width * 0.3, 0
  );
  textGradient.addColorStop(0, "#A855F7");
  textGradient.addColorStop(0.5, "#FFFFFF");
  textGradient.addColorStop(1, "#8B5CF6");
  
  ctx.fillStyle = textGradient;
  ctx.shadowColor = "rgba(138, 43, 226, 0.8)";
  ctx.shadowBlur = 20;
  ctx.fillText("Neural Update", width / 2, centerY + height * 0.05);
  ctx.restore();
  
  // Subtitle
  ctx.save();
  const subtitleFontSize = Math.floor(width * 0.04);
  ctx.font = `500 ${subtitleFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillText("Inteligência Artificial • Tecnologia • Inovação", width / 2, centerY + height * 0.12);
  ctx.restore();
  
  // Follow CTA button with animation
  ctx.save();
  const buttonWidth = width * 0.6;
  const buttonHeight = height * 0.08;
  const buttonX = (width - buttonWidth) / 2;
  const buttonY = centerY + height * 0.2;
  
  // Button glow
  ctx.shadowColor = "rgba(138, 43, 226, 0.6)";
  ctx.shadowBlur = 25 + Math.sin(progress * Math.PI * 3) * 10;
  
  // Button gradient
  const buttonGradient = ctx.createLinearGradient(buttonX, buttonY, buttonX + buttonWidth, buttonY);
  buttonGradient.addColorStop(0, "#8B5CF6");
  buttonGradient.addColorStop(0.5, "#A855F7");
  buttonGradient.addColorStop(1, "#7C3AED");
  
  ctx.fillStyle = buttonGradient;
  ctx.beginPath();
  ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, buttonHeight / 2);
  ctx.fill();
  
  // Button border glow
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Button text
  ctx.shadowBlur = 0;
  const buttonFontSize = Math.floor(width * 0.05);
  ctx.font = `700 ${buttonFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SEGUIR AGORA", width / 2, buttonY + buttonHeight / 2);
  ctx.restore();
  
  // Instagram handle
  ctx.save();
  const handleFontSize = Math.floor(width * 0.055);
  ctx.font = `600 ${handleFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "white";
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 10;
  ctx.fillText(instagramHandle, width / 2, centerY + height * 0.32);
  ctx.restore();
  
  // Bottom tagline
  ctx.save();
  const taglineFontSize = Math.floor(width * 0.035);
  ctx.font = `400 ${taglineFontSize}px 'Inter', 'Segoe UI', sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.fillText("🚀 O futuro é agora", width / 2, height - height * 0.08);
  ctx.restore();
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
  currentTime: number,
  totalDuration: number,
  ctaDuration: number,
  brandName: string,
  instagramHandle: string
): void {
  const contentDuration = totalDuration - ctaDuration;
  
  // Check if we're in CTA phase
  if (currentTime >= contentDuration) {
    const ctaProgress = (currentTime - contentDuration) / ctaDuration;
    drawMarketingCTA(ctx, width, height, ctaProgress, instagramHandle);
    return;
  }
  
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

  // Draw watermark
  drawWatermark(ctx, width, height, brandName);

  // Draw text overlay
  if (segment.text) {
    drawTextOverlay(ctx, segment.text, width, height);
  }
}

/**
 * Get the best supported video codec for recording
 * Prioritize H.264 (MP4) over VP8/VP9 (WebM) for Instagram compatibility
 */
function getBestCodec(): { mimeType: string; isMP4: boolean } {
  // Try MP4/H.264 first (best for Instagram)
  const mp4Codecs = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // H.264 Baseline + AAC
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2', // H.264 Main + AAC
    'video/mp4;codecs=avc1.64001E,mp4a.40.2', // H.264 High + AAC
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  
  for (const codec of mp4Codecs) {
    if (MediaRecorder.isTypeSupported(codec)) {
      console.log(`[VideoEncoder] MP4 codec supported: ${codec}`);
      return { mimeType: codec, isMP4: true };
    }
  }
  
  // Fallback to WebM
  const webmCodecs = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  
  for (const codec of webmCodecs) {
    if (MediaRecorder.isTypeSupported(codec)) {
      console.log(`[VideoEncoder] WebM codec supported: ${codec}`);
      return { mimeType: codec, isMP4: false };
    }
  }
  
  return { mimeType: 'video/webm', isMP4: false };
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
    fps = 24,
    audioUrl,
    ctaAudioUrl,
    segments,
    onProgress,
    brandName = "Neural Update",
    instagramHandle = "@neuralupdate",
  } = options;

  const ctaDuration = 4; // 4 seconds for marketing CTA at end

  console.log("[VideoEncoder] Starting video generation with branding...");
  console.log(`[VideoEncoder] Segments: ${segments.length}, FPS: ${fps}`);
  console.log(`[VideoEncoder] Brand: ${brandName}, Handle: ${instagramHandle}`);

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

  // Calculate total duration (content + CTA)
  const contentDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
  const totalDuration = contentDuration + ctaDuration;
  console.log(`[VideoEncoder] Content: ${contentDuration}s, CTA: ${ctaDuration}s, Total: ${totalDuration}s`);

  // Create video stream from canvas
  const stream = canvas.captureStream(fps);

  // Add audio track if available (main narration + CTA audio)
  let audioElement: HTMLAudioElement | null = null;
  let ctaAudioElement: HTMLAudioElement | null = null;
  let audioContext: AudioContext | null = null;
  let ctaAudioStarted = false;
  
  if (audioUrl || ctaAudioUrl) {
    try {
      audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      
      // Load main narration audio
      if (audioUrl) {
        console.log("[VideoEncoder] Setting up main audio...");
        audioElement = new Audio();
        audioElement.crossOrigin = "anonymous";
        audioElement.src = audioUrl;
        
        await new Promise<void>((resolve) => {
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

        const source = audioContext.createMediaElementSource(audioElement);
        source.connect(destination);
        console.log("[VideoEncoder] Main audio setup complete");
      }
      
      // Load CTA audio
      if (ctaAudioUrl) {
        console.log("[VideoEncoder] Setting up CTA audio...");
        ctaAudioElement = new Audio();
        ctaAudioElement.crossOrigin = "anonymous";
        ctaAudioElement.src = ctaAudioUrl;
        
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn("[VideoEncoder] CTA audio load timeout");
            resolve();
          }, 10000);
          
          ctaAudioElement!.oncanplaythrough = () => {
            clearTimeout(timeout);
            resolve();
          };
          ctaAudioElement!.onerror = () => {
            clearTimeout(timeout);
            console.warn("[VideoEncoder] CTA audio load error");
            resolve();
          };
          ctaAudioElement!.load();
        });

        const ctaSource = audioContext.createMediaElementSource(ctaAudioElement);
        ctaSource.connect(destination);
        console.log("[VideoEncoder] CTA audio setup complete");
      }

      // Add combined audio track to stream
      destination.stream.getAudioTracks().forEach(track => {
        stream.addTrack(track);
      });
    } catch (e) {
      console.warn("[VideoEncoder] Failed to add audio track:", e);
      audioElement = null;
      ctaAudioElement = null;
    }
  }

  // Get best available codec (prefer MP4 for Instagram)
  const { mimeType, isMP4 } = getBestCodec();
  console.log(`[VideoEncoder] Using codec: ${mimeType} (MP4: ${isMP4})`);

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
    const maxTimeout = setTimeout(() => {
      console.error("[VideoEncoder] Generation timeout after 3 minutes");
      recorder.stop();
      reject(new Error("Video generation timeout"));
    }, 180000);

    recorder.onstop = async () => {
      clearTimeout(maxTimeout);
      console.log(`[VideoEncoder] Recording stopped, chunks: ${chunks.length}`);
      const blob = new Blob(chunks, { type: mimeType });
      console.log(`[VideoEncoder] Final blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB, type: ${blob.type}`);
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
      const elapsed = (performance.now() - startTime) / 1000;
      
      if (elapsed >= totalDuration) {
        console.log("[VideoEncoder] Animation complete, stopping recorder");
        if (audioElement) {
          audioElement.pause();
        }
        if (ctaAudioElement) {
          ctaAudioElement.pause();
        }
        if (audioContext) {
          audioContext.close().catch(console.warn);
        }
        recorder.stop();
        return;
      }

      // Start CTA audio when entering CTA phase
      if (elapsed >= contentDuration && !ctaAudioStarted && ctaAudioElement) {
        ctaAudioStarted = true;
        console.log("[VideoEncoder] Starting CTA audio");
        ctaAudioElement.currentTime = 0;
        ctaAudioElement.play().catch(console.warn);
      }

      // Render current frame with watermark and CTA support
      renderFrame(
        ctx, width, height, segments, images, 
        elapsed, totalDuration, ctaDuration,
        brandName, instagramHandle
      );

      const progress = Math.round((elapsed / totalDuration) * 100);
      if (progress !== lastProgress) {
        lastProgress = progress;
        onProgress?.(progress);
      }

      requestAnimationFrame(animate);
    };

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
 * Determines format from blob type
 */
export async function uploadVideoToStorage(
  blob: Blob,
  supabase: any,
  bucketName: string = "post-videos"
): Promise<string> {
  const isMP4 = blob.type.includes('mp4');
  const format = isMP4 ? 'mp4' : 'webm';
  
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 10);
  const fileName = `cinematic-${timestamp}-${randomId}.${format}`;

  console.log(`[VideoEncoder] Uploading ${format} video: ${fileName} (type: ${blob.type})`);

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(fileName, blob, {
      contentType: blob.type || (isMP4 ? "video/mp4" : "video/webm"),
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
