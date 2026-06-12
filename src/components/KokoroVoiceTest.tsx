import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Volume2, Mic2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { synthesizeWithKokoro, preloadKokoro, type KokoroVoiceId } from '@/lib/kokoro-voice';

const DEFAULT_SAMPLE =
  'Teste da voz Kokoro em português brasileiro. O Neural Update traz as principais novidades de tecnologia e inteligência artificial de dois mil e vinte e seis.';

const VOICES: { id: KokoroVoiceId; label: string }[] = [
  { id: 'dora', label: 'Dora - feminina editorial' },
  { id: 'alex', label: 'Alex - masculino tech' },
  { id: 'santa', label: 'Santa - grave/personagem' },
];

export default function KokoroVoiceTest() {
  const [text, setText] = useState(DEFAULT_SAMPLE);
  const [voice, setVoice] = useState<KokoroVoiceId>('dora');
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Pré-carrega o modelo (~80 MB, uma vez; depois fica em cache do navegador)
  useEffect(() => {
    preloadKokoro();
  }, []);

  const handleTest = async () => {
    if (!text.trim()) {
      toast.error('Digite um texto para narrar');
      return;
    }
    setLoading(true);
    setAudioUrl(null);
    setDuration(null);
    try {
      const result = await synthesizeWithKokoro(text, { voice });
      if (!result?.audioUrl) throw new Error('Kokoro não retornou áudio');
      setAudioUrl(result.audioUrl);
      setDuration(result.duration);
      setTimeout(() => audioRef.current?.play().catch(() => {}), 100);
      toast.success(`Voz ${VOICES.find((v) => v.id === voice)?.label.split(' - ')[0]} gerada (${result.duration.toFixed(1)}s)`);
    } catch (e: any) {
      console.error('[KokoroVoiceTest] erro:', e);
      toast.error(e.message || 'Erro ao gerar narração');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `kokoro-${voice}-${Date.now()}.wav`;
    a.click();
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Mic2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Teste de Voz — Kokoro TTS</h3>
              <p className="text-[11px] text-muted-foreground">
                Vozes nativas PT-BR · roda 100% no navegador · custo zero
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">grátis · ilimitado</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select value="kokoro" disabled>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kokoro">Kokoro TTS</SelectItem>
            </SelectContent>
          </Select>
          <Select value={voice} onValueChange={(v) => setVoice(v as KokoroVoiceId)} disabled={loading}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((v) => (
                <SelectItem key={v.id} value={v.id} className="text-xs">
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Texto de teste</p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite o texto para a voz narrar..."
            rows={4}
            className="text-sm resize-none"
            disabled={loading}
          />
        </div>

        <Button onClick={handleTest} disabled={loading || !text.trim()} className="w-full gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando narração local...
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4" />
              Gerar e ouvir
            </>
          )}
        </Button>

        {audioUrl && (
          <div className="rounded-md border border-border/50 bg-background/50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">kokoro-ptbr</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{VOICES.find((v) => v.id === voice)?.label}</span>
              {duration !== null && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{duration.toFixed(1)}s</span>
                </>
              )}
            </div>
            <audio ref={audioRef} controls src={audioUrl} className="w-full h-9" preload="auto" />
            <Button variant="ghost" size="sm" onClick={handleDownload} className="h-7 text-xs gap-1.5 w-full">
              <Download className="h-3 w-3" />
              Baixar WAV
            </Button>
          </div>
        )}

        <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-2 space-y-0.5">
          <p>💡 <strong>Primeira vez:</strong> o modelo (~80 MB) é baixado e fica em cache — as próximas gerações são rápidas.</p>
          <p>🎯 <strong>Sem custo:</strong> nenhuma API paga é usada. Tudo roda no seu navegador.</p>
        </div>
      </CardContent>
    </Card>
  );
}
