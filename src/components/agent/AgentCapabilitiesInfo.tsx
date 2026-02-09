import { Card, CardContent } from '@/components/ui/card';
import { 
  Newspaper, 
  Video, 
  Image, 
  Layers,
  Calendar,
  BarChart3,
  Settings,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

export default function AgentCapabilitiesInfo() {
  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="h-4 w-4" />
          O que o Agente pode fazer
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Criação */}
          <div className="space-y-1.5">
            <span className="font-medium text-muted-foreground">Criar:</span>
            <div className="flex items-center gap-1.5 text-foreground">
              <Newspaper className="h-3 w-3 text-blue-500" />
              Post de notícia com headline
            </div>
            <div className="flex items-center gap-1.5 text-foreground">
              <Video className="h-3 w-3 text-pink-500" />
              Vídeo/Reels narrado
            </div>
            <div className="flex items-center gap-1.5 text-foreground">
              <Layers className="h-3 w-3 text-purple-500" />
              Carrossel de imagens
            </div>
            <div className="flex items-center gap-1.5 text-foreground">
              <Image className="h-3 w-3 text-green-500" />
              Post de imagem
            </div>
          </div>
          
          {/* Gerenciamento */}
          <div className="space-y-1.5">
            <span className="font-medium text-muted-foreground">Gerenciar:</span>
            <div className="flex items-center gap-1.5 text-foreground">
              <Calendar className="h-3 w-3 text-amber-500" />
              Agendar publicações
            </div>
            <div className="flex items-center gap-1.5 text-foreground">
              <BarChart3 className="h-3 w-3 text-cyan-500" />
              Ver analytics
            </div>
            <div className="flex items-center gap-1.5 text-foreground">
              <Settings className="h-3 w-3 text-gray-500" />
              Alterar configurações
            </div>
          </div>
        </div>

        {/* Como funciona */}
        <div className="pt-2 border-t border-border/50 space-y-1.5">
          <span className="font-medium text-muted-foreground text-xs">✨ Como usar:</span>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-start gap-1.5">
              <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 flex-shrink-0" />
              <span>Posts de <strong>notícia</strong>: usam imagens REAIS dos feeds RSS (não gera com IA)</span>
            </div>
            <div className="flex items-start gap-1.5">
              <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 flex-shrink-0" />
              <span>Posts de <strong>vídeo</strong>: gera imagens cinematográficas + narração neural</span>
            </div>
            <div className="flex items-start gap-1.5">
              <CheckCircle2 className="h-3 w-3 mt-0.5 text-green-500 flex-shrink-0" />
              <span><strong>Correção ortográfica</strong> automática em todos os textos</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
