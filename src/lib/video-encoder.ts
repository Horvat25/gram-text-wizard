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

// ─── Draw watermark (editorial gold) ─────────────────────────
function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, brand: string) {
  ctx.save();
  // Linha dourada fininha acima do brand
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(width - 130, height - 58, 36, 2);

  ctx.globalAlpha = 0.95;
  ctx.font = '600 22px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 8;
  ctx.fillText(brand.toUpperCase(), width - 40, height - 38);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.55;
  ctx.font = '500 13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('IA • TECH • FUTURO', width - 40, height - 18);
  ctx.restore();
}

// ─── Draw editorial caption (big, bold, no pill — broadcast style) ───
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

  // Tipografia: editorial bold, peso forte
  const baseSize = 46;
  ctx.font = `800 ${baseSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Inter", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const sideMargin = 56;
  const maxWidth = width - sideMargin * 2;
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

  const lineHeight = baseSize + 14;
  const totalHeight = lines.length * lineHeight;
  const bottomMargin = 170;
  const startY = height - bottomMargin - totalHeight;

  // Faixa escura sutil (gradiente, sem pill arredondada) só atrás do texto
  const bgPad = 28;
  const bgY = startY - bgPad;
  const bgH = totalHeight + bgPad * 2;
  const bgGrad = ctx.createLinearGradient(0, bgY, 0, bgY + bgH);
  bgGrad.addColorStop(0, 'rgba(11, 15, 26, 0)');
  bgGrad.addColorStop(0.25, 'rgba(11, 15, 26, 0.55)');
  bgGrad.addColorStop(1, 'rgba(11, 15, 26, 0.8)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, bgY, width, bgH + 40);

  // Barra amarela acento à esquerda (motif Neural Update)
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(sideMargin - 18, startY + 6, 5, totalHeight - 12);

  // Texto principal — branco forte com sombra densa pra legibilidade
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], sideMargin, startY + i * lineHeight);
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
// ─── Draw CTA end screen (editorial, sem botão) ──────────────
function drawCTAScreen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  brand: string
) {
  // Fundo gradient profundo
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#05070d');
  grad.addColorStop(0.5, '#0B0F1A');
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Glow dourado sutil no centro (vinheta invertida)
  const glow = ctx.createRadialGradient(width / 2, height * 0.42, 0, width / 2, height * 0.42, width * 0.8);
  glow.addColorStop(0, 'rgba(255, 215, 0, 0.10)');
  glow.addColorStop(0.5, 'rgba(255, 215, 0, 0.03)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Grain leve (linhas horizontais discretas pra textura editorial)
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#FFFFFF';
  for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
  ctx.restore();

  const fadeIn = easeInOutCubic(Math.min(1, progress * 2.5));
  const slideUp = (1 - easeInOutCubic(Math.min(1, progress * 2))) * 30;

  // Linha dourada sobre o título
  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(width / 2 - 32, height / 2 - 170 + slideUp, 64, 3);
  ctx.restore();

  // Título grande NEURAL UPDATE (caixa alta, peso máximo)
  ctx.save();
  ctx.globalAlpha = fadeIn;
  ctx.font = '900 78px ui-sans-serif, system-ui, -apple-system, "Inter", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 215, 0, 0.25)';
  ctx.shadowBlur = 30;
  ctx.fillText(brand.toUpperCase(), width / 2, height / 2 - 100 + slideUp);
  ctx.restore();

  // Subtítulo / tagline
  ctx.save();
  ctx.globalAlpha = fadeIn * 0.85;
  ctx.font = '500 26px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'center';
  ctx.fillText('IA • TECNOLOGIA • FUTURO', width / 2, height / 2 - 40 + slideUp);
  ctx.restore();

  // CTA editorial (sem botão — texto puro com chamada forte)
  const fadeIn2 = easeInOutCubic(Math.max(0, Math.min(1, (progress - 0.25) * 2.5)));
  ctx.save();
  ctx.globalAlpha = fadeIn2;
  ctx.font = '700 38px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('Análise completa no blog', width / 2, height / 2 + 60);

  ctx.font = '800 36px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('neural-update.com.br', width / 2, height / 2 + 120);

  // Linha de instagram
  ctx.globalAlpha = fadeIn2 * 0.7;
  ctx.font = '500 22px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('@neuralupdate', width / 2, height / 2 + 180);
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
  visualContentDuration: number,
  ctaStartTime: number,
  ctaDuration: number,
  brand: string,
  fps: number
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = VIDEO_CONFIG.BRAND_COLOR_BG;
  ctx.fillRect(0, 0, width, height);

  if (currentTime < ctaStartTime) {
    // ── CONTENT PHASE ──
    const clampedContentTime = Math.min(
      currentTime,
      Math.max(visualContentDuration - 0.001, 0)
    );
    let elapsed = 0;
    let segIndex = segments.length - 1;
    for (let i = 0; i < segments.length; i++) {
      if (clampedContentTime < elapsed + segments[i].duration || i === segments.length - 1) {
        segIndex = i;
        break;
      }
      elapsed += segments[i].duration;
    }

    const safeDuration = Math.max(segments[segIndex].duration, 0.001);
    const segProgress = Math.min(1, Math.max(0, (clampedContentTime - elapsed) / safeDuration));
    const transitionFrames = VIDEO_CONFIG.TRANSITION_DURATION * fps;
    const segFrames = Math.round(safeDuration * fps);
    const frameInSeg = Math.round(Math.max(0, clampedContentTime - elapsed) * fps);
    const isHoldingLastFrame = currentTime > visualContentDuration;
    const isInTransition = !isHoldingLastFrame && segIndex < segments.length - 1 && frameInSeg > segFrames - transitionFrames;

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
      let captionOpacity = isHoldingLastFrame ? 1 : 1;
      if (!isHoldingLastFrame) {
        if (segProgress < 0.1) captionOpacity = segProgress / 0.1;
        if (segProgress > 0.85) captionOpacity = (1 - segProgress) / 0.15;
      }
      captionOpacity = Math.max(0, Math.min(1, captionOpacity));
      drawCaption(ctx, captionText, width, height, captionOpacity);
    }

    drawWatermark(ctx, width, height, brand);
  } else {
    // ── CTA PHASE ──
    const ctaProgress = (currentTime - ctaStartTime) / ctaDuration;
    drawCTAScreen(ctx, width, height, ctaProgress, brand);
  }
}

// ─── Validate segments without changing audio-driven timing ─────────────
function validateSegments(segments: VideoSegment[]): VideoSegment[] {
  if (segments.length > VIDEO_CONFIG.MAX_SEGMENTS) {
    throw new Error(`O render suporta no máximo ${VIDEO_CONFIG.MAX_SEGMENTS} cenas.`);
  }

  return segments.map(seg => ({
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
  const visualContentDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const narrationDuration = narrationBuf ? Math.max(visualContentDuration, narrationBuf.duration) : visualContentDuration;
  const ctaStartTime = narrationDuration + VIDEO_CONFIG.NARRATION_CTA_GAP;
  const rawTotal = ctaStartTime + CTA_DURATION;

  if (rawTotal > VIDEO_CONFIG.MAX_TOTAL_DURATION) {
    throw new Error(`Duração final de ${rawTotal.toFixed(1)}s excede o limite seguro de ${VIDEO_CONFIG.MAX_TOTAL_DURATION}s.`);
  }

  const totalDuration = rawTotal;

  console.log(`[video-encoder] Total: ${totalDuration.toFixed(1)}s (visual: ${visualContentDuration.toFixed(1)}s | narration: ${narrationDuration.toFixed(1)}s | CTA: ${CTA_DURATION.toFixed(1)}s) | ${segments.length} segments`);

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

  renderFrame(ctx, 0, segments, images, width, height, visualContentDuration, ctaStartTime, CTA_DURATION, BRAND, fps);

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
      ? Math.max(visualContentDuration, narrationBuf.duration)
      : visualContentDuration;

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
        renderFrame(ctx, renderTime, segments, images, width, height, visualContentDuration, ctaStartTime, CTA_DURATION, BRAND, fps);
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
