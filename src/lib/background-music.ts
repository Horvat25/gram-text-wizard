/**
 * Royalty-free background music tracks for video generation
 * High-quality ambient/tech tracks for Instagram Reels and TikTok
 * All tracks are CC0 or Creative Commons licensed for commercial use
 */

export interface BackgroundTrack {
  id: string;
  name: string;
  url: string;
  duration: number; // seconds
  genre: string;
  mood: string;
}

// Free Music Archive - CC0 licensed tracks + additional sources
export const BACKGROUND_TRACKS: BackgroundTrack[] = [
  // Chad Crouch - Electronic/Ambient
  {
    id: "shipping-lanes",
    name: "Shipping Lanes",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Shipping_Lanes.mp3",
    duration: 189,
    genre: "ambient",
    mood: "futuristic",
  },
  {
    id: "algorithms",
    name: "Algorithms",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Algorithms.mp3",
    duration: 167,
    genre: "electronic",
    mood: "professional",
  },
  {
    id: "nightowl",
    name: "Night Owl",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Nightowl.mp3",
    duration: 223,
    genre: "electronic",
    mood: "motivational",
  },
  
  // Dee Yan-Key - Relaxing/Ambient
  {
    id: "morning-dew",
    name: "Morning Dew",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Dee_Yan-Key/relax/Dee_Yan-Key_-_05_-_morning_dew.mp3",
    duration: 180,
    genre: "cinematic",
    mood: "inspiring",
  },
  {
    id: "floating",
    name: "Floating",
    url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Dee_Yan-Key/relax/Dee_Yan-Key_-_02_-_floating.mp3",
    duration: 195,
    genre: "ambient",
    mood: "chill",
  },

  // Additional high-energy tracks
  {
    id: "tech-news-1",
    name: "Digital Innovation",
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=electronic-future-beats-117997.mp3",
    duration: 147,
    genre: "electronic",
    mood: "energetic",
  },
  {
    id: "tech-news-2",
    name: "Cyber World",
    url: "https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b0939c8.mp3?filename=cyberpunk-2099-10701.mp3",
    duration: 120,
    genre: "cyberpunk",
    mood: "futuristic",
  },
  {
    id: "ambient-tech-3",
    name: "Corporate Innovation",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=inspiring-cinematic-ambient-116199.mp3",
    duration: 195,
    genre: "cinematic",
    mood: "inspiring",
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
  const normalizedMood = mood.toLowerCase();
  
  // Try to match by mood
  let track = BACKGROUND_TRACKS.find(t => 
    t.mood.toLowerCase().includes(normalizedMood)
  );
  
  // Try to match by genre
  if (!track) {
    track = BACKGROUND_TRACKS.find(t => 
      t.genre.toLowerCase().includes(normalizedMood)
    );
  }
  
  // Mood-based selection
  if (!track) {
    if (normalizedMood.includes("tech") || normalizedMood.includes("news")) {
      track = BACKGROUND_TRACKS.find(t => t.mood === "futuristic" || t.mood === "professional");
    } else if (normalizedMood.includes("breaking") || normalizedMood.includes("urgent")) {
      track = BACKGROUND_TRACKS.find(t => t.mood === "energetic");
    } else if (normalizedMood.includes("inspire") || normalizedMood.includes("positive")) {
      track = BACKGROUND_TRACKS.find(t => t.mood === "inspiring");
    }
  }
  
  return track || getRandomTrack();
}

/**
 * Get track by topic content
 */
export function getTrackForTopic(topic: string): BackgroundTrack {
  const lowerTopic = topic.toLowerCase();
  
  if (lowerTopic.includes("breaking") || lowerTopic.includes("urgente") || lowerTopic.includes("alerta")) {
    return getTrackByMood("energetic");
  }
  if (lowerTopic.includes("futuro") || lowerTopic.includes("tecnologia") || lowerTopic.includes("ia") || lowerTopic.includes("ai")) {
    return getTrackByMood("futuristic");
  }
  if (lowerTopic.includes("análise") || lowerTopic.includes("entenda") || lowerTopic.includes("como")) {
    return getTrackByMood("professional");
  }
  if (lowerTopic.includes("sucesso") || lowerTopic.includes("incrível") || lowerTopic.includes("novidade")) {
    return getTrackByMood("inspiring");
  }
  
  return getRandomTrack();
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
    console.error(`[Music] Failed to preload ${track.name}:`, error);
    
    // Try fallback track
    const fallbackTrack = BACKGROUND_TRACKS.find(t => t.id !== track.id);
    if (fallbackTrack) {
      console.log(`[Music] Trying fallback: ${fallbackTrack.name}`);
      try {
        const response = await fetch(fallbackTrack.url);
        if (response.ok) {
          const blob = await response.blob();
          const dataUrl = await blobToDataUrl(blob);
          console.log(`[Music] ✅ Fallback loaded: ${fallbackTrack.name}`);
          return dataUrl;
        }
      } catch (e) {
        console.error(`[Music] Fallback also failed:`, e);
      }
    }
    
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
