import fixWebmDuration from "fix-webm-duration";
import { supabase } from "@/integrations/supabase/client";
import { getAudioContext } from "@/lib/audio-unlock";

export interface VideoSegment {
  imageUrl: string;
  duration: number;
  text?: string;
  scene?: string; // "hook" | "context" | "explanation" | "impact" | "cta"
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

// ─── Standard durations ──────────────────────────────────────
const MAX_SCENES = 5;
const MAX_TOTAL_DURATION_SECONDS = 55;
const MIN_SEGMENT_DURATION_SECONDS = 1;
const FALLBACK_SEGMENT_DURATION_SECONDS = 4;
const STANDARD_SCENE_DURATIONS = [2, 4, 4, 4, 3]; // hook, context, explanation, impact, cta = 17s

const TRANSITION_SECONDS = 0.3;
const DEFAULT_VIDEO_BPS = 8_000_000;
const MAX_WORDS_PER_CAPTION = 8;

type LoadedImage = { source: CanvasImageSource; width: number; height: number };
type MotionParams = { startScale: number; endScale: number; startX: number; startY: number; endX: number; endY: number };

// ─── Math helpers ────────────────────────────────────────────

function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeInOutCubic(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

function hashStringToUint(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function seededRandom01(seed: number): () => number {
  let x = seed || 123456789;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
}

// ─── Segment helpers ─────────────────────────────────────────

function truncateToMaxWords(text: string, maxWords: number = MAX_WORDS_PER_CAPTION): string {
  const words = text.trim().split(/\s+/);
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") : text.trim();
}

function normalizeSegments(segments: VideoSegment[]): VideoSegment[] {
  // Enforce max 5 scenes
  const limited = segments.filter((s) => !!s.imageUrl).slice(0, MAX_SCENES);

  const sanitized = limited.map((segment, i) => {
    const parsed = Number(segment.duration);
    const standardDuration = STANDARD_SCENE_DURATIONS[i] ?? FALLBACK_SEGMENT_DURATION_SECONDS;
    const duration = Number.isFinite(parsed) && parsed > 0 ? parsed : standardDuration;

    const rawText = typeof segment.text === "string" ? segment.text.replace(/\s+/g, " ").trim() : "";
    const text = truncateToMaxWords(rawText || "Descubra mais no perfil.");

    return { ...segment, duration: Math.max(MIN_SEGMENT_DURATION_SECONDS, duration), text };
  });

  if (sanitized.length === 0) return [];

  const totalDuration = sanitized.reduce((sum, s) => sum + s.duration, 0);
  if (totalDuration <= MAX_TOTAL_DURATION_SECONDS) return sanitized;

  const scale = MAX_TOTAL_DURATION_SECONDS / totalDuration;
  return sanitized.map((s) => ({ ...s, duration: Math.max(MIN_SEGMENT_DURATION_SECONDS, s.duration * scale) }));
}

// ─── Image loading ───────────────────────────────────────────

async function loadImage(url: string): Promise<LoadedImage | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const waitForLoad = () => new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("image_load_failed")); });
    img.src = url;
    const decodeFn = (img as any).decode;
    if (typeof decodeFn === "function") { try { await decodeFn.call(img); } catch { await waitForLoad(); } } else { await waitForLoad(); }
    const w = (img as any).naturalWidth ?? img.width;
    const h = (img as any).naturalHeight ?? img.height;
    if ("createImageBitmap" in window) { try { const bitmap = await createImageBitmap(img); return { source: bitmap, width: bitmap.width, height: bitmap.height }; } catch {} }
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
  const startScale = 1.04 + rnd() * 0.06;
  const endScale = startScale + (rnd() > 0.5 ? 1 : -1) * (0.04 + rnd() * 0.04);
  const maxX = canvasW * 0.06;
  const maxY = canvasH * 0.06;
  return {
    startScale, endScale,
    startX: (rnd() - 0.5) * 2 * maxX, startY: (rnd() - 0.5) * 2 * maxY,
    endX: (rnd() - 0.5) * 2 * maxX, endY: (rnd() - 0.5) * 2 * maxY,
  };
}

// ─── Drawing helpers ─────────────────────────────────────────

function drawImageCover(ctx: CanvasRenderingContext2D, img: LoadedImage, canvasW: number, canvasH: number, extraScale: number, offsetX: number, offsetY: number) {
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
  if (!text) return;
  const normalized = truncateToMaxWords(text.replace(/\s+/g, " ").trim());
  if (!normalized) return;

  // Large central text on dark panel
  const panelH = Math.round(canvasH * 0.22);
  const panelY = Math.round(canvasH * 0.72);

  ctx.fillStyle = "rgba(0,0,0,0.82)";
  ctx.fillRect(0, panelY, canvasW, panelH);

  // Top border accent
  ctx.fillStyle = "rgba(139,92,246,0.8)";
  ctx.fillRect(0, panelY, canvasW, 4);

  const maxTextW = canvasW - 120;
  const fontSize = clamp(Math.round(canvasW * 0.052), 40, 60);
  const lineHeight = Math.round(fontSize * 1.3);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;

  const lines = wrapLines(ctx, normalized, maxTextW).slice(0, 2);
  const blockH = lines.length * lineHeight;
  const startY = panelY + panelH / 2 - blockH / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    ctx.lineWidth = Math.max(8, Math.round(fontSize * 0.2));
    ctx.strokeStyle = "#000000";
    ctx.lineJoin = "round";
    ctx.strokeText(lines[i], canvasW / 2, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(lines[i], canvasW / 2, y);
  }
}

function drawBrandMark(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
  const pad = Math.round(canvasW * 0.035);
  const pillH = Math.round(canvasW * 0.075);
  const pillW = Math.round(canvasW * 0.38);
  const x = canvasW - pad - pillW;
  const y = pad;
  const r = Math.round(pillH / 2);

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.moveTo(x + r + 2, y + 3);
  ctx.arcTo(x + pillW + 2, y + 3, x + pillW + 2, y + pillH + 3, r);
  ctx.arcTo(x + pillW + 2, y + pillH + 3, x + 2, y + pillH + 3, r);
  ctx.arcTo(x + 2, y + pillH + 3, x + 2, y + 3, r);
  ctx.arcTo(x + 2, y + 3, x + pillW + 2, y + 3, r);
  ctx.closePath();
  ctx.fill();

  const pillGrad = ctx.createLinearGradient(x, y, x + pillW, y + pillH);
  pillGrad.addColorStop(0, "rgba(139,92,246,0.85)");
  pillGrad.addColorStop(1, "rgba(109,40,217,0.85)");
  ctx.fillStyle = pillGrad;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r);
  ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r);
  ctx.arcTo(x, y + pillH, x, y, r);
  ctx.arcTo(x, y, x + pillW, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.font = `800 ${Math.round(pillH * 0.48)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚡ Neural Update", x + pillW / 2, y + pillH / 2);
}

/** CTA overlay — ONLY rendered on the LAST scene (scene === "cta") */
function drawCTAOverlay(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, fadeIn: number) {
  const alpha = clamp(fadeIn, 0, 1);

  ctx.fillStyle = `rgba(0,0,0,${0.7 * alpha})`;
  ctx.fillRect(0, 0, canvasW, canvasH);

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

  const handleSize = Math.round(fontSize * 0.65);
  ctx.font = `700 ${handleSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("@neuralupdate", canvasW / 2, btnY + btnH + handleSize * 1.5);

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
  isCTAScene?: boolean,
  ctaFade?: number,
  globalTime?: number,
  clearFirst: boolean = true
) {
  if (clearFirst) ctx.clearRect(0, 0, canvasW, canvasH);

  if (!img || !motion) {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvasW, canvasH);
    if (isCTAScene && ctaFade && ctaFade > 0) {
      drawCTAOverlay(ctx, canvasW, canvasH, ctaFade);
    } else if (text) {
      drawCaption(ctx, canvasW, canvasH, text);
    }
    drawBrandMark(ctx, canvasW, canvasH);
    return;
  }

  const eased = easeInOutCubic(clamp(t01, 0, 1));
  const scale = lerp(motion.startScale, motion.endScale, eased);
  const offX = lerp(motion.startX, motion.endX, eased);
  const offY = lerp(motion.startY, motion.endY, eased);

  // Blurred background
  const prevFilter = ctx.filter;
  ctx.filter = "blur(22px) brightness(0.7)";
  ctx.globalAlpha = 0.9;
  drawImageCover(ctx, img, canvasW, canvasH, scale * 1.25, offX * 0.1, offY * 0.1);
  ctx.filter = prevFilter;

  // Foreground
  ctx.globalAlpha = 1;
  drawImageCover(ctx, img, canvasW, canvasH, scale, offX, offY);

  // Vignette
  const v = ctx.createRadialGradient(canvasW / 2, canvasH / 2, canvasW * 0.15, canvasW / 2, canvasH / 2, canvasW * 0.9);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(0.6, "rgba(0,0,0,0.12)");
  v.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Top gradient for brand mark readability
  const topGrad = ctx.createLinearGradient(0, 0, 0, canvasH * 0.15);
  topGrad.addColorStop(0, "rgba(0,0,0,0.4)");
  topGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, canvasW, canvasH * 0.15);

  // CTA scene: show CTA overlay instead of caption
  if (isCTAScene) {
    const fade = ctaFade ?? 1;
    if (fade > 0) drawCTAOverlay(ctx, canvasW, canvasH, fade);
  } else {
    // Regular caption
    if (text) drawCaption(ctx, canvasW, canvasH, text);
  }

  drawBrandMark(ctx, canvasW, canvasH);

  // Title card in first 2.5 seconds
  if (globalTime !== undefined && globalTime < 2.5) {
    const titleAlpha = globalTime < 0.3 ? globalTime / 0.3 : globalTime > 1.8 ? Math.max(0, (2.5 - globalTime) / 0.7) : 1;
    if (titleAlpha > 0.01) {
      ctx.globalAlpha = titleAlpha * 0.85;
      const titleH = Math.round(canvasH * 0.12);
      const titleY = Math.round(canvasH * 0.38);
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(canvasW * 0.08, titleY, canvasW * 0.84, titleH);
      ctx.fillStyle = "rgba(139,92,246,0.9)";
      ctx.fillRect(canvasW * 0.08, titleY, 5, titleH);
      const titleFontSize = clamp(Math.round(canvasW * 0.04), 28, 48);
      ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("⚡ NEURAL UPDATE", canvasW / 2, titleY + titleH / 2);
      ctx.globalAlpha = 1;
    }
  }
}

// ─── Audio loading ───────────────────────────────────────────

async function fetchAudioBuffer(audioCtx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    console.log("[video-encoder] Loading audio:", url.substring(0, 80));
    let arrayBuffer: ArrayBuffer;
    if (url.startsWith("data:")) {
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
  const candidates = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm"];
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
  const timeline: Array<{ segment: VideoSegment; start: number; end: number; motion: MotionParams; isCTA: boolean }> = [];
  let cursor = 0;
  for (let i = 0; i < normalizedSegments.length; i++) {
    const segment = normalizedSegments[i];
    const isCTA = segment.scene === "cta" || i === normalizedSegments.length - 1;
    timeline.push({
      segment,
      start: cursor,
      end: cursor + segment.duration,
      motion: getMotionParamsForSegment(segment, width, height),
      isCTA,
    });
    cursor += segment.duration;
  }
  const totalDurationSec = cursor;
  const expectedDurationMs = Math.round(totalDurationSec * 1000);

  console.log("[video-encoder] Timeline:", totalDurationSec.toFixed(1), "s,", timeline.length, "segments");
  console.log("[video-encoder] Scenes:", timeline.map(t => `${t.segment.scene || 'scene'}(${t.segment.duration}s${t.isCTA ? ',CTA' : ''})`).join(" → "));
  console.log("[video-encoder] Audio:", !!audioUrl, "| CTA:", !!ctaAudioUrl, "| Music:", !!backgroundMusicUrl);

  // ─── Canvas setup ───
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context indisponível");

  // ─── Audio setup ───
  const audioCtx = getAudioContext();
  if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
  const dest = audioCtx.createMediaStreamDestination();

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
  await Promise.all(normalizedSegments.map(async (s) => {
    if (!imageMap.has(s.imageUrl)) imageMap.set(s.imageUrl, await loadImage(s.imageUrl));
  }));

  // ─── Combine canvas video + audio streams ───
  const canvasStream = canvas.captureStream(0);
  const canvasTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const combinedStream = new MediaStream();
  for (const track of canvasStream.getVideoTracks()) combinedStream.addTrack(track);
  for (const track of dest.stream.getAudioTracks()) combinedStream.addTrack(track);

  const mimeType = pickBestMimeType();
  console.log("[video-encoder] Using codec:", mimeType);

  const mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: DEFAULT_VIDEO_BPS });
  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  return new Promise((resolve) => {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    mediaRecorder.onstop = async () => {
      if (timerId) clearTimeout(timerId);
      const rawBlob = new Blob(chunks, { type: "video/webm" });
      try { resolve(await fixWebmDuration(rawBlob, expectedDurationMs || 1000)); }
      catch { resolve(rawBlob); }
    };

    // ─── Audio playback ───
    const audioStartTime = audioCtx.currentTime + 0.05;

    if (narrationBuffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = narrationBuffer;
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      src.connect(gain); gain.connect(dest);
      src.start(audioStartTime);
      console.log("[video-encoder] ▶ Narration started");
    }

    // CTA audio: play at the START of the CTA scene (last scene)
    if (ctaBuffer) {
      const ctaSceneEntry = timeline.find(t => t.isCTA);
      const ctaStartOffset = ctaSceneEntry ? ctaSceneEntry.start : Math.max(0, totalDurationSec - 3);
      const src = audioCtx.createBufferSource();
      src.buffer = ctaBuffer;
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      src.connect(gain); gain.connect(dest);
      src.start(audioStartTime + ctaStartOffset);
      console.log("[video-encoder] ▶ CTA audio at", ctaStartOffset.toFixed(1), "s");
    }

    if (musicBuffer) {
      const src = audioCtx.createBufferSource();
      src.buffer = musicBuffer;
      src.loop = true;
      const gain = audioCtx.createGain();
      gain.gain.value = narrationBuffer ? 0.18 : 0.5;
      src.connect(gain); gain.connect(dest);
      src.start(audioStartTime);
      src.stop(audioStartTime + totalDurationSec + 0.5);
      console.log("[video-encoder] ▶ Music started (vol:", gain.gain.value, ")");
    }

    // ─── Recording loop ───
    mediaRecorder.start(1000);
    const startedAt = performance.now();
    let lastRenderedAt = 0;
    let loggedTexts = false;
    const minFrameMs = 1000 / fps;

    const tick = () => {
      const now = performance.now();
      const elapsedSeconds = (now - startedAt) / 1000;
      const boundedElapsed = Math.min(elapsedSeconds, totalDurationSec);

      if (now - lastRenderedAt >= minFrameMs * 0.85) {
        lastRenderedAt = now;

        let idx = timeline.findIndex((e) => boundedElapsed >= e.start && boundedElapsed < e.end);
        if (idx === -1) idx = timeline.length - 1;

        const current = timeline[idx];
        const currentImg = imageMap.get(current.segment.imageUrl) ?? null;
        const localT = current.end > current.start ? clamp((boundedElapsed - current.start) / (current.end - current.start), 0, 1) : 1;

        // CTA fade only for the CTA scene
        const ctaFade = current.isCTA ? clamp(localT * 2, 0, 1) : 0;

        const secondsToEnd = current.end - boundedElapsed;
        const canTransition = idx < timeline.length - 1;
        const isTransition = canTransition && secondsToEnd <= TRANSITION_SECONDS;

        if (!loggedTexts) {
          console.log("[video-encoder] Segment texts:", timeline.map(t => `[${t.segment.scene || '?'}] "${(t.segment.text || '').substring(0, 30)}"`));
          loggedTexts = true;
        }

        if (!isTransition) {
          drawScene(ctx, currentImg, width, height, current.motion, localT, current.segment.text, current.isCTA, ctaFade, boundedElapsed);
        } else {
          const mix = clamp(1 - secondsToEnd / TRANSITION_SECONDS, 0, 1);
          const next = timeline[idx + 1];
          const nextImg = imageMap.get(next.segment.imageUrl) ?? null;

          ctx.globalAlpha = 1;
          drawScene(ctx, currentImg, width, height, current.motion, localT, current.segment.text, current.isCTA, ctaFade, boundedElapsed, true);
          ctx.globalAlpha = mix;
          drawScene(ctx, nextImg, width, height, next.motion, clamp(mix * 0.18, 0, 0.18), next.segment.text, next.isCTA, next.isCTA ? mix : 0, boundedElapsed, false);
          ctx.globalAlpha = 1;
        }

        if (canvasTrack?.requestFrame) canvasTrack.requestFrame();

        const progress = totalDurationSec > 0 ? Math.round((boundedElapsed / totalDurationSec) * 100) : 100;
        onProgress?.(clamp(progress, 0, 100));
      }

      if (boundedElapsed >= totalDurationSec) { mediaRecorder.stop(); return; }
      timerId = setTimeout(tick, minFrameMs);
    };

    tick();
  });
}

export async function uploadVideoToStorage(videoBlob: Blob, supabaseClient: typeof supabase, bucket: string): Promise<string> {
  const fileName = `video_${Date.now()}.webm`;
  const { data, error } = await supabaseClient.storage.from(bucket).upload(fileName, videoBlob, { contentType: videoBlob.type, upsert: true });
  if (error) throw error;
  const { data: urlData } = supabaseClient.storage.from(bucket).getPublicUrl(data.path);
  return urlData.publicUrl;
}
