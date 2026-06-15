import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();

export async function initFFmpeg(): Promise<boolean> {
  if (ffmpeg.loaded) return true;
  try {
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return true;
  } catch (error) {
    console.warn('[video-converter] FFmpeg failed to initialize:', error);
    return false;
  }
}

export async function convertWebMToMP4(webmBlob: Blob): Promise<Blob> {
  try {
    const ready = await initFFmpeg();
    if (!ready) {
      console.warn('[video-converter] FFmpeg not ready, returning original WebM');
      return webmBlob;
    }

    console.log('[video-converter] Converting WebM to MP4 (H.264/AAC)...');
    const arrayBuffer = await webmBlob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    await ffmpeg.writeFile('input.webm', data);
    
    // Converte usando libx264 e aac (compatíveis com o Reels do Instagram)
    // Preset ultrafast para conversão rápida no thread de background do navegador
    await ffmpeg.exec([
      '-i', 'input.webm',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-pix_fmt', 'yuv420p',
      '-b:v', '1.5M',
      '-preset', 'ultrafast',
      'output.mp4'
    ]);
    
    const outputData = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
    const mp4Blob = new Blob([outputData], { type: 'video/mp4' });
    
    console.log(`[video-converter] Conversion complete! MP4 size: ${(mp4Blob.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Limpa a memória virtual do WASM
    await ffmpeg.deleteFile('input.webm').catch(() => {});
    await ffmpeg.deleteFile('output.mp4').catch(() => {});
    
    return mp4Blob;
  } catch (error) {
    console.error('[video-converter] Error during conversion, using fallback original WebM:', error);
    return webmBlob;
  }
}
