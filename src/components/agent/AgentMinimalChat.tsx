import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Mic, Loader2, Sparkles, CalendarDays, Image as ImageIcon, Newspaper, ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpeechRecognitionEvent extends Event { results: SpeechRecognitionResultList; }
interface SpeechRecognitionErrorEvent extends Event { error: string; }
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface AgentMinimalChatProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

const QUICK_SUGGESTIONS = [
  { icon: Sparkles, label: 'Gerar Reel agora', prompt: 'Gere um Reel agora sobre o tema mais quente de tecnologia/IA das últimas 24h.' },
  { icon: CalendarDays, label: 'Agendar amanhã 11h', prompt: 'Crie e agende um post para amanhã às 11h.' },
  { icon: Newspaper, label: 'Carrossel da semana', prompt: 'Crie um carrossel de 3 slides com o resumo das principais notícias de IA da semana.' },
  { icon: ImageIcon, label: 'Post imagem editorial', prompt: 'Crie um post de imagem editorial sobre uma tendência emergente em IA.' },
  { icon: ListTodo, label: 'Ver fila e próximos', prompt: 'Me mostre o que está na fila e quais são os próximos posts agendados.' },
];

export default function AgentMinimalChat({
  onSend,
  isLoading,
  placeholder = 'Peça algo ao agente — ele cria, agenda e publica…'
}: AgentMinimalChatProps) {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    const next = Math.min(ta.scrollHeight, 160);
    ta.style.height = `${Math.max(40, next)}px`;
  }, [input]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setInput('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleSend = (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;
    onSend(text);
    setInput('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative z-20 px-3 pb-4 pt-1">
      <div className="max-w-2xl mx-auto space-y-2">
        {/* Quick suggestions */}
        {showSuggestions && !input && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5 px-0.5">
            {QUICK_SUGGESTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.label}
                  onClick={() => handleSend(s.prompt)}
                  disabled={isLoading}
                  className={cn(
                    'shrink-0 group flex items-center gap-1.5 px-2.5 py-1 rounded-full',
                    'border border-border/60 bg-card/70 backdrop-blur-md',
                    'text-[11px] font-medium text-foreground/80',
                    'hover:border-primary/50 hover:text-foreground hover:bg-card/90',
                    'transition-all duration-200',
                    'disabled:opacity-40'
                  )}
                >
                  <Icon className="h-3 w-3 text-primary group-hover:scale-110 transition-transform" />
                  {s.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Composer */}
        <div
          className={cn(
            'relative rounded-2xl transition-all duration-300',
            'bg-card/80 backdrop-blur-xl border',
            focused
              ? 'border-primary/60 shadow-[0_0_0_3px_hsl(var(--primary)/0.12),0_8px_32px_-12px_hsl(var(--primary)/0.45)]'
              : 'border-border/60 shadow-lg shadow-background/40'
          )}
        >
          {/* Animated gradient border on focus */}
          {focused && (
            <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-50 [background:linear-gradient(135deg,hsl(var(--portal-cyan)/0.25),transparent_40%,hsl(var(--portal-purple)/0.25))]" />
          )}

          <div className="relative flex items-end gap-1.5 p-1.5">
            <button
              type="button"
              onClick={() => setShowSuggestions((s) => !s)}
              className={cn(
                'h-9 w-9 shrink-0 rounded-xl flex items-center justify-center',
                'text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors',
                showSuggestions && 'text-primary bg-primary/10'
              )}
              title="Sugestões"
            >
              <Sparkles className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholder}
              disabled={isLoading}
              rows={1}
              className={cn(
                'flex-1 resize-none bg-transparent border-0 outline-none',
                'text-sm leading-snug placeholder:text-muted-foreground/50',
                'px-1 py-2 max-h-40 min-h-[40px]',
                'scrollbar-hide'
              )}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleListening}
              disabled={isLoading}
              className={cn(
                'h-9 w-9 shrink-0 rounded-xl',
                isListening && 'bg-destructive/15 text-destructive animate-pulse'
              )}
              title="Falar"
            >
              <Mic className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className={cn(
                'h-9 w-9 shrink-0 rounded-xl neural-gradient',
                'shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.6)]',
                'hover:shadow-[0_6px_24px_-4px_hsl(var(--primary)/0.8)]',
                'transition-shadow disabled:shadow-none disabled:opacity-50'
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Status hint */}
          {(isLoading || isListening) && (
            <div className="px-4 pb-2 -mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
              </span>
              {isListening ? 'Ouvindo… fale agora' : 'Agente pensando, buscando dados e criando…'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
