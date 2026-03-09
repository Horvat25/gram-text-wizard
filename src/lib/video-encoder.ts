import fixWebmDuration from "fix-webm-duration";
import { supabase } from "@/integrations/supabase/client";

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

const MAX_TOTAL_DURATION_SECONDS = 55;
const MIN_SEGMENT_DURATION_SECONDS = 1;
const FALLBACK_SEGMENT_DURATION_SECONDS = 5;

const TRANSITION_SECONDS = 0.35; // crossfade duration
const DEFAULT_VIDEO_BPS = 8_000_000;

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
};

type MotionParams = {
  startScale: number;
  endScale: number;
  startX: number; // px offset
  startY: number;
  endX: number;
  endY: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function hashStringToUint(str: string): number {
  // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom01(seed: number): () => number {
  // xorshift32
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // uint32 -> [0,1)
    return (x >>> 0) / 4294967296;
  };
}

function normalizeSegments(segments: VideoSegment[]): VideoSegment[] {
  const sanitized = segments
    .filter((segment) => !!segment.imageUrl)
    .map((segment) => {
      const parsed = Number(segment.duration);
      const duration = Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_SEGMENT_DURATION_SECONDS;

      return {
        ...segment,
        duration: Math.max(MIN_SEGMENT_DURATION_SECONDS, duration),
      };
    });

  if (sanitized.length === 0) return [];

  const totalDuration = sanitized.reduce((sum, segment) => sum + segment.duration, 0);
  if (totalDuration <= MAX_TOTAL_DURATION_SECONDS) return sanitized;

  const scale = MAX_TOTAL_DURATION_SECONDS / totalDuration;
  return sanitized.map((segment) => ({
    ...segment,
    duration: Math.max(MIN_SEGMENT_DURATION_SECONDS, segment.duration * scale),
  }));
}

async function loadImage(url: string): Promise<LoadedImage | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const waitForLoad = () =>
      new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image_load_failed"));
      });

    img.src = url;

    // Prefer decode() when available, but always keep an onload fallback.
    const decodeFn = (img as unknown as { decode?: () => Promise<void> }).decode;
    if (typeof decodeFn === "function") {
      try {
        await decodeFn.call(img);
      } catch {
        await waitForLoad();
      }
    } else {
      await waitForLoad();
    }

    const w = (img as any).naturalWidth ?? img.width;
    const h = (img as any).naturalHeight ?? img.height;

    // createImageBitmap helps performance and avoids some draw glitches
    if ("createImageBitmap" in window) {
      try {
        const bitmap = await createImageBitmap(img);
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
      } catch {
        // fallback to HTMLImageElement
      }
    }

    return { source: img, width: w, height: h };
  } catch (e) {
    console.warn("[video-encoder] Failed to load image:", url, e);
    return null;
  }
}

function getMotionParamsForSegment(segment: VideoSegment, canvasW: number, canvasH: number): MotionParams {
  const seed = hashStringToUint(segment.imageUrl + "|" + (segment.text ?? ""));
  const rnd = seededRandom01(seed);

  // gentle zoom/pan tuned for vertical 9:16
  const startScale = 1.02 + rnd() * 0.04; // 1.02..1.06
  const endScale = startScale + (rnd() - 0.5) * 0.06; // +- 0.03

  // offsets in px (small; avoids nausea)
  const maxX = canvasW * 0.05;
  const maxY = canvasH * 0.05;
  const startX = (rnd() - 0.5) * 2 * maxX;
  const endX = (rnd() - 0.5) * 2 * maxX;
  const startY = (rnd() - 0.5) * 2 * maxY;
  const endY = (rnd() - 0.5) * 2 * maxY;

  return {
    startScale,
    endScale,
    startX,
    startY,
    endX,
    endY,
  };
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: LoadedImage,
  canvasW: number,
  canvasH: number,
  extraScale: number,
  offsetX: number,
  offsetY: number
) {
  const scale = Math.max(canvasW / img.width, canvasH / img.height) * extraScale;
  const drawW = img.width * scale;
  const drawH = img.height * scale;

  const x = (canvasW - drawW) / 2 + offsetX;
  const y = (canvasH - drawH) / 2 + offsetY;

  ctx.drawImage(img.source, x, y, drawW, drawH);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);

  return lines;
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  text: string
) {
  const safeBottom = Math.round(canvasH * 0.08);
  const panelH = Math.round(canvasH * 0.26);
  const panelY = canvasH - panelH;

  // gradient panel for readability
  const grad = ctx.createLinearGradient(0, panelY, 0, canvasH);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.25, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0.70)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, panelY, canvasW, panelH);

  // typography
  const maxTextW = canvasW - 140;
  const fontSize = clamp(Math.round(canvasW * 0.045), 34, 54);
  const lineHeight = Math.round(fontSize * 1.18);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  const lines = wrapLines(ctx, text, maxTextW).slice(0, 3);

  const blockH = lines.length * lineHeight;
  const startY = canvasH - safeBottom - blockH + lineHeight / 2;

  // shadow stroke for crispness on busy images
  ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.16));
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "rgba(255,255,255,0.98)";

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    ctx.strokeText(lines[i], canvasW / 2, y);
    ctx.fillText(lines[i], canvasW / 2, y);
  }
}

function drawBrandMark(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
  const pad = Math.round(canvasW * 0.03);
  const pillH = Math.round(canvasW * 0.07);
  const pillW = Math.round(canvasW * 0.34);
  const x = canvasW - pad - pillW;
  const y = pad;
  const r = Math.round(pillH / 2);

  // pill background
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r);
  ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r);
  ctx.arcTo(x, y + pillH, x, y, r);
  ctx.arcTo(x, y, x + pillW, y, r);
  ctx.closePath();
  ctx.fill();

  // text
  ctx.font = `700 ${Math.round(pillH * 0.45)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Neural Update", x + pillW / 2, y + pillH / 2);
}

function pickBestMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  const MR = (window as any).MediaRecorder as typeof MediaRecorder | undefined;
  if (!MR?.isTypeSupported) return candidates[candidates.length - 1];

  return candidates.find((c) => MR.isTypeSupported(c)) ?? candidates[candidates.length - 1];
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  img: LoadedImage | null,
  canvasW: number,
  canvasH: number,
  motion: MotionParams | null,
  t01: number,
  text?: string
) {
  ctx.clearRect(0, 0, canvasW, canvasH);

  if (!img || !motion) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasW, canvasH);
    if (text) drawCaption(ctx, canvasW, canvasH, text);
    drawBrandMark(ctx, canvasW, canvasH);
    return;
  }

  const eased = easeInOutCubic(clamp(t01, 0, 1));
  const scale = lerp(motion.startScale, motion.endScale, eased);
  const offX = lerp(motion.startX, motion.endX, eased);
  const offY = lerp(motion.startY, motion.endY, eased);

  // background pass (blurred) to hide low-res edges during pan
  const prevFilter = ctx.filter;
  ctx.filter = "blur(18px)";
  ctx.globalAlpha = 0.95;
  drawImageCover(ctx, img, canvasW, canvasH, scale * 1.18, offX * 0.15, offY * 0.15);
  ctx.filter = prevFilter;

  // foreground pass
  ctx.globalAlpha = 1;
  drawImageCover(ctx, img, canvasW, canvasH, scale, offX, offY);

  // subtle vignette
  const v = ctx.createRadialGradient(canvasW / 2, canvasH / 2, canvasW * 0.2, canvasW / 2, canvasH / 2, canvasW * 0.85);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, canvasW, canvasH);

  if (text) drawCaption(ctx, canvasW, canvasH, text);
  drawBrandMark(ctx, canvasW, canvasH);
}

export async function generateVideoFromSegments(options: GenerateVideoOptions): Promise<Blob> {
  const { segments, width = 1080, height = 1920, fps = 30, onProgress } = options;
  const normalizedSegments = normalizeSegments(segments);

  if (normalizedSegments.length === 0) {
    throw new Error("Nenhum segmento válido para renderizar vídeo");
  }

  const timeline: Array<{ segment: VideoSegment; start: number; end: number; motion: MotionParams }> = [];
  let cursor = 0;
  for (const segment of normalizedSegments) {
    const start = cursor;
    const end = start + segment.duration;
    timeline.push({ segment, start, end, motion: getMotionParamsForSegment(segment, width, height) });
    cursor = end;
  }

  const expectedDurationMs = Math.round(cursor * 1000);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context indisponível");

  canvas.width = width;
  canvas.height = height;

  const stream = canvas.captureStream(fps);

  const mimeType = pickBestMimeType();
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: DEFAULT_VIDEO_BPS,
  });

  const imageMap = new Map<string, LoadedImage | null>();
  await Promise.all(
    normalizedSegments.map(async (segment) => {
      if (imageMap.has(segment.imageUrl)) return;
      imageMap.set(segment.imageUrl, await loadImage(segment.imageUrl));
    })
  );

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      const rawBlob = new Blob(chunks, { type: mimeType.startsWith("video/") ? mimeType : "video/webm" });
      try {
        const fixedBlob = await fixWebmDuration(rawBlob, expectedDurationMs || 1000);
        resolve(fixedBlob);
      } catch (error) {
        console.warn("[video-encoder] Failed to fix WebM duration metadata:", error);
        resolve(rawBlob);
      }
    };

    mediaRecorder.start();
    const startedAt = performance.now();

    let rafId = 0;
    let lastRenderedAt = 0;
    const minFrameMs = 1000 / fps;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - lastRenderedAt < minFrameMs * 0.85) return;
      lastRenderedAt = now;

      const elapsedSeconds = (now - startedAt) / 1000;
      const boundedElapsed = Math.min(elapsedSeconds, cursor);

      // find current segment index
      let idx = timeline.findIndex((entry) => boundedElapsed >= entry.start && boundedElapsed < entry.end);
      if (idx === -1) idx = timeline.length - 1;

      const current = timeline[idx];
      const currentImg = imageMap.get(current.segment.imageUrl) ?? null;

      const localT = current.end > current.start
        ? clamp((boundedElapsed - current.start) / (current.end - current.start), 0, 1)
        : 1;

      const secondsToEnd = current.end - boundedElapsed;
      const canTransition = idx < timeline.length - 1;
      const isTransition = canTransition && secondsToEnd <= TRANSITION_SECONDS;

      if (!isTransition) {
        drawScene(ctx, currentImg, width, height, current.motion, localT, current.segment.text);
      } else {
        const mix = clamp(1 - secondsToEnd / TRANSITION_SECONDS, 0, 1);
        const next = timeline[idx + 1];
        const nextImg = imageMap.get(next.segment.imageUrl) ?? null;

        // draw current
        ctx.globalAlpha = 1;
        drawScene(ctx, currentImg, width, height, current.motion, localT, current.segment.text);

        // overlay next
        ctx.globalAlpha = mix;
        const nextLocal = clamp(mix * 0.18, 0, 0.18);
        drawScene(ctx, nextImg, width, height, next.motion, nextLocal, next.segment.text);
        ctx.globalAlpha = 1;
      }

      const progress = cursor > 0 ? Math.round((boundedElapsed / cursor) * 100) : 100;
      onProgress?.(clamp(progress, 0, 100));

      if (boundedElapsed >= cursor) {
        cancelAnimationFrame(rafId);
        mediaRecorder.stop();
      }
    };

    tick();
  });
}

export async function uploadVideoToStorage(
  videoBlob: Blob,
  supabaseClient: typeof supabase,
  bucket: string
): Promise<string> {
  const fileName = `video_${Date.now()}.webm`;
  const { data, error } = await supabaseClient.storage.from(bucket).upload(fileName, videoBlob, {
    contentType: videoBlob.type,
    upsert: true,
  });

  if (error) throw error;

  const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}

