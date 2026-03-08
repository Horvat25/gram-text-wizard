// Browser TTS utilities

export function estimateSpeechDuration(text: string, wordsPerMinute: number = 150): number {
  const words = text.trim().split(/\s+/).length;
  return (words / wordsPerMinute) * 60;
}

export async function speak(text: string, voice?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Speech synthesis not supported'));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
    speechSynthesis.speak(utterance);
  });
}
