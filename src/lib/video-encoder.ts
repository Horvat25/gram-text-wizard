import { supabase } from '@/integrations/supabase/client';
import fixWebmDuration from 'fix-webm-duration';
import { VIDEO_CONFIG } from './video-config';

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
    { startScale: 1.0, endScale: 1.22, startX: 0, startY: 0, endX: -0.06, endY: -0.04 },
    { startScale: 1.18, endScale: 1.0, startX: -0.06, startY: -0.03, endX: 0, endY: 0 },
    { startScale: 1.0, endScale: 1.16, startX: 0.04, startY: 0, endX: -0.04, endY: -0.05 },
    { startScale: 1.14, endScale: 1.0, startX: -0.04, startY: -0.04, endX: 0.03, endY: 0 },
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
  const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.15);
  topGrad.addColorStop(0, 'rgba(11, 15, 26, 0.7)');
  topGrad.addColorStop(1, 'rgba(11, 15, 26, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, width, height * 0.15);

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
  ctx.shadowColor = `rgba(123, 44, 255, 0.5)`;
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
  const rx = width / 2 - bgWidth / 2;
  const ry = startY - padding;
  const rw = bgWidth;
  const rh = totalHeight + padding * 2;
  const radius = 16;
  ctx.beginPath();
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

  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], width / 2, startY + i * lineHeight);
  }
  ctx.restore();
}

// ─── Draw Hook flash effect ─────────────────────────────────
function drawHookEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  hookProgress: number
) {
  if (hookProgress <= 0 || hookProgress >= 1) return;
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
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, VIDEO_CONFIG.BRAND_COLOR_BG);
  grad.addColorStop(0.5, VIDEO_CONFIG.BRAND_COLOR_BG_DARK);
  grad.addColorStop(1, VIDEO_CONFIG.BRAND_COLOR_BG);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 4);
  ctx.save();
  const glowGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.5);
  glowGrad.addColorStop(0, `rgba(123, 44, 255, ${0.15 + pulse * 0.1})`);
  glowGrad.addColorStop(1, 'rgba(123, 44, 255, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const fadeIn = easeInOutCubic(Math.min(1, progress * 3));

  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.font = 'bold 64px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(123, 44, 255, 0.6)';
  ctx.shadowBlur = 20;
  ctx.fillText(brand, width / 2, height / 2 - 80);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fadeIn * 0.8;
  ctx.font = '32px sans-serif';
  ctx.fillStyle = '#A78BFA';
  ctx.textAlign = 'center';
  ctx.fillText(VIDEO_CONFIG.BRAND_SUBTITLE, width / 2, height / 2 - 20);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fadeIn;
  const btnW = 380, btnH = 70;
  const btnX = width / 2 - btnW / 2, btnY = height / 2 + 40;
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
  btnGrad.addColorStop(0, VIDEO_CONFIG.BRAND_COLOR_PRIMARY);
  btnGrad.addColorStop(1, VIDEO_CONFIG.BRAND_COLOR_ACCENT);
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

// ─── Crossfade ───────────────────────────────────────────────
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
  ctx.save();
  ctx.globalAlpha = 1 - blendProgress;
  drawImageKenBurns(ctx, imgA, width, height, segIndexA, progressA);
  ctx.restore();
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

// ─── Render a single frame at a given time ───────────────────
function renderFrame(
  ctx: CanvasRenderingContext2D,
  currentTime: number,
  segments: VideoSegment[],
  images: HTMLImageElement[],
  width: number,
  height: number,
  contentDuration: number,
  ctaDuration: number,
  brand: string,
  fps: number
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = VIDEO_CONFIG.BRAND_COLOR_BG;
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
    const transitionFrames = VIDEO_CONFIG.TRANSITION_DURATION * fps;
    const segFrames = Math.round(segments[segIndex].duration * fps);
    const frameInSeg = Math.round((currentTime - elapsed) * fps);
    const isInTransition = segIndex < segments.length - 1 && frameInSeg > segFrames - transitionFrames;

    if (isInTransition) {
      const transProgress = (frameInSeg - (segFrames - transitionFrames)) / transitionFrames;
      const blendT = easeInOutCubic(Math.min(1, Math.max(0, transProgress)));
      drawCrossfade(ctx, images[segIndex], images[segIndex + 1], width, height, blendT, segIndex, segIndex + 1, segProgress, 0);
    } else {
      drawImageKenBurns(ctx, images[segIndex], width, height, segIndex, segProgress);
    }

    drawGradientOverlays(ctx, width, height);

    if (segIndex === 0 && currentTime < VIDEO_CONFIG.HOOK_DURATION) {
      drawHookEffect(ctx, width, height, currentTime / VIDEO_CONFIG.HOOK_DURATION);
    }

    const captionText = segments[segIndex].text;
    if (captionText) {
      let captionOpacity = 1;
      if (segProgress < 0.1) captionOpacity = segProgress / 0.1;
      if (segProgress > 0.85) captionOpacity = (1 - segProgress) / 0.15;
      captionOpacity = Math.max(0, Math.min(1, captionOpacity));
      drawCaption(ctx, captionText, width, height, captionOpacity);
    }

    drawWatermark(ctx, width, height, brand);
  } else {
    // ── CTA PHASE ──
    const ctaProgress = (currentTime - contentDuration) / ctaDuration;
    drawCTAScreen(ctx, width, height, ctaProgress, brand);
  }
}

// ─── Validate segments without changing audio-driven timing ─────────────
function validateSegments(segments: VideoSegment[]): VideoSegment[] {
  const limited = segments.slice(0, VIDEO_CONFIG.MAX_SEGMENTS);
  return limited.map(seg => ({
    ...seg,
    duration: Number.isFinite(seg.duration)
      ? Math.max(VIDEO_CONFIG.MIN_SEGMENT_DURATION, seg.duration)
      : VIDEO_CONFIG.MIN_SEGMENT_DURATION,
  }));
}

// ═══════════════════════════════════════════════════════════════
// MAIN: Generate video — time-locked to real elapsed audio time
// ═══════════════════════════════════════════════════════════════
export async function generateVideoFromSegments(
  options: GenerateVideoOptions
): Promise<Blob> {
  const {
    segments: rawSegments,
    width = VIDEO_CONFIG.WIDTH,
    height = VIDEO_CONFIG.HEIGHT,
    fps = VIDEO_CONFIG.FPS,
    audioUrl,
    ctaAudioUrl,
    backgroundMusicUrl,
    onProgress,
  } = options;

  const segments = validateSegments(rawSegments);

  if (segments.length === 0) {
    throw new Error('Nenhum segmento válido para renderizar');
  }

  if (segments.some(seg => !seg.imageUrl)) {
    throw new Error('Uma ou mais cenas estão sem imagem');
  }

  const BRAND = VIDEO_CONFIG.BRAND_NAME;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const dest = audioCtx.createMediaStreamDestination();

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

  const CTA_DURATION = Math.min(
    ctaBuf ? Math.max(VIDEO_CONFIG.CTA_MIN_DURATION, ctaBuf.duration + 1.5) : VIDEO_CONFIG.CTA_MIN_DURATION,
    VIDEO_CONFIG.CTA_MAX_DURATION
  );
  const contentDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const rawTotal = contentDuration + CTA_DURATION;
  const totalDuration = Math.min(rawTotal, VIDEO_CONFIG.MAX_TOTAL_DURATION);

  if (rawTotal > VIDEO_CONFIG.MAX_TOTAL_DURATION) {
    console.warn(`[video-encoder] ⚠️ Duration trimmed to ${VIDEO_CONFIG.MAX_TOTAL_DURATION}s at encoder boundary`);
  }

  console.log(`[video-encoder] Total: ${totalDuration.toFixed(1)}s (content: ${contentDuration.toFixed(1)}s + CTA: ${CTA_DURATION.toFixed(1)}s) | ${segments.length} segments`);

  const images: HTMLImageElement[] = await Promise.all(
    segments.map(seg =>
      new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.warn('[video-encoder] Image failed:', seg.imageUrl?.substring(0, 60));
          const fallback = document.createElement('canvas');
          fallback.width = width;
          fallback.height = height;
          const fCtx = fallback.getContext('2d')!;
          const grad = fCtx.createLinearGradient(0, 0, width, height);
          grad.addColorStop(0, VIDEO_CONFIG.BRAND_COLOR_BG);
          grad.addColorStop(1, VIDEO_CONFIG.BRAND_COLOR_BG_DARK);
          fCtx.fillStyle = grad;
          fCtx.fillRect(0, 0, width, height);
          const fallbackImg = new Image();
          fallbackImg.src = fallback.toDataURL();
          fallbackImg.onload = () => resolve(fallbackImg);
        };
        img.src = seg.imageUrl;
      })
    )
  );

  console.log(`[video-encoder] ${images.length} images loaded, rendering ${totalDuration.toFixed(1)}s @ ${fps}fps (${width}x${height})`);

  renderFrame(ctx, 0, segments, images, width, height, contentDuration, CTA_DURATION, BRAND, fps);

  const videoStream = canvas.captureStream(fps);
  const combinedStream = new MediaStream();
  videoStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
  dest.stream.getAudioTracks().forEach(t => combinedStream.addTrack(t));

  const codecPriority = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
  ];
  const mimeType = codecPriority.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  console.log(`[video-encoder] Codec: ${mimeType}`);

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: VIDEO_CONFIG.VIDEO_BITRATE,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = async () => {
      audioCtx.close().catch(() => {});

      if (chunks.length === 0) {
        reject(new Error('MediaRecorder produced no data'));
        return;
      }

      let blob = new Blob(chunks, { type: mimeType });
      console.log(`[video-encoder] Raw blob: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

      if (mimeType.includes('webm')) {
        try {
          blob = await fixWebmDuration(blob, totalDuration * 1000, { logger: false });
          console.log('[video-encoder] WebM duration fixed');
        } catch (e) {
          console.warn('[video-encoder] fixWebmDuration failed, using raw blob:', e);
        }
      }

      resolve(blob);
    };

    mediaRecorder.onerror = (e: any) => {
      console.error('[video-encoder] MediaRecorder error:', e);
      reject(new Error(`MediaRecorder error: ${e.error?.message || 'unknown'}`));
    };

    const startDelayMs = 80;
    const frameIntervalMs = 1000 / fps;
    let lastRenderedAt = -Infinity;
    let lastProgress = -1;
    let stopped = false;

    mediaRecorder.start(200);

    const audioStartTime = audioCtx.currentTime + startDelayMs / 1000;
    const narrationEndTime = narrationBuf
      ? Math.max(contentDuration, narrationBuf.duration)
      : contentDuration;

    if (narrationBuf) {
      const src = audioCtx.createBufferSource();
      src.buffer = narrationBuf;
      const gain = audioCtx.createGain();
      gain.gain.value = VIDEO_CONFIG.NARRATION_VOLUME;
      src.connect(gain).connect(dest);
      src.start(audioStartTime);
    }

    if (ctaBuf) {
      const src = audioCtx.createBufferSource();
      src.buffer = ctaBuf;
      const gain = audioCtx.createGain();
      gain.gain.value = VIDEO_CONFIG.CTA_VOLUME;
      src.connect(gain).connect(dest);
      src.start(audioStartTime + narrationEndTime + VIDEO_CONFIG.NARRATION_CTA_GAP);
    }

    if (musicBuf) {
      const src = audioCtx.createBufferSource();
      src.buffer = musicBuf;
      src.loop = true;
      const gain = audioCtx.createGain();
      gain.gain.value = narrationBuf
        ? VIDEO_CONFIG.MUSIC_VOLUME_WITH_NARRATION
        : VIDEO_CONFIG.MUSIC_VOLUME_WITHOUT_NARRATION;
      src.connect(gain).connect(dest);
      src.start(audioStartTime);
      gain.gain.setValueAtTime(gain.gain.value, audioStartTime + totalDuration - VIDEO_CONFIG.MUSIC_FADEOUT_SECONDS);
      gain.gain.linearRampToValueAtTime(0, audioStartTime + totalDuration);
    }

    const startWallClock = performance.now() + startDelayMs;
    const hardTimeoutMs = (totalDuration + VIDEO_CONFIG.RENDER_TIMEOUT_BUFFER) * 1000;
    const hardTimeout = setTimeout(() => {
      if (!stopped) {
        console.error('[video-encoder] ⛔ HARD TIMEOUT — forcing stop');
        stopped = true;
        try {
          if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        } catch (e) {
          console.error('[video-encoder] Error stopping after timeout:', e);
        }
      }
    }, hardTimeoutMs);

    const tick = (now: number) => {
      if (stopped) return;

      const elapsed = Math.max(0, (now - startWallClock) / 1000);
      const renderTime = Math.min(totalDuration, elapsed);

      if (now - lastRenderedAt >= frameIntervalMs - 1 || renderTime >= totalDuration) {
        renderFrame(ctx, renderTime, segments, images, width, height, contentDuration, CTA_DURATION, BRAND, fps);
        lastRenderedAt = now;

        const progress = Math.min(100, Math.round((renderTime / totalDuration) * 100));
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress?.(progress);
        }
      }

      if (elapsed >= totalDuration) {
        stopped = true;
        clearTimeout(hardTimeout);
        setTimeout(() => {
          if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        }, 250);
        return;
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
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
