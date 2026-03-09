import fixWebmDuration from "fix-webm-duration";
import { supabase } from "@/integrations/supabase/client";
import { getAudioContext } from "@/lib/audio-unlock";

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

const TRANSITION_SECONDS = 0.35;
const DEFAULT_VIDEO_BPS = 8_000_000;
const CTA_DURATION_SECONDS = 4; // Last 4 seconds show CTA overlay

type LoadedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
};

type MotionParams = {
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

// ─── Math helpers ────────────────────────────────────────────

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
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom01(seed: number): () => number {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

// ─── Segment helpers ─────────────────────────────────────────

function normalizeSegments(segments: VideoSegment[]): VideoSegment[] {
  const sanitized = segments
    .filter((segment) => !!segment.imageUrl)
    .map((segment) => {
      const parsed = Number(segment.duration);
      const duration = Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_SEGMENT_DURATION_SECONDS;
      const normalizedText = typeof segment.text === "string"
        ? segment.text.replace(/\s+/g, " ").trim()
        : "";

      return {
        ...segment,
        duration: Math.max(MIN_SEGMENT_DURATION_SECONDS, duration),
        text: normalizedText || "Descubra mais no perfil para ver o conteúdo completo.",
      };
    });

  if (sanitized.length === 0) return [];

  const totalDuration = sanitized.reduce((sum, s) => sum + s.duration, 0);
  if (totalDuration <= MAX_TOTAL_DURATION_SECONDS) return sanitized;

  const scale = MAX_TOTAL_DURATION_SECONDS / totalDuration;
  return sanitized.map((s) => ({
    ...s,
    duration: Math.max(MIN_SEGMENT_DURATION_SECONDS, s.duration * scale),
  }));
}

// ─── Image loading ───────────────────────────────────────────

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

    const decodeFn = (img as any).decode;
    if (typeof decodeFn === "function") {
      try { await decodeFn.call(img); } catch { await waitForLoad(); }
    } else {
      await waitForLoad();
    }

    const w = (img as any).naturalWidth ?? img.width;
    const h = (img as any).naturalHeight ?? img.height;

    if ("createImageBitmap" in window) {
      try {
        const bitmap = await createImageBitmap(img);
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
      } catch { /* fallback */ }
    }
    return { source: img, width: w, height: h };
  } catch (e) {
    console.warn("[video-encoder] Failed to load image:", url, e);
    return null;
  }
}

// ─── Ken Burns motion ────────────────────────────────────────

function getMotionParamsForSegment(segment: VideoSegment, canvasW: number, canvasH: number): MotionParams {
  const seed = hashStringToUint(segment.imageUrl + "|" + (segment.text ?? ""));
  const rnd = seededRandom01(seed);
  const startScale = 1.02 + rnd() * 0.04;
  const endScale = startScale + (rnd() - 0.5) * 0.06;
  const maxX = canvasW * 0.05;
  const maxY = canvasH * 0.05;
  return {
    startScale, endScale,
    startX: (rnd() - 0.5) * 2 * maxX,
    startY: (rnd() - 0.5) * 2 * maxY,
    endX: (rnd() - 0.5) * 2 * maxX,
    endY: (rnd() - 0.5) * 2 * maxY,
  };
}

// ─── Drawing helpers ─────────────────────────────────────────

function drawImageCover(
  ctx: CanvasRenderingContext2D, img: LoadedImage,
  canvasW: number, canvasH: number,
  extraScale: number, offsetX: number, offsetY: number
) {
  const scale = Math.max(canvasW / img.width, canvasH / img.height) * extraScale;
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img.source, (canvasW - drawW) / 2 + offsetX, (canvasH - drawH) / 2 + offsetY, drawW, drawH);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCaption(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return;
  const clipped = normalized.length > 160 ? `${normalized.slice(0, 157)}…` : normalized;

  // Large frosted glass panel at bottom area
  const panelH = Math.round(canvasH * 0.26);
  const panelY = Math.round(canvasH * 0.60);

  // Multi-stop gradient for depth
  const grad = ctx.createLinearGradient(0, panelY, 0, panelY + panelH);
  grad.addColorStop(0, "rgba(0,0,0,0.0)");
  grad.addColorStop(0.15, "rgba(0,0,0,0.25)");
  grad.addColorStop(0.5, "rgba(0,0,0,0.65)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, panelY, canvasW, panelH);

  // Accent line at top of panel
  ctx.fillStyle = "rgba(139,92,246,0.6)";
  ctx.fillRect(canvasW * 0.15, panelY + Math.round(panelH * 0.08), canvasW * 0.7, 3);

  const maxTextW = canvasW - 140;
  const fontSize = clamp(Math.round(canvasW * 0.052), 38, 62);
  const lineHeight = Math.round(fontSize * 1.25);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

  const lines = wrapLines(ctx, clipped, maxTextW).slice(0, 3);
  const blockH = lines.length * lineHeight;
  const startY = panelY + panelH * 0.55 - blockH / 2 + lineHeight / 2;

  // Draw each line with heavy outline + white fill + subtle shadow
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;

    // Shadow pass
    ctx.lineWidth = Math.max(10, Math.round(fontSize * 0.22));
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(lines[i], canvasW / 2 + 2, y + 2);

    // Outline pass
    ctx.lineWidth = Math.max(8, Math.round(fontSize * 0.18));
    ctx.strokeStyle = "rgba(0,0,0,0.95)";
    ctx.strokeText(lines[i], canvasW / 2, y);

    // Fill with slight gradient feel
    ctx.fillStyle = "#FFFFFF";
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

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r);
  ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r);
  ctx.arcTo(x, y + pillH, x, y, r);
  ctx.arcTo(x, y, x + pillW, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.font = `700 ${Math.round(pillH * 0.45)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Neural Update", x + pillW / 2, y + pillH / 2);
}

/** Draw CTA overlay on the last seconds of the video */
function drawCTAOverlay(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, fadeIn: number) {
  const alpha = clamp(fadeIn, 0, 1);

  // Dark overlay
  ctx.fillStyle = `rgba(0,0,0,${0.6 * alpha})`;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // CTA text
  const fontSize = clamp(Math.round(canvasW * 0.065), 42, 72);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  ctx.globalAlpha = alpha;

  // "SEGUIR AGORA" button
  const btnW = Math.round(canvasW * 0.6);
  const btnH = Math.round(fontSize * 2.2);
  const btnX = (canvasW - btnW) / 2;
  const btnY = canvasH * 0.42;
  const btnR = Math.round(btnH / 2);

  // Button gradient
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
  btnGrad.addColorStop(0, "#8B5CF6");
  btnGrad.addColorStop(1, "#6D28D9");
  ctx.fillStyle = btnGrad;
  ctx.beginPath();
  ctx.moveTo(btnX + btnR, btnY);
  ctx.arcTo(btnX + btnW, btnY, btnX + btnW, btnY + btnH, btnR);
  ctx.arcTo(btnX + btnW, btnY + btnH, btnX, btnY + btnH, btnR);
  ctx.arcTo(btnX, btnY + btnH, btnX, btnY, btnR);
  ctx.arcTo(btnX, btnY, btnX + btnW, btnY, btnR);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("SEGUIR AGORA", canvasW / 2, btnY + btnH / 2);

  // Handle
  const handleSize = Math.round(fontSize * 0.65);
  ctx.font = `700 ${handleSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("@neuralupdate", canvasW / 2, btnY + btnH + handleSize * 1.5);

  // Subtitle
  const subSize = Math.round(fontSize * 0.42);
  ctx.font = `600 ${subSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("IA • Tecnologia • Futuro", canvasW / 2, btnY + btnH + handleSize * 1.5 + subSize * 2);

  ctx.globalAlpha = 1;
}

// ─── Scene composition ───────────────────────────────────────

function drawScene(
  ctx: CanvasRenderingContext2D,
  img: LoadedImage | null,
  canvasW: number, canvasH: number,
  motion: MotionParams | null,
  t01: number,
  text?: string,
  ctaFade?: number
) {
  ctx.clearRect(0, 0, canvasW, canvasH);

  if (!img || !motion) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvasW, canvasH);
    if (text) drawCaption(ctx, canvasW, canvasH, text);
    drawBrandMark(ctx, canvasW, canvasH);
    if (ctaFade && ctaFade > 0) drawCTAOverlay(ctx, canvasW, canvasH, ctaFade);
    return;
  }

  const eased = easeInOutCubic(clamp(t01, 0, 1));
  const scale = lerp(motion.startScale, motion.endScale, eased);
  const offX = lerp(motion.startX, motion.endX, eased);
  const offY = lerp(motion.startY, motion.endY, eased);

  // blurred background pass
  const prevFilter = ctx.filter;
  ctx.filter = "blur(18px)";
  ctx.globalAlpha = 0.95;
  drawImageCover(ctx, img, canvasW, canvasH, scale * 1.18, offX * 0.15, offY * 0.15);
  ctx.filter = prevFilter;

  // foreground
  ctx.globalAlpha = 1;
  drawImageCover(ctx, img, canvasW, canvasH, scale, offX, offY);

  // vignette
  const v = ctx.createRadialGradient(canvasW / 2, canvasH / 2, canvasW * 0.2, canvasW / 2, canvasH / 2, canvasW * 0.85);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, canvasW, canvasH);

  if (text && (!ctaFade || ctaFade < 0.5)) drawCaption(ctx, canvasW, canvasH, text);
  drawBrandMark(ctx, canvasW, canvasH);
  if (ctaFade && ctaFade > 0) drawCTAOverlay(ctx, canvasW, canvasH, ctaFade);
}

// ─── Audio loading ───────────────────────────────────────────

async function fetchAudioBuffer(audioCtx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    console.log("[video-encoder] Loading audio:", url.substring(0, 80));
    let arrayBuffer: ArrayBuffer;

    if (url.startsWith("data:")) {
      // Base64 data URL
      const base64 = url.split(",")[1];
      if (!base64) return null;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      arrayBuffer = bytes.buffer;
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      arrayBuffer = await res.arrayBuffer();
    }

    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    console.log("[video-encoder] Audio decoded:", decoded.duration.toFixed(1), "s");
    return decoded;
  } catch (e) {
    console.warn("[video-encoder] Failed to load audio:", e);
    return null;
  }
}

// ─── Codec selection ─────────────────────────────────────────

function pickBestMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const MR = (window as any).MediaRecorder as typeof MediaRecorder | undefined;
  if (!MR?.isTypeSupported) return "video/webm";
  return candidates.find((c) => MR.isTypeSupported(c)) ?? "video/webm";
}

// ─── Main export ─────────────────────────────────────────────

export async function generateVideoFromSegments(options: GenerateVideoOptions): Promise<Blob> {
  const {
    segments, width = 1080, height = 1920, fps = 30, onProgress,
    audioUrl, ctaAudioUrl, backgroundMusicUrl,
  } = options;

  const normalizedSegments = normalizeSegments(segments);
  if (normalizedSegments.length === 0) throw new Error("Nenhum segmento válido para renderizar vídeo");

  // ─── Build timeline ───
  const timeline: Array<{ segment: VideoSegment; start: number; end: number; motion: MotionParams }> = [];
  let cursor = 0;
  for (const segment of normalizedSegments) {
    timeline.push({ segment, start: cursor, end: cursor + segment.duration, motion: getMotionParamsForSegment(segment, width, height) });
    cursor += segment.duration;
  }
  const totalDurationSec = cursor;
  const expectedDurationMs = Math.round(totalDurationSec * 1000);

  console.log("[video-encoder] Timeline:", totalDurationSec.toFixed(1), "s,", timeline.length, "segments");
  console.log("[video-encoder] Audio:", !!audioUrl, "| CTA:", !!ctaAudioUrl, "| Music:", !!backgroundMusicUrl);

  // ─── Canvas setup ───
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context indisponível");

  // ─── Audio setup (mix narration + music into the stream) ───
  const audioCtx = getAudioContext();
  if (audioCtx.state === "suspended") {
    await audioCtx.resume().catch(() => {});
  }

  // Create a destination node for mixing audio into MediaRecorder
  const dest = audioCtx.createMediaStreamDestination();

  // Load audio assets in parallel
  const [narrationBuffer, ctaBuffer, musicBuffer] = await Promise.all([
    audioUrl ? fetchAudioBuffer(audioCtx, audioUrl) : Promise.resolve(null),
    ctaAudioUrl ? fetchAudioBuffer(audioCtx, ctaAudioUrl) : Promise.resolve(null),
    backgroundMusicUrl ? fetchAudioBuffer(audioCtx, backgroundMusicUrl) : Promise.resolve(null),
  ]);

  console.log("[video-encoder] Audio loaded — narration:", narrationBuffer?.duration?.toFixed(1) || "none",
    "| CTA:", ctaBuffer?.duration?.toFixed(1) || "none",
    "| music:", musicBuffer?.duration?.toFixed(1) || "none");

  // ─── Preload images ───
  const imageMap = new Map<string, LoadedImage | null>();
  await Promise.all(
    normalizedSegments.map(async (s) => {
      if (!imageMap.has(s.imageUrl)) imageMap.set(s.imageUrl, await loadImage(s.imageUrl));
    })
  );

  // ─── Combine canvas video + audio streams ───
  const canvasStream = canvas.captureStream(fps);
  const combinedStream = new MediaStream();

  // Add video tracks from canvas
  for (const track of canvasStream.getVideoTracks()) {
    combinedStream.addTrack(track);
  }

  // Add audio tracks from destination (mixed audio)
  for (const track of dest.stream.getAudioTracks()) {
    combinedStream.addTrack(track);
  }

  const mimeType = pickBestMimeType();
  console.log("[video-encoder] Using codec:", mimeType);

  const mediaRecorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: DEFAULT_VIDEO_BPS,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      const rawBlob = new Blob(chunks, { type: "video/webm" });
      try {
        const fixedBlob = await fixWebmDuration(rawBlob, expectedDurationMs || 1000);
        resolve(fixedBlob);
      } catch (error) {
        console.warn("[video-encoder] Failed to fix WebM duration:", error);
        resolve(rawBlob);
      }
    };

    // ─── Start audio playback ───
    const audioStartTime = audioCtx.currentTime + 0.05; // tiny buffer

    // Narration
    if (narrationBuffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = narrationBuffer;
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      src.connect(gain);
      gain.connect(dest);
      src.start(audioStartTime);
      console.log("[video-encoder] ▶ Narration started");
    }

    // CTA narration (play after main narration ends, with 0.3s gap)
    if (ctaBuffer) {
      const ctaStart = audioStartTime + (narrationBuffer ? narrationBuffer.duration + 0.3 : Math.max(0, totalDurationSec - CTA_DURATION_SECONDS));
      const src = audioCtx.createBufferSource();
      src.buffer = ctaBuffer;
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      src.connect(gain);
      gain.connect(dest);
      src.start(ctaStart);
      console.log("[video-encoder] ▶ CTA audio scheduled at", (ctaStart - audioStartTime).toFixed(1), "s");
    }

    // Background music (lower volume, loops if needed)
    if (musicBuffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = musicBuffer;
      src.loop = true; // loop music for full video duration
      const gain = audioCtx.createGain();
      gain.gain.value = narrationBuffer ? 0.12 : 0.4; // quieter when there's narration
      src.connect(gain);
      gain.connect(dest);
      src.start(audioStartTime);
      // Schedule stop
      src.stop(audioStartTime + totalDurationSec + 0.5);
      console.log("[video-encoder] ▶ Background music started (vol:", gain.gain.value, ")");
    }

    // ─── Start recording ───
    mediaRecorder.start(1000);
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
      const boundedElapsed = Math.min(elapsedSeconds, totalDurationSec);

      let idx = timeline.findIndex((e) => boundedElapsed >= e.start && boundedElapsed < e.end);
      if (idx === -1) idx = timeline.length - 1;

      const current = timeline[idx];
      const currentImg = imageMap.get(current.segment.imageUrl) ?? null;

      const localT = current.end > current.start
        ? clamp((boundedElapsed - current.start) / (current.end - current.start), 0, 1)
        : 1;

      // CTA overlay fade-in for the last CTA_DURATION_SECONDS
      const timeToEnd = totalDurationSec - boundedElapsed;
      const ctaFade = timeToEnd <= CTA_DURATION_SECONDS ? clamp(1 - timeToEnd / CTA_DURATION_SECONDS, 0, 1) : 0;

      const secondsToEnd = current.end - boundedElapsed;
      const canTransition = idx < timeline.length - 1;
      const isTransition = canTransition && secondsToEnd <= TRANSITION_SECONDS;

      if (!isTransition) {
        drawScene(ctx, currentImg, width, height, current.motion, localT, current.segment.text, ctaFade);
      } else {
        const mix = clamp(1 - secondsToEnd / TRANSITION_SECONDS, 0, 1);
        const next = timeline[idx + 1];
        const nextImg = imageMap.get(next.segment.imageUrl) ?? null;

        ctx.globalAlpha = 1;
        drawScene(ctx, currentImg, width, height, current.motion, localT, current.segment.text, ctaFade);
        ctx.globalAlpha = mix;
        drawScene(ctx, nextImg, width, height, next.motion, clamp(mix * 0.18, 0, 0.18), next.segment.text, ctaFade);
        ctx.globalAlpha = 1;
      }

      const progress = totalDurationSec > 0 ? Math.round((boundedElapsed / totalDurationSec) * 100) : 100;
      onProgress?.(clamp(progress, 0, 100));

      if (boundedElapsed >= totalDurationSec) {
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
