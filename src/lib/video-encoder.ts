import fixWebmDuration from 'fix-webm-duration';
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

const MAX_TOTAL_DURATION_SECONDS = 55;
const MIN_SEGMENT_DURATION_SECONDS = 1;
const FALLBACK_SEGMENT_DURATION_SECONDS = 5;

function normalizeSegments(segments: VideoSegment[]): VideoSegment[] {
  const sanitized = segments
    .filter((segment) => !!segment.imageUrl)
    .map((segment) => {
      const parsed = Number(segment.duration);
      const duration = Number.isFinite(parsed) && parsed > 0
        ? parsed
        : FALLBACK_SEGMENT_DURATION_SECONDS;

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

function drawFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  width: number,
  height: number,
  text?: string
) {
  if (img) {
    ctx.drawImage(img, 0, 0, width, height);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
  }

  if (text) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, height - 200, width, 200);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, height - 100, width - 80);
  }
}

export async function generateVideoFromSegments(
  options: GenerateVideoOptions
): Promise<Blob> {
  const { segments, width = 1080, height = 1920, fps = 30, onProgress } = options;
  const normalizedSegments = normalizeSegments(segments);

  if (normalizedSegments.length === 0) {
    throw new Error('Nenhum segmento válido para renderizar vídeo');
  }

  const timeline: Array<{ segment: VideoSegment; start: number; end: number }> = [];
  let cursor = 0;
  for (const segment of normalizedSegments) {
    const start = cursor;
    const end = start + segment.duration;
    timeline.push({ segment, start, end });
    cursor = end;
  }

  const expectedDurationMs = Math.round(cursor * 1000);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context indisponível');

  canvas.width = width;
  canvas.height = height;

  const stream = canvas.captureStream(fps);
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 5000000,
  });

  const imageMap = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    normalizedSegments.map(async (segment) => {
      if (imageMap.has(segment.imageUrl)) return;

      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = segment.imageUrl;
      });

      imageMap.set(segment.imageUrl, loaded ? img : null);
    })
  );

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise(async (resolve) => {
    mediaRecorder.onstop = async () => {
      const rawBlob = new Blob(chunks, { type: 'video/webm' });

      try {
        const fixedBlob = await fixWebmDuration(rawBlob, expectedDurationMs || 1000);
        resolve(fixedBlob);
      } catch (error) {
        console.warn('[video-encoder] Failed to fix WebM duration metadata:', error);
        resolve(rawBlob);
      }
    };

    mediaRecorder.start();

    const startedAt = performance.now();

    const renderStep = () => {
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      const boundedElapsed = Math.min(elapsedSeconds, cursor);

      const active = timeline.find((entry) => boundedElapsed >= entry.start && boundedElapsed < entry.end)
        ?? timeline[timeline.length - 1];

      drawFrame(ctx, imageMap.get(active.segment.imageUrl) ?? null, width, height, active.segment.text);

      const progress = cursor > 0
        ? Math.round((boundedElapsed / cursor) * 100)
        : 100;
      onProgress?.(Math.min(100, Math.max(0, progress)));

      if (boundedElapsed >= cursor) {
        mediaRecorder.stop();
        return;
      }

      setTimeout(renderStep, Math.max(16, Math.round(1000 / fps)));
    };

    renderStep();
  });
}

export async function uploadVideoToStorage(
  videoBlob: Blob,
  supabaseClient: typeof supabase,
  bucket: string
): Promise<string> {
  const fileName = `video_${Date.now()}.webm`;
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

