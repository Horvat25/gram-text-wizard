/**
 * Audio Unlock Utility
 * 
 * Browsers block AudioContext when created without user gesture.
 * This utility pre-unlocks audio on user click so video encoding works.
 */

let globalAudioContext: AudioContext | null = null;
let isUnlocked = false;

/**
 * Get or create the global AudioContext
 */
export function getAudioContext(): AudioContext {
  if (!globalAudioContext) {
    globalAudioContext = new AudioContext();
  }
  return globalAudioContext;
}

/**
 * Unlock audio - MUST be called synchronously in a click handler
 * Call this BEFORE any await in your click handler
 */
export function unlockAudio(): AudioContext {
  const ctx = getAudioContext();
  
  // Resume if suspended (this is what "unlocks" it)
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => {
      console.log('[AudioUnlock] AudioContext resumed successfully');
      isUnlocked = true;
    }).catch(err => {
      console.warn('[AudioUnlock] Failed to resume AudioContext:', err);
    });
  } else {
    isUnlocked = true;
  }
  
  // Play a silent buffer to fully unlock on iOS/Safari
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    console.log('[AudioUnlock] Silent buffer played for iOS unlock');
  } catch (e) {
    // Ignore errors - this is just a safety measure
  }
  
  return ctx;
}

/**
 * Check if audio is unlocked
 */
export function isAudioUnlocked(): boolean {
  return isUnlocked && globalAudioContext?.state === 'running';
}

/**
 * Ensure AudioContext is ready for use
 */
export async function ensureAudioReady(): Promise<AudioContext> {
  const ctx = getAudioContext();
  
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
      console.log('[AudioUnlock] AudioContext resumed in ensureAudioReady');
    } catch (e) {
      console.warn('[AudioUnlock] Could not resume AudioContext:', e);
    }
  }
  
  return ctx;
}

/**
 * Close and cleanup the global AudioContext
 */
export function closeAudioContext(): void {
  if (globalAudioContext) {
    globalAudioContext.close().catch(() => {});
    globalAudioContext = null;
    isUnlocked = false;
  }
}
