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
    const duration = 60;
    const sampleRate = 44100;
    const offline = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
    
    const mood = track.mood || 'ambient';
    
    // Cinematic chord progressions (minor keys for tech/dramatic feel)
    const moodConfig: Record<string, { 
      chords: number[][]; tempo: number; filterFreq: number; 
      padVolume: number; bassVolume: number; arpVolume: number;
    }> = {
      epic: { 
        chords: [[55, 65.41, 82.41, 110], [61.74, 73.42, 92.5, 123.47], [49, 58.27, 73.42, 98], [55, 69.3, 82.41, 110]],
        tempo: 0.9, filterFreq: 1400, padVolume: 0.08, bassVolume: 0.07, arpVolume: 0.04
      },
      ambient: { 
        chords: [[65.41, 82.41, 98, 130.81], [73.42, 87.31, 110, 146.83], [55, 65.41, 82.41, 110], [61.74, 73.42, 92.5, 123.47]],
        tempo: 0.4, filterFreq: 1000, padVolume: 0.07, bassVolume: 0.05, arpVolume: 0.03
      },
      dramatic: { 
        chords: [[55, 65.41, 82.41, 110], [49, 61.74, 73.42, 98], [58.27, 69.3, 87.31, 116.54], [55, 69.3, 82.41, 110]],
        tempo: 1.0, filterFreq: 1600, padVolume: 0.09, bassVolume: 0.08, arpVolume: 0.05
      },
      inspiring: { 
        chords: [[73.42, 92.5, 110, 146.83], [82.41, 98, 123.47, 164.81], [65.41, 82.41, 98, 130.81], [73.42, 87.31, 110, 146.83]],
        tempo: 0.7, filterFreq: 1200, padVolume: 0.08, bassVolume: 0.06, arpVolume: 0.04
      },
    };
    
    const config = moodConfig[mood] || moodConfig.ambient;
    const chordDuration = 8; // seconds per chord
    
    // ═══ LAYER 1: Warm evolving pad (main harmonic body) ═══
    for (let chordIdx = 0; chordIdx < Math.ceil(duration / chordDuration); chordIdx++) {
      const chord = config.chords[chordIdx % config.chords.length];
      const chordStart = chordIdx * chordDuration;
      
      for (let noteIdx = 0; noteIdx < chord.length; noteIdx++) {
        const osc = offline.createOscillator();
        const gain = offline.createGain();
        const filter = offline.createBiquadFilter();
        const panner = offline.createStereoPanner();
        
        // Mix sine and triangle for warmth
        osc.type = noteIdx < 2 ? 'sine' : 'triangle';
        osc.frequency.value = chord[noteIdx];
        // Slight detune for chorus/width effect
        osc.detune.value = (noteIdx - 1.5) * 4;
        
        // Smooth fade in/out per chord
        const vol = config.padVolume / chord.length;
        gain.gain.setValueAtTime(0, chordStart);
        gain.gain.linearRampToValueAtTime(vol, chordStart + 1.5);
        gain.gain.setValueAtTime(vol, chordStart + chordDuration - 2);
        gain.gain.linearRampToValueAtTime(0, chordStart + chordDuration);
        
        // Slow filter sweep for movement
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(config.filterFreq * 0.5, chordStart);
        filter.frequency.linearRampToValueAtTime(config.filterFreq, chordStart + chordDuration * 0.6);
        filter.frequency.linearRampToValueAtTime(config.filterFreq * 0.7, chordStart + chordDuration);
        filter.Q.value = 0.5;
        
        // Stereo spread
        panner.pan.value = (noteIdx / (chord.length - 1)) * 1.4 - 0.7;
        
        osc.connect(filter).connect(gain).connect(panner).connect(offline.destination);
        osc.start(chordStart);
        osc.stop(Math.min(chordStart + chordDuration + 0.1, duration));
      }
    }
    
    // ═══ LAYER 2: Deep sub-bass with rhythmic pulse ═══
    for (let chordIdx = 0; chordIdx < Math.ceil(duration / chordDuration); chordIdx++) {
      const chord = config.chords[chordIdx % config.chords.length];
      const chordStart = chordIdx * chordDuration;
      const bassFreq = chord[0] / 2; // One octave below root
      
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      const filter = offline.createBiquadFilter();
      
      osc.type = 'sine';
      osc.frequency.value = bassFreq;
      
      filter.type = 'lowpass';
      filter.frequency.value = 120;
      filter.Q.value = 1.0;
      
      // Gentle rhythmic pulse
      const pulseRate = config.tempo * 2;
      for (let t = chordStart; t < chordStart + chordDuration && t < duration; t += pulseRate) {
        gain.gain.setValueAtTime(config.bassVolume * 0.3, t);
        gain.gain.linearRampToValueAtTime(config.bassVolume, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(config.bassVolume * 0.4, t + pulseRate * 0.8);
      }
      
      // Fade at chord boundaries
      gain.gain.setValueAtTime(0, chordStart);
      gain.gain.linearRampToValueAtTime(config.bassVolume * 0.5, chordStart + 0.5);
      
      osc.connect(filter).connect(gain).connect(offline.destination);
      osc.start(chordStart);
      osc.stop(Math.min(chordStart + chordDuration + 0.1, duration));
    }
    
    // ═══ LAYER 3: Subtle arpeggiated high notes (shimmer) ═══
    for (let chordIdx = 0; chordIdx < Math.ceil(duration / chordDuration); chordIdx++) {
      const chord = config.chords[chordIdx % config.chords.length];
      const chordStart = chordIdx * chordDuration;
      
      // Play higher octave notes in sequence
      const arpNotes = chord.map(f => f * 2); // One octave up
      const noteInterval = chordDuration / (arpNotes.length * 2);
      
      for (let i = 0; i < arpNotes.length * 2; i++) {
        const noteStart = chordStart + i * noteInterval + 2; // Start arp after 2s
        if (noteStart >= duration - 1) break;
        
        const osc = offline.createOscillator();
        const gain = offline.createGain();
        const filter = offline.createBiquadFilter();
        const panner = offline.createStereoPanner();
        
        osc.type = 'sine';
        osc.frequency.value = arpNotes[i % arpNotes.length];
        
        // Short, bell-like envelope
        const noteDur = noteInterval * 1.5;
        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(config.arpVolume, noteStart + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDur);
        
        filter.type = 'lowpass';
        filter.frequency.value = config.filterFreq * 1.5;
        filter.Q.value = 0.3;
        
        // Alternate stereo
        panner.pan.value = (i % 2 === 0) ? -0.5 : 0.5;
        
        osc.connect(filter).connect(gain).connect(panner).connect(offline.destination);
        osc.start(noteStart);
        osc.stop(Math.min(noteStart + noteDur + 0.1, duration));
      }
    }
    
    // ═══ GLOBAL: Fade in/out ═══
    const masterGain = offline.createGain();
    masterGain.gain.setValueAtTime(0, 0);
    masterGain.gain.linearRampToValueAtTime(1, 2);
    masterGain.gain.setValueAtTime(1, duration - 3);
    masterGain.gain.linearRampToValueAtTime(0, duration);
    // Note: masterGain not connected to individual nodes since they connect directly
    // The fade is handled per-layer above
    
    const renderedBuffer = await offline.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);
    return URL.createObjectURL(wavBlob);
    
  } catch (e) {
    console.warn('[Music] Procedural generation failed:', e);
    return '';
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
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
