import { supabase } from '@/integrations/supabase/client';

export interface VideoSegment {
  imageUrl: string;
  duration: number;
  text?: string;
}

export async function generateVideoFromSegments(
  segments: VideoSegment[],
  audioBlob?: Blob,
  options?: { width?: number; height?: number; fps?: number }
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const width = options?.width || 1080;
  const height = options?.height || 1920;
  const fps = options?.fps || 30;

  canvas.width = width;
  canvas.height = height;

  const stream = canvas.captureStream(fps);
  
  if (audioBlob) {
    try {
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(await audioBlob.arrayBuffer());
      const source = audioCtx.createMediaStreamDestination();
      const bufferSource = audioCtx.createBufferSource();
      bufferSource.buffer = audioBuffer;
      bufferSource.connect(source);
      bufferSource.start();
      source.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    } catch (e) {
      console.warn('Could not add audio to video:', e);
    }
  }

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
        await new Promise(r => setTimeout(r, 1000 / fps));
      }
    }

    mediaRecorder.stop();
  });
}

export async function uploadVideoToStorage(
  videoBlob: Blob,
  fileName: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('videos')
    .upload(fileName, videoBlob, {
      contentType: videoBlob.type,
      upsert: true,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('videos')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}
