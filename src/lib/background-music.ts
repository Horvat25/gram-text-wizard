// Background music utilities for video generation
// Generates procedural ambient music using Web Audio API

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
  duration: number;
  genre: string;
  mood: string;
}

export function getRandomTrack(genre?: string): MusicTrack {
  const moods = ['epic', 'ambient', 'dramatic', 'inspiring'];
  const mood = moods[Math.floor(Math.random() * moods.length)];
  return { 
    id: `procedural-${mood}`, 
    name: `AI ${mood.charAt(0).toUpperCase() + mood.slice(1)}`, 
    url: '__procedural__', 
    duration: 60, 
    genre: genre || 'electronic', 
    mood 
  };
}

export async function preloadTrack(track: MusicTrack): Promise<string> {
  if (!track.url || track.url !== '__procedural__') return '';
  
  try {
    // Generate ambient music procedurally using AudioContext
    const duration = 60; // 60 seconds of music
    const sampleRate = 44100;
    const offline = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
    
    const mood = track.mood || 'ambient';
    
    // Base frequencies for different moods (all in minor/cinematic keys)
    const moodConfig: Record<string, { freqs: number[]; tempo: number; filterFreq: number }> = {
      epic: { freqs: [55, 82.41, 110, 130.81, 164.81], tempo: 0.8, filterFreq: 800 },
      ambient: { freqs: [65.41, 82.41, 98, 130.81, 146.83], tempo: 0.3, filterFreq: 600 },
      dramatic: { freqs: [55, 69.3, 82.41, 110, 138.59], tempo: 1.0, filterFreq: 1000 },
      inspiring: { freqs: [73.42, 92.5, 110, 146.83, 174.61], tempo: 0.6, filterFreq: 900 },
    };
    
    const config = moodConfig[mood] || moodConfig.ambient;
    
    // Create deep pad layers with slow LFO modulation
    for (let i = 0; i < config.freqs.length; i++) {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      const filter = offline.createBiquadFilter();
      const panner = offline.createStereoPanner();
      
      osc.type = i < 2 ? 'sine' : 'triangle';
      osc.frequency.value = config.freqs[i];
      
      // Slow detune for width
      osc.detune.setValueAtTime(Math.random() * 10 - 5, 0);
      
      // Gentle volume envelope
      const baseVol = 0.08 / config.freqs.length;
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(baseVol, 3);
      
      // Slow breathing effect
      for (let t = 3; t < duration - 2; t += 4 + Math.random() * 4) {
        const variation = baseVol * (0.6 + Math.random() * 0.4);
        gain.gain.linearRampToValueAtTime(variation, t);
      }
      gain.gain.linearRampToValueAtTime(0, duration);
      
      // Low-pass filter for warmth
      filter.type = 'lowpass';
      filter.frequency.value = config.filterFreq * (0.5 + i * 0.2);
      filter.Q.value = 0.7;
      
      // Stereo spread
      panner.pan.value = (i / config.freqs.length) * 1.6 - 0.8;
      
      osc.connect(filter).connect(gain).connect(panner).connect(offline.destination);
      osc.start(0);
      osc.stop(duration);
    }
    
    // Add subtle sub-bass pulse
    const subOsc = offline.createOscillator();
    const subGain = offline.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.value = config.freqs[0] / 2; // One octave below
    subGain.gain.setValueAtTime(0, 0);
    subGain.gain.linearRampToValueAtTime(0.06, 2);
    
    // Rhythmic pulse
    const pulseInterval = 60 / (config.tempo * 60); // BPM to seconds
    for (let t = 2; t < duration - 2; t += pulseInterval) {
      subGain.gain.setValueAtTime(0.06, t);
      subGain.gain.exponentialRampToValueAtTime(0.02, t + pulseInterval * 0.7);
    }
    subGain.gain.linearRampToValueAtTime(0, duration);
    
    subOsc.connect(subGain).connect(offline.destination);
    subOsc.start(0);
    subOsc.stop(duration);
    
    // Render to buffer
    const renderedBuffer = await offline.startRendering();
    
    // Convert to WAV data URL
    const wavBlob = audioBufferToWav(renderedBuffer);
    return URL.createObjectURL(wavBlob);
    
  } catch (e) {
    console.warn('[Music] Procedural generation failed:', e);
    return '';
  }
}

// Convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Interleave channels and write samples
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }
  
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
