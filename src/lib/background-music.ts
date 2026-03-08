// Background music utilities for video generation

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
  duration: number;
  genre: string;
  mood: string;
}

const tracks: MusicTrack[] = [];

export function getRandomTrack(genre?: string): MusicTrack {
  const filtered = genre ? tracks.filter(t => t.genre === genre) : tracks;
  if (filtered.length === 0) {
    return { id: 'default', name: 'Ambient', url: '', duration: 60, genre: 'ambient', mood: 'calm' };
  }
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export async function preloadTrack(track: MusicTrack): Promise<string> {
  if (!track.url) return '';
  return track.url;
}
