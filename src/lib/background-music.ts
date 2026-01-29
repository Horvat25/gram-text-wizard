/**
 * Royalty-free background music tracks for video generation
 * These are ambient/tech tracks suitable for Instagram Reels and TikTok
 */

export interface BackgroundTrack {
  id: string;
  name: string;
  url: string;
  duration: number; // seconds
  genre: string;
  mood: string;
}

// Free royalty-free music from Pixabay (Attribution not required)
export const BACKGROUND_TRACKS: BackgroundTrack[] = [
  {
    id: "ambient-tech-1",
    name: "Documentary Technology",
    url: "https://cdn.pixabay.com/audio/2024/11/29/audio_df9986a9e5.mp3",
    duration: 127,
    genre: "ambient",
    mood: "futuristic",
  },
  {
    id: "ambient-tech-2", 
    name: "Inspiring Cinematic",
    url: "https://cdn.pixabay.com/audio/2024/02/14/audio_08c65bdc9e.mp3",
    duration: 146,
    genre: "cinematic",
    mood: "inspiring",
  },
  {
    id: "ambient-tech-3",
    name: "Technology Corporate",
    url: "https://cdn.pixabay.com/audio/2024/09/10/audio_6e5d7d1912.mp3",
    duration: 120,
    genre: "corporate",
    mood: "professional",
  },
  {
    id: "ambient-tech-4",
    name: "Chill Electronic",
    url: "https://cdn.pixabay.com/audio/2024/08/08/audio_ad5cc3f5a0.mp3",
    duration: 130,
    genre: "electronic",
    mood: "chill",
  },
  {
    id: "ambient-tech-5",
    name: "Motivational Future Bass",
    url: "https://cdn.pixabay.com/audio/2023/10/08/audio_6e6e8db875.mp3",
    duration: 158,
    genre: "future bass",
    mood: "motivational",
  },
];

/**
 * Get a random background track
 */
export function getRandomTrack(): BackgroundTrack {
  const index = Math.floor(Math.random() * BACKGROUND_TRACKS.length);
  return BACKGROUND_TRACKS[index];
}

/**
 * Get a track by mood preference
 */
export function getTrackByMood(mood: string): BackgroundTrack {
  const track = BACKGROUND_TRACKS.find(t => 
    t.mood.toLowerCase().includes(mood.toLowerCase()) ||
    t.genre.toLowerCase().includes(mood.toLowerCase())
  );
  return track || getRandomTrack();
}

/**
 * Preload a track and return its data URL for offline use
 */
export async function preloadTrack(track: BackgroundTrack): Promise<string> {
  try {
    console.log(`[Music] Preloading track: ${track.name}`);
    const response = await fetch(track.url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch track: ${response.status}`);
    }
    
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    
    console.log(`[Music] ✅ Track preloaded: ${track.name} (${Math.round(blob.size / 1024)}KB)`);
    return dataUrl;
  } catch (error) {
    console.error(`[Music] Failed to preload track:`, error);
    throw error;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
