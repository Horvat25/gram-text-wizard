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

export async function generateVideoFromSegments(
  options: GenerateVideoOptions
): Promise<Blob> {
  const { segments, width = 1080, height = 1920, fps = 30, onProgress } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = width;
  canvas.height = height;

  const stream = canvas.captureStream(fps);

  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 5000000,
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise(async (resolve) => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };

    mediaRecorder.start();

    const totalFrames = segments.reduce((sum, s) => sum + Math.round(s.duration * fps), 0);
    let processedFrames = 0;

    for (const segment of segments) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.onerror = () => res();
        img.src = segment.imageUrl;
      });

      const frames = Math.round(segment.duration * fps);
      for (let i = 0; i < frames; i++) {
        ctx.drawImage(img, 0, 0, width, height);
        if (segment.text) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(0, height - 200, width, 200);
          ctx.fillStyle = 'white';
          ctx.font = 'bold 36px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(segment.text, width / 2, height - 100, width - 80);
        }
        processedFrames++;
        onProgress?.(Math.round((processedFrames / totalFrames) * 100));
        await new Promise(r => setTimeout(r, 1000 / fps));
      }
    }

    mediaRecorder.stop();
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
