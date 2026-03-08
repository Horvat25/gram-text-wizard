// Background music utilities for video generation

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
  duration: number;
  genre: string;
}

const tracks: MusicTrack[] = [];

export function getRandomTrack(genre?: string): MusicTrack | null {
  const filtered = genre ? tracks.filter(t => t.genre === genre) : tracks;
  if (filtered.length === 0) return null;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export async function preloadTrack(track: MusicTrack): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(track.url);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new AudioContext();
    return await audioCtx.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.warn('Failed to preload track:', error);
    return null;
  }
}
