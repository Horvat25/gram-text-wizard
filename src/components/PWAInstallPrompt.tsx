import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/usePWA';

export function PWAInstallPrompt() {
  const { isInstallable, isInstalled, needsUpdate, installApp, updateApp } = usePWA();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Show install prompt after a short delay if installable
    if (isInstallable && !isInstalled && !dismissed) {
      const timer = setTimeout(() => setShowPrompt(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [isInstallable, isInstalled, dismissed]);

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
  };

  // Update prompt
  if (needsUpdate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm"
      >
        <div className="bg-card border border-border rounded-xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <RefreshCw className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-sm">Atualização Disponível</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Uma nova versão está disponível. Atualize para obter as últimas melhorias.
              </p>
              <Button 
                onClick={updateApp} 
                size="sm" 
                className="mt-3 w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar Agora
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Install prompt
  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm"
        >
          <div className="bg-card border border-border rounded-xl p-4 shadow-lg">
            <button
              onClick={handleDismiss}
              className="absolute top-2 right-2 p-1 hover:bg-muted rounded-full transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 pr-6">
                <h3 className="font-semibold text-sm">Instalar Aplicativo</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Adicione à tela inicial para acesso rápido e experiência de app nativo.
                </p>
                <Button 
                  onClick={handleInstall} 
                  size="sm" 
                  className="mt-3 w-full neural-gradient"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Instalar
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
