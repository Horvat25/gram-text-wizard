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

// Free royalty-free music from multiple sources (all free for commercial use)
// Updated February 2026 with working CDN links
export const BACKGROUND_TRACKS: BackgroundTrack[] = [
  {
    id: "ambient-tech-1",
    name: "Ambient Corporate",
    // Free Music Archive - CC0 licensed
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Shipping_Lanes.mp3",
    duration: 189,
    genre: "ambient",
    mood: "futuristic",
  },
  {
    id: "ambient-tech-2", 
    name: "Inspiring Piano",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Dee_Yan-Key/relax/Dee_Yan-Key_-_05_-_morning_dew.mp3",
    duration: 180,
    genre: "cinematic",
    mood: "inspiring",
  },
  {
    id: "ambient-tech-3",
    name: "Electronic Future",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Algorithms.mp3",
    duration: 167,
    genre: "electronic",
    mood: "professional",
  },
  {
    id: "ambient-tech-4",
    name: "Chill Atmospheric",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Dee_Yan-Key/relax/Dee_Yan-Key_-_02_-_floating.mp3",
    duration: 195,
    genre: "ambient",
    mood: "chill",
  },
  {
    id: "ambient-tech-5",
    name: "Tech News Background",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Nightowl.mp3",
    duration: 223,
    genre: "electronic",
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
