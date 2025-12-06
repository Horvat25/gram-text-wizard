import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Instagram, CheckCircle2, AlertCircle, ExternalLink, AlertTriangle, XCircle } from "lucide-react";

interface OAuthInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

export function OAuthInstructionsModal({ 
  open, 
  onOpenChange, 
  onContinue 
}: OAuthInstructionsModalProps) {
  const handleRevokeAccess = () => {
    window.open('https://www.facebook.com/settings?tab=business_tools', '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
              <Instagram className="w-4 h-4 text-white" />
            </div>
            Conectar Instagram
          </DialogTitle>
          <DialogDescription>
            Leia as instruções abaixo com atenção
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Critical Warning */}
          <Alert className="bg-destructive/10 border-destructive/30">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-sm font-medium">
              Se você já tentou conectar antes e falhou, clique em <strong>"Revogar Acesso Anterior"</strong> antes de tentar novamente!
            </AlertDescription>
          </Alert>

          {/* Revoke Access Button */}
          <Button 
            variant="outline" 
            onClick={handleRevokeAccess}
            className="w-full border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Revogar Acesso Anterior no Facebook
            <ExternalLink className="w-3 h-3 ml-2" />
          </Button>

          {/* Pre-requisites */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Antes de continuar, verifique:</h4>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                Conta Instagram é <strong>Business</strong> ou <strong>Creator</strong>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                Instagram está vinculado a uma <strong>Página do Facebook</strong>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                Você é <strong>administrador</strong> da Página
              </li>
            </ul>
          </div>

          {/* Steps with visual emphasis */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 border-2 border-primary/30">
            <h4 className="font-medium text-sm text-primary">⚠️ Na próxima tela você DEVE:</h4>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-2 rounded bg-background/50">
                <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                <div className="text-sm">
                  <p className="font-medium">Selecionar sua Página do Facebook</p>
                  <p className="text-muted-foreground text-xs">Escolha a página vinculada ao Instagram</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-2 rounded bg-green-500/10 border border-green-500/30">
                <span className="w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                <div className="text-sm">
                  <p className="font-bold text-green-700 dark:text-green-400">SELECIONAR SUA CONTA DO INSTAGRAM</p>
                  <p className="text-muted-foreground text-xs">
                    <strong className="text-foreground">OBRIGATÓRIO:</strong> Marque a caixa ao lado da sua conta Instagram na lista!
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-2 rounded bg-background/50">
                <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                <div className="text-sm">
                  <p className="font-medium">Manter TODAS as permissões</p>
                  <p className="text-muted-foreground text-xs">Não desmarque nenhuma permissão</p>
                </div>
              </div>
            </div>
          </div>

          {/* Common Error */}
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
            <h4 className="font-medium text-sm flex items-center gap-2 text-destructive mb-2">
              <AlertCircle className="w-4 h-4" />
              Erro mais comum:
            </h4>
            <p className="text-xs text-muted-foreground">
              Muitos usuários pulam o passo 2 e não selecionam sua conta do Instagram na lista. 
              Se a conta não aparecer, verifique se seu Instagram está vinculado à Página do Facebook.
            </p>
          </div>

          {/* Help links */}
          <div className="flex flex-col gap-2 text-center">
            <a 
              href="https://www.facebook.com/business/help/898752960195806" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 justify-center"
            >
              Como vincular Instagram à Página?
              <ExternalLink className="w-3 h-3" />
            </a>
            <a 
              href="https://help.instagram.com/502981923235522" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1 justify-center"
            >
              Como mudar para conta Business/Creator?
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={onContinue}
            className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:opacity-90"
          >
            Entendi, Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}