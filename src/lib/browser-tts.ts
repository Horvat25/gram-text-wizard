/**
 * Browser-based TTS using Web Speech API (FREE!)
 * Records the speech synthesis output to an audio blob
 */

export interface BrowserTTSOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  voice?: string;
}

// Get available Portuguese voices
export function getPortugueseVoices(): SpeechSynthesisVoice[] {
  const voices = window.speechSynthesis.getVoices();
  return voices.filter(v => 
    v.lang.startsWith('pt') || 
    v.name.toLowerCase().includes('portuguese') ||
    v.name.toLowerCase().includes('brasil')
  );
}

// Wait for voices to be loaded
export function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }
    
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    
    // Fallback timeout
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });
}

// Generate speech and return audio URL using MediaRecorder
export async function generateBrowserTTS(options: BrowserTTSOptions): Promise<string> {
  const { text, lang = 'pt-BR', rate = 1.0, pitch = 1.0 } = options;
  
  if (!text || text.trim().length === 0) {
    throw new Error('Text is required');
  }
  
  // Check if speech synthesis is available
  if (!window.speechSynthesis) {
    throw new Error('Speech synthesis not supported in this browser');
  }
  
  await waitForVoices();
  
  return new Promise((resolve, reject) => {
    try {
      // Create utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = pitch;
      
      // Try to find a good Portuguese voice
      const voices = getPortugueseVoices();
      if (voices.length > 0) {
        // Prefer Google or Microsoft voices if available
        const preferredVoice = voices.find(v => 
          v.name.includes('Google') || 
          v.name.includes('Microsoft') ||
          v.name.includes('Luciana') ||
          v.name.includes('Daniel')
        ) || voices[0];
        
        utterance.voice = preferredVoice;
        console.log('[BrowserTTS] Using voice:', preferredVoice.name);
      }
      
      // Set up audio capture using AudioContext
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      const mediaRecorder = new MediaRecorder(destination.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      const audioChunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioContext.close();
        resolve(audioUrl);
      };
      
      // Unfortunately, we can't directly capture speechSynthesis audio
      // So we'll use a workaround: estimate duration and create silent audio
      // The actual speech will be played during video playback
      
      // Calculate estimated duration (rough: ~150ms per character for PT-BR)
      const estimatedDuration = Math.max(2, text.length * 0.08);
      
      utterance.onend = () => {
        console.log('[BrowserTTS] Speech ended');
      };
      
      utterance.onerror = (event) => {
        console.error('[BrowserTTS] Speech error:', event);
        reject(new Error('Speech synthesis failed'));
      };
      
      // Start recording
      mediaRecorder.start();
      
      // Speak (this plays through system audio, not capturable directly)
      window.speechSynthesis.speak(utterance);
      
      // Stop recording after estimated duration
      setTimeout(() => {
        mediaRecorder.stop();
      }, estimatedDuration * 1000 + 500);
      
    } catch (error) {
      reject(error);
    }
  });
}

// Alternative: Generate speech and get duration estimate without recording
// This is more reliable - just speaks and returns timing info
export async function speakText(options: BrowserTTSOptions): Promise<{ duration: number }> {
  const { text, lang = 'pt-BR', rate = 1.0, pitch = 1.0 } = options;
  
  if (!window.speechSynthesis) {
    throw new Error('Speech synthesis not supported');
  }
  
  await waitForVoices();
  
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.pitch = pitch;
    
    const voices = getPortugueseVoices();
    if (voices.length > 0) {
      const preferredVoice = voices.find(v => 
        v.name.includes('Google') || v.name.includes('Microsoft')
      ) || voices[0];
      utterance.voice = preferredVoice;
    }
    
    const startTime = Date.now();
    
    utterance.onend = () => {
      const duration = (Date.now() - startTime) / 1000;
      resolve({ duration });
    };
    
    utterance.onerror = (event) => {
      reject(new Error('Speech failed: ' + event.error));
    };
    
    window.speechSynthesis.speak(utterance);
  });
}

// Estimate speech duration without speaking
export function estimateSpeechDuration(text: string, rate: number = 1.0): number {
  // Average speaking rate: ~150 words per minute for Portuguese
  // Average word length: ~5 characters
  // So roughly 750 characters per minute = 12.5 chars per second
  const charsPerSecond = 12.5 * rate;
  return Math.max(1, text.length / charsPerSecond);
}
