import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Smartphone, Share, MoreVertical, Plus, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/usePWA';
import { useNavigate } from 'react-router-dom';

const Install = () => {
  const { isInstallable, isInstalled, installApp } = usePWA();
  const navigate = useNavigate();
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));
  }, []);

  const handleInstall = async () => {
    await installApp();
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="p-4 bg-green-500/10 rounded-full mb-6"
        >
          <Check className="h-12 w-12 text-green-500" />
        </motion.div>
        <h1 className="text-2xl font-bold text-center mb-2">App Instalado!</h1>
        <p className="text-muted-foreground text-center mb-6">
          O Agente IA já está instalado no seu dispositivo.
        </p>
        <Button onClick={() => navigate('/')} className="neural-gradient">
          Abrir Aplicativo
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="p-4 flex items-center">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="p-4 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl mb-6 inline-block">
            <Smartphone className="h-16 w-16 text-primary" />
          </div>
        </motion.div>

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold mb-2"
        >
          Instale o Agente IA
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-muted-foreground mb-8 max-w-sm"
        >
          Tenha acesso rápido ao seu agente de conteúdo direto da tela inicial do seu celular.
        </motion.p>

        {/* Direct install button for supported browsers */}
        {isInstallable && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="w-full max-w-sm"
          >
            <Button onClick={handleInstall} className="w-full neural-gradient h-12 text-base">
              <Download className="h-5 w-5 mr-2" />
              Instalar Aplicativo
            </Button>
          </motion.div>
        )}

        {/* Manual instructions for iOS */}
        {isIOS && !isInstallable && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="w-full max-w-sm space-y-4"
          >
            <h2 className="font-semibold text-lg mb-4">Como instalar no iPhone/iPad:</h2>
            
            <div className="flex items-start gap-4 text-left bg-card p-4 rounded-xl border">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Share className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">1. Toque em Compartilhar</p>
                <p className="text-sm text-muted-foreground">
                  Na barra de navegação do Safari
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 text-left bg-card p-4 rounded-xl border">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">2. Adicionar à Tela de Início</p>
                <p className="text-sm text-muted-foreground">
                  Role para baixo e toque nesta opção
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 text-left bg-card p-4 rounded-xl border">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Check className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium">3. Confirme a instalação</p>
                <p className="text-sm text-muted-foreground">
                  Toque em "Adicionar" no canto superior direito
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Manual instructions for Android without prompt */}
        {isAndroid && !isInstallable && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="w-full max-w-sm space-y-4"
          >
            <h2 className="font-semibold text-lg mb-4">Como instalar no Android:</h2>
            
            <div className="flex items-start gap-4 text-left bg-card p-4 rounded-xl border">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MoreVertical className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">1. Toque no menu</p>
                <p className="text-sm text-muted-foreground">
                  Os três pontos no canto superior direito
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 text-left bg-card p-4 rounded-xl border">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">2. Instalar aplicativo</p>
                <p className="text-sm text-muted-foreground">
                  Ou "Adicionar à tela inicial"
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 text-left bg-card p-4 rounded-xl border">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Check className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium">3. Confirme a instalação</p>
                <p className="text-sm text-muted-foreground">
                  Toque em "Instalar" na janela que aparecer
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Fallback for desktop */}
        {!isIOS && !isAndroid && !isInstallable && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center"
          >
            <p className="text-muted-foreground mb-4">
              Acesse este link no seu celular para instalar o aplicativo:
            </p>
            <code className="bg-muted px-4 py-2 rounded-lg text-sm">
              {window.location.origin}/install
            </code>
          </motion.div>
        )}
      </div>

      {/* Benefits */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="p-6 border-t border-border"
      >
        <h3 className="font-semibold text-center mb-4">Benefícios do App</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl mb-1">⚡</div>
            <p className="text-xs text-muted-foreground">Acesso Rápido</p>
          </div>
          <div>
            <div className="text-2xl mb-1">📱</div>
            <p className="text-xs text-muted-foreground">Tela Cheia</p>
          </div>
          <div>
            <div className="text-2xl mb-1">🔄</div>
            <p className="text-xs text-muted-foreground">Auto-Update</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Install;
