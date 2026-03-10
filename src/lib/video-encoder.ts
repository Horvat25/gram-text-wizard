import { supabase } from '@/integrations/supabase/client';

export interface VideoSegment {
  imageUrl: string;
  duration: number;
  text?: string;
}

export interface GenerateVideoOptions {
  width?: number;
  height?: number;
  fps?: number;
  audioUrl?: string;
  ctaAudioUrl?: string;
  backgroundMusicUrl?: string;
  segments: VideoSegment[];
  onProgress?: (progress: number) => void;
}

// ─── Easing ──────────────────────────────────────────────────
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─── Ken Burns effect ────────────────────────────────────────
function getKenBurns(segIndex: number, progress: number) {
  const patterns = [
    { startScale: 1.0, endScale: 1.18, startX: 0, startY: 0, endX: -0.05, endY: -0.03 },
    { startScale: 1.15, endScale: 1.0, startX: -0.05, startY: -0.02, endX: 0, endY: 0 },
    { startScale: 1.0, endScale: 1.12, startX: 0.03, startY: 0, endX: -0.03, endY: -0.04 },
    { startScale: 1.1, endScale: 1.0, startX: -0.03, startY: -0.03, endX: 0.02, endY: 0 },
  ];
  const p = patterns[segIndex % patterns.length];
  const t = easeInOutCubic(progress);
  return {
    scale: p.startScale + (p.endScale - p.startScale) * t,
    x: p.startX + (p.endX - p.startX) * t,
    y: p.startY + (p.endY - p.startY) * t,
  };
}

// ─── Draw image with Ken Burns ───────────────────────────────
function drawImageKenBurns(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  segIndex: number,
  progress: number
) {
  const kb = getKenBurns(segIndex, progress);
  const sw = width / kb.scale;
  const sh = height / kb.scale;

  // Scale image to cover canvas
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;
  let drawW: number, drawH: number;
  if (imgRatio > canvasRatio) {
    drawH = img.height;
    drawW = drawH * canvasRatio;
  } else {
    drawW = img.width;
    drawH = drawW / canvasRatio;
  }

  const sx = (img.width - drawW) / 2 + kb.x * drawW;
  const sy = (img.height - drawH) / 2 + kb.y * drawH;

  ctx.drawImage(img, sx, sy, drawW, drawH, 0, 0, width, height);
}

// ─── Draw cinematic gradient overlays ────────────────────────
function drawGradientOverlays(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Top gradient (for branding area)
  const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.15);
  topGrad.addColorStop(0, 'rgba(11, 15, 26, 0.7)');
  topGrad.addColorStop(1, 'rgba(11, 15, 26, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, height * 0.15);

  // Bottom gradient (for captions)
  const botGrad = ctx.createLinearGradient(0, height * 0.65, 0, height);
  botGrad.addColorStop(0, 'rgba(11, 15, 26, 0)');
  botGrad.addColorStop(0.4, 'rgba(11, 15, 26, 0.5)');
  botGrad.addColorStop(1, 'rgba(11, 15, 26, 0.85)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, height * 0.65, width, height * 0.35);
}

// ─── Draw watermark ──────────────────────────────────────────
function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, brand: string) {
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'right';
  ctx.shadowColor = 'rgba(123, 44, 255, 0.5)';
  ctx.shadowBlur = 12;
  ctx.fillText(brand, width - 40, height - 40);
  ctx.restore();
}

// ─── Draw animated caption (word-wrapped) ────────────────────
function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  opacity: number
) {
  if (!text || opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, opacity);
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Word wrap
  const maxWidth = width - 120;
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = 54;
  const totalHeight = lines.length * lineHeight;
  const startY = height - 180 - totalHeight;

  // Background pill
  ctx.fillStyle = 'rgba(11, 15, 26, 0.75)';
  const padding = 20;
  const bgWidth = Math.min(maxWidth + padding * 2, width - 60);
  ctx.beginPath();
  const rx = width / 2 - bgWidth / 2;
  const ry = startY - padding;
  const rw = bgWidth;
  const rh = totalHeight + padding * 2;
  const radius = 16;
  ctx.moveTo(rx + radius, ry);
  ctx.lineTo(rx + rw - radius, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
  ctx.lineTo(rx + rw, ry + rh - radius);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
  ctx.lineTo(rx + radius, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
  ctx.lineTo(rx, ry + radius);
  ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
  ctx.closePath();
  ctx.fill();

  // Text with shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#FFFFFF';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, startY + i * lineHeight);
  }
  ctx.restore();
}

// ─── Draw Hook flash effect (first 3 seconds) ───────────────
function drawHookEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hookProgress: number
) {
  if (hookProgress <= 0 || hookProgress >= 1) return;

  // Flash effect: white flash that fades out
  const flashIntensity = hookProgress < 0.15
    ? hookProgress / 0.15
    : Math.max(0, 1 - (hookProgress - 0.15) / 0.3);

  if (flashIntensity > 0) {
    ctx.save();
    ctx.globalAlpha = flashIntensity * 0.3;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

// ─── Draw CTA end screen ────────────────────────────────────
function drawCTAScreen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  brand: string
) {
  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0B0F1A');
  grad.addColorStop(0.5, '#1a1040');
  grad.addColorStop(1, '#0B0F1A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Pulsing glow
  const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 4);
  ctx.save();
  const glowGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.5);
  glowGrad.addColorStop(0, `rgba(123, 44, 255, ${0.15 + pulse * 0.1})`);
  glowGrad.addColorStop(1, 'rgba(123, 44, 255, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const fadeIn = easeInOutCubic(Math.min(1, progress * 3));

  // Brand name
  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.font = 'bold 64px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(123, 44, 255, 0.6)';
  ctx.shadowBlur = 20;
  ctx.fillText(brand, width / 2, height / 2 - 80);
  ctx.restore();

  // Subtitle
  ctx.save();
  ctx.globalAlpha = fadeIn * 0.8;
  ctx.font = '32px sans-serif';
  ctx.fillStyle = '#A78BFA';
  ctx.textAlign = 'center';
  ctx.fillText('IA • Tecnologia • Futuro', width / 2, height / 2 - 20);
  ctx.restore();

  // "SEGUIR AGORA" button
  ctx.save();
  ctx.globalAlpha = fadeIn;
  const btnW = 380;
  const btnH = 70;
  const btnX = width / 2 - btnW / 2;
  const btnY = height / 2 + 40;
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
  btnGrad.addColorStop(0, '#7B2CFF');
  btnGrad.addColorStop(1, '#a855f7');
  ctx.fillStyle = btnGrad;
  ctx.beginPath();
  const br = 35;
  ctx.moveTo(btnX + br, btnY);
  ctx.lineTo(btnX + btnW - br, btnY);
  ctx.quadraticCurveTo(btnX + btnW, btnY, btnX + btnW, btnY + br);
  ctx.lineTo(btnX + btnW, btnY + btnH - br);
  ctx.quadraticCurveTo(btnX + btnW, btnY + btnH, btnX + btnW - br, btnY + btnH);
  ctx.lineTo(btnX + br, btnY + btnH);
  ctx.quadraticCurveTo(btnX, btnY + btnH, btnX, btnY + btnH - br);
  ctx.lineTo(btnX, btnY + br);
  ctx.quadraticCurveTo(btnX, btnY, btnX + br, btnY);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 32px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('SEGUIR AGORA', width / 2, btnY + 46);
  ctx.restore();
}

// ─── Crossfade transition helper ─────────────────────────────
function drawCrossfade(
  ctx: CanvasRenderingContext2D,
  imgA: HTMLImageElement,
  imgB: HTMLImageElement,
  width: number,
  height: number,
  blendProgress: number,
  segIndexA: number,
  segIndexB: number,
  progressA: number,
  progressB: number
) {
  // Draw image A
  ctx.save();
  ctx.globalAlpha = 1 - blendProgress;
  drawImageKenBurns(ctx, imgA, width, height, segIndexA, progressA);
  ctx.restore();

  // Draw image B
  ctx.save();
  ctx.globalAlpha = blendProgress;
  drawImageKenBurns(ctx, imgB, width, height, segIndexB, progressB);
  ctx.restore();
}

// ─── Load audio as AudioBuffer ───────────────────────────────
async function loadAudioBuffer(
  audioCtx: AudioContext,
  url: string
): Promise<AudioBuffer | null> {
  try {
    let arrayBuffer: ArrayBuffer;
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      arrayBuffer = bytes.buffer;
    } else {
      const resp = await fetch(url, { mode: 'cors' });
      arrayBuffer = await resp.arrayBuffer();
    }
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn('[video-encoder] Failed to load audio:', url.substring(0, 60), e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN: Generate video with transitions, audio, captions, CTA
// ═══════════════════════════════════════════════════════════════
export async function generateVideoFromSegments(
  options: GenerateVideoOptions
): Promise<Blob> {
  const {
    segments,
    width = 720,   // 720p — fast enough for real-time Canvas rendering
    height = 1280, // 9:16 vertical
    fps = 24,      // Cinema standard — lighter than 30fps
    audioUrl,
    ctaAudioUrl,
    backgroundMusicUrl,
    onProgress,
  } = options;

  const BRAND = 'Neural Update';
  const TRANSITION_DURATION = 0.4;
  const HOOK_DURATION = 3;
  const CTA_MIN_DURATION = 4; // minimum CTA screen time

  // ─── Canvas setup ────────────────────────────────────────
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = width;
  canvas.height = height;

  // ─── Audio setup ─────────────────────────────────────────
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();

  // Load audio sources in parallel
  const [narrationBuf, ctaBuf, musicBuf] = await Promise.all([
    audioUrl ? loadAudioBuffer(audioCtx, audioUrl) : Promise.resolve(null),
    ctaAudioUrl ? loadAudioBuffer(audioCtx, ctaAudioUrl) : Promise.resolve(null),
    backgroundMusicUrl ? loadAudioBuffer(audioCtx, backgroundMusicUrl) : Promise.resolve(null),
  ]);

  console.log('[video-encoder] Audio loaded:', {
    narration: narrationBuf ? `${narrationBuf.duration.toFixed(1)}s` : 'none',
    cta: ctaBuf ? `${ctaBuf.duration.toFixed(1)}s` : 'none',
    music: musicBuf ? `${musicBuf.duration.toFixed(1)}s` : 'none',
  });

  // Calculate CTA duration: match audio length or use minimum
  const CTA_DURATION = ctaBuf ? Math.max(CTA_MIN_DURATION, ctaBuf.duration + 1.5) : CTA_MIN_DURATION;
  console.log('[video-encoder] CTA duration:', CTA_DURATION.toFixed(1), 's', ctaBuf ? `(audio: ${ctaBuf.duration.toFixed(1)}s)` : '(no audio)');

  // Calculate total content duration (segments + CTA)
  const contentDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const totalDuration = contentDuration + CTA_DURATION;

  // ─── Preload all images BEFORE starting audio ────────────
  const images: HTMLImageElement[] = await Promise.all(
    segments.map(seg =>
      new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.warn('[video-encoder] Image failed to load:', seg.imageUrl?.substring(0, 60));
          const fallbackCanvas = document.createElement('canvas');
          fallbackCanvas.width = width;
          fallbackCanvas.height = height;
          const fCtx = fallbackCanvas.getContext('2d')!;
          const grad = fCtx.createLinearGradient(0, 0, width, height);
          grad.addColorStop(0, '#0B0F1A');
          grad.addColorStop(1, '#1a1040');
          fCtx.fillStyle = grad;
          fCtx.fillRect(0, 0, width, height);
          const fallbackImg = new Image();
          fallbackImg.src = fallbackCanvas.toDataURL();
          fallbackImg.onload = () => resolve(fallbackImg);
        };
        img.src = seg.imageUrl;
      })
    )
  );

  console.log(`[video-encoder] ${images.length} images loaded, rendering ${totalDuration.toFixed(1)}s video at ${fps}fps (${width}x${height})`);

  // ─── Combine video + audio streams ───────────────────────
  // Use captureStream(0) for manual frame control — no framerate cap
  const videoStream = canvas.captureStream(0);
  const videoTrack = videoStream.getVideoTracks()[0] as any;
  const combinedStream = new MediaStream();
  combinedStream.addTrack(videoTrack);
  dest.stream.getAudioTracks().forEach(t => combinedStream.addTrack(t));

  // ─── MediaRecorder with codec fallback (prefer MP4/H.264 for Instagram) ───
  const codecPriority = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',  // H.264 Baseline + AAC
    'video/mp4;codecs=avc1.42E01E',              // H.264 Baseline
    'video/mp4',                                  // Generic MP4
    'video/webm;codecs=vp8,opus',                // VP8 fallback
    'video/webm',                                 // Generic WebM fallback
  ];
  let mimeType = codecPriority.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const isMP4 = mimeType.startsWith('video/mp4');
  console.log(`[VideoEncoder] Using codec: ${mimeType} (MP4: ${isMP4})`);

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 3_000_000, // 3Mbps — good quality for 720p
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // ─── Render loop ─────────────────────────────────────────
  return new Promise(async (resolve) => {
    mediaRecorder.onstop = () => {
      audioCtx.close().catch(() => {});
      const blobType = isMP4 ? 'video/mp4' : 'video/webm';
      resolve(new Blob(chunks, { type: blobType }));
    };

    mediaRecorder.start(100);

    // Record the audioCtx time when we start — all audio is scheduled relative to this
    const audioStartTime = audioCtx.currentTime;

    // Schedule narration audio NOW (right before render loop)
    if (narrationBuf) {
      const src = audioCtx.createBufferSource();
      src.buffer = narrationBuf;
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      src.connect(gain).connect(dest);
      src.start(audioStartTime);
    }

    // Schedule CTA audio after content
    if (ctaBuf) {
      const src = audioCtx.createBufferSource();
      src.buffer = ctaBuf;
      const gain = audioCtx.createGain();
      gain.gain.value = 0.9;
      src.connect(gain).connect(dest);
      src.start(audioStartTime + contentDuration + 0.3);
    }

    // Schedule background music
    if (musicBuf) {
      const src = audioCtx.createBufferSource();
      src.buffer = musicBuf;
      src.loop = true;
      const gain = audioCtx.createGain();
      gain.gain.value = narrationBuf ? 0.12 : 0.35;
      src.connect(gain).connect(dest);
      src.start(audioStartTime);
      gain.gain.setValueAtTime(gain.gain.value, audioStartTime + totalDuration - 2);
      gain.gain.linearRampToValueAtTime(0, audioStartTime + totalDuration);
    }

    const totalFrames = Math.round(totalDuration * fps);
    const frameInterval = 1000 / fps; // ~41.6ms at 24fps
    const wallStartTime = performance.now();

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const currentTime = frameIndex / fps;

      // ── Clear canvas ──
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0B0F1A';
      ctx.fillRect(0, 0, width, height);

      if (currentTime < contentDuration) {
        // ── CONTENT PHASE ──
        let elapsed = 0;
        let segIndex = 0;
        for (let i = 0; i < segments.length; i++) {
          if (currentTime < elapsed + segments[i].duration) {
            segIndex = i;
            break;
          }
          elapsed += segments[i].duration;
        }

        const segProgress = (currentTime - elapsed) / segments[segIndex].duration;
        const transitionFrames = TRANSITION_DURATION * fps;
        const segFrames = Math.round(segments[segIndex].duration * fps);
        const frameInSeg = Math.round((currentTime - elapsed) * fps);

        const isInTransition = segIndex < segments.length - 1 && frameInSeg > segFrames - transitionFrames;

        if (isInTransition) {
          const transProgress = (frameInSeg - (segFrames - transitionFrames)) / transitionFrames;
          const blendT = easeInOutCubic(Math.min(1, Math.max(0, transProgress)));
          drawCrossfade(
            ctx, images[segIndex], images[segIndex + 1],
            width, height, blendT,
            segIndex, segIndex + 1,
            segProgress, 0
          );
        } else {
          drawImageKenBurns(ctx, images[segIndex], width, height, segIndex, segProgress);
        }

        drawGradientOverlays(ctx, width, height);

        if (segIndex === 0 && currentTime < HOOK_DURATION) {
          drawHookEffect(ctx, width, height, currentTime / HOOK_DURATION);
        }

        const captionText = segments[segIndex].text;
        if (captionText) {
          let captionOpacity = 1;
          if (segProgress < 0.1) captionOpacity = segProgress / 0.1;
          if (segProgress > 0.85) captionOpacity = (1 - segProgress) / 0.15;
          captionOpacity = Math.max(0, Math.min(1, captionOpacity));
          drawCaption(ctx, captionText, width, height, captionOpacity);
        }

        drawWatermark(ctx, width, height, BRAND);
      } else {
        // ── CTA PHASE ──
        const ctaProgress = (currentTime - contentDuration) / CTA_DURATION;
        drawCTAScreen(ctx, width, height, ctaProgress, BRAND);
      }

      // Request frame capture from the stream (manual mode with captureStream(0))
      if (videoTrack.requestFrame) {
        videoTrack.requestFrame();
      }

      // Progress callback
      if (frameIndex % 6 === 0) { // Update every 6 frames (~4x/sec) to reduce overhead
        onProgress?.(Math.round((frameIndex / totalFrames) * 100));
      }

      // ── Real-time sync: wait until the right wall-clock moment ──
      // This ensures audio and video stay in sync
      const expectedWallTime = wallStartTime + (frameIndex + 1) * frameInterval;
      const now = performance.now();
      const delay = expectedWallTime - now;

      if (delay > 2) {
        // We're ahead of schedule — wait
        await new Promise(r => setTimeout(r, delay));
      } else if (delay < -frameInterval * 2) {
        // We're more than 2 frames behind — skip frames to catch up
        const framesToSkip = Math.min(3, Math.floor(-delay / frameInterval));
        if (framesToSkip > 0) {
          console.log(`[video-encoder] Skipping ${framesToSkip} frames to maintain sync (behind by ${(-delay).toFixed(0)}ms)`);
          frameIndex += framesToSkip;
        }
        await new Promise(r => setTimeout(r, 1));
      } else {
        // We're slightly behind but within tolerance — yield briefly
        await new Promise(r => setTimeout(r, 1));
      }
    }

    onProgress?.(100);
    mediaRecorder.stop();
  });
}

// ─── Upload to storage ───────────────────────────────────────
export async function uploadVideoToStorage(
  videoBlob: Blob,
  supabaseClient: typeof supabase,
  bucket: string
): Promise<string> {
  const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const fileName = `video_${Date.now()}.${ext}`;
  const { data, error } = await supabaseClient.storage
    .from(bucket)
    .upload(fileName, videoBlob, {
      contentType: videoBlob.type,
      upsert: true,
    });

  if (error) throw error;

  const { data: urlData } = supabaseClient.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}
