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
import { Instagram, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
              <Instagram className="w-4 h-4 text-white" />
            </div>
            Conectar Instagram
          </DialogTitle>
          <DialogDescription>
            Siga estas instruções para conectar com sucesso
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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

          {/* Steps */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-sm">Na próxima tela você DEVE:</h4>
            
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <div className="text-sm">
                  <p className="font-medium">Selecionar sua Página do Facebook</p>
                  <p className="text-muted-foreground text-xs">Escolha a página vinculada ao Instagram</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <div className="text-sm">
                  <p className="font-medium">Selecionar sua conta do Instagram</p>
                  <p className="text-muted-foreground text-xs">Marque a caixa ao lado da sua conta Instagram</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <div className="text-sm">
                  <p className="font-medium">Manter TODAS as permissões</p>
                  <p className="text-muted-foreground text-xs">Não desmarque nenhuma permissão</p>
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <Alert className="bg-amber-500/10 border-amber-500/30">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm">
              <strong>Atenção:</strong> Se você não selecionar sua conta do Instagram ou desmarcar alguma permissão, a conexão vai falhar!
            </AlertDescription>
          </Alert>

          {/* Help link */}
          <div className="text-center">
            <a 
              href="https://www.facebook.com/business/help/898752960195806" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Precisa vincular Instagram à Página?
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
