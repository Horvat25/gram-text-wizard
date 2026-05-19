import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Volume2, Mic2, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DEFAULT_SAMPLE =
  'Olá, eu sou a Sarah. Esta é uma narração de teste do Neural Update para validar a integração ElevenLabs no plano Starter, usando o modelo turbo v2.5 com prosódia editorial em português.';

export default function ElevenLabsVoiceTest() {
  const [text, setText] = useState(DEFAULT_SAMPLE);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<{ provider?: string; voice?: string; chars?: number; sizeKb?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const charsLeft = 5000 - text.length;

  const handleTest = async () => {
    if (!text.trim()) {
      toast.error('Digite um texto para narrar');
      return;
    }
    if (text.length > 5000) {
      toast.error('Máximo 5000 caracteres por teste');
      return;
    }
    setLoading(true);
    setError(null);
    setAudioUrl(null);
    setInfo(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('edge-tts', {
        body: { text },
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.audioContent) throw new Error('Sem retorno de áudio');

      const url = `data:audio/mpeg;base64,${data.audioContent}`;
      setAudioUrl(url);
      setInfo({
        provider: data.provider,
        voice: data.voice,
        chars: text.length,
        sizeKb: Math.round((data.audioContent.length * 0.75) / 1024),
      });

      // Autoplay
      setTimeout(() => audioRef.current?.play().catch(() => {}), 100);

      const isEleven = (data.provider as string)?.toLowerCase().includes('eleven');
      if (isEleven) {
        toast.success(`Voz Sarah gerada (${text.length} chars consumidos)`);
      } else {
        toast.warning(`Fallback usado: ${data.provider}. Verifique a API key.`);
      }
    } catch (e: any) {
      console.error('[VoiceTest] erro:', e);
      setError(e.message || 'Falha desconhecida');
      toast.error('Erro ao gerar narração');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `sarah-test-${Date.now()}.mp3`;
    a.click();
  };

  const isElevenSuccess = info?.provider?.toLowerCase().includes('eleven');

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Mic2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Teste de Voz — ElevenLabs Sarah</h3>
              <p className="text-[11px] text-muted-foreground">
                Modelo turbo v2.5 · prosódia editorial PT-BR · plano Starter
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] shrink-0">
            ~30k chars/mês
          </Badge>
        </div>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Digite o texto que a Sarah deve narrar..."
          rows={4}
          className="text-sm resize-none"
          disabled={loading}
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{text.length} caracteres</span>
          <span className={charsLeft < 0 ? 'text-destructive' : ''}>
            limite 5000 por requisição
          </span>
        </div>

        <Button onClick={handleTest} disabled={loading || !text.trim()} className="w-full gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando narração...
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4" />
              Gerar e ouvir
            </>
          )}
        </Button>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Erro:</p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        {audioUrl && info && (
          <div className="rounded-md border border-border/50 bg-background/50 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              {isElevenSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500" />
              )}
              <span className="font-medium">{info.provider}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{info.voice}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{info.sizeKb}KB</span>
            </div>
            <audio
              ref={audioRef}
              controls
              src={audioUrl}
              className="w-full h-9"
              preload="auto"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-7 text-xs gap-1.5 w-full"
            >
              <Download className="h-3 w-3" />
              Baixar MP3
            </Button>
          </div>
        )}

        <div className="text-[10px] text-muted-foreground border-t border-border/30 pt-2 space-y-0.5">
          <p>💡 <strong>Dica:</strong> ElevenLabs cobra por caractere. 1 reel ≈ 350 chars = ~85 reels/mês no Starter.</p>
          <p>🎯 <strong>Fallback automático:</strong> se a quota estourar, cai para HuggingFace ou Google TTS.</p>
        </div>
      </CardContent>
    </Card>
  );
}
