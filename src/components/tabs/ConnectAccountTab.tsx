import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Instagram, Plus, Loader2, ExternalLink, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';
import { AccountCard } from '@/components/AccountCard';

export function ConnectAccountTab() {
  const [connecting, setConnecting] = useState(false);
  const { accounts, loading, fetchAccounts, disconnectAccount, getTokenStatus, getDaysUntilExpiry } = useInstagramAccounts();
  const { toast } = useToast();

  // Check for OAuth callback (when this page is opened in popup)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      // Save error to localStorage for parent window
      localStorage.setItem('oauth_result', JSON.stringify({
        success: false,
        error: urlParams.get('error_description') || 'Falha ao conectar com o Instagram'
      }));
      toast({
        title: 'Erro na conexão',
        description: urlParams.get('error_description') || 'Falha ao conectar com o Instagram',
        variant: 'destructive'
      });
      // Clean URL and close if popup
      window.history.replaceState({}, '', window.location.pathname);
      if (window.opener) window.close();
      return;
    }

    if (code) {
      handleOAuthCallback(code);
    }
  }, []);

  const handleOAuthCallback = async (code: string) => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      
      const { data, error } = await supabase.functions.invoke('oauth-callback', {
        body: { code, redirectUri }
      });

      if (error) throw error;

      if (data.success) {
        // Save success to localStorage for parent window
        localStorage.setItem('oauth_result', JSON.stringify({
          success: true,
          accounts: data.accounts
        }));
        
        toast({
          title: 'Conta conectada!',
          description: `${data.accounts.length} conta(s) do Instagram conectada(s) com sucesso.`,
        });
        fetchAccounts();
        
        // Close popup if opened from parent
        if (window.opener) {
          window.close();
        }
      }
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      
      // Save error to localStorage for parent window
      localStorage.setItem('oauth_result', JSON.stringify({
        success: false,
        error: error.message || 'Falha ao processar a autorização'
      }));
      
      toast({
        title: 'Erro ao conectar',
        description: error.message || 'Falha ao processar a autorização',
        variant: 'destructive'
      });
      
      if (window.opener) {
        window.close();
      }
    } finally {
      setConnecting(false);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const startOAuth = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      
      const { data, error } = await supabase.functions.invoke('start-oauth', {
        body: { redirectUri }
      });

      if (error) throw error;

      // Store state for CSRF validation
      sessionStorage.setItem('oauth_state', data.state);
      
      // Open Facebook OAuth in a new window (avoids iframe blocking)
      const popup = window.open(
        data.authUrl,
        'instagram_oauth',
        'width=600,height=700,scrollbars=yes'
      );
      
      // Poll for popup close and check localStorage for result
      const checkPopup = setInterval(() => {
        const oauthResult = localStorage.getItem('oauth_result');
        
        if (oauthResult) {
          clearInterval(checkPopup);
          localStorage.removeItem('oauth_result');
          
          const result = JSON.parse(oauthResult);
          if (result.success) {
            toast({
              title: 'Conta conectada!',
              description: `${result.accounts?.length || 1} conta(s) do Instagram conectada(s) com sucesso.`,
            });
            fetchAccounts();
          } else {
            toast({
              title: 'Erro ao conectar',
              description: result.error || 'Falha ao processar a autorização',
              variant: 'destructive'
            });
          }
          setConnecting(false);
        }
        
        if (popup?.closed) {
          clearInterval(checkPopup);
          setConnecting(false);
        }
      }, 500);
      
      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkPopup);
        setConnecting(false);
      }, 300000);
      
    } catch (error: any) {
      console.error('Start OAuth error:', error);
      toast({
        title: 'Erro ao iniciar conexão',
        description: error.message || 'Falha ao iniciar o processo de autorização',
        variant: 'destructive'
      });
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Contas Conectadas</h2>
          <p className="text-muted-foreground">
            Gerencie suas contas do Instagram para publicação automática
          </p>
        </div>
        <Button onClick={startOAuth} disabled={connecting}>
          {connecting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Conectar Instagram
        </Button>
      </div>

      {/* Instructions Card */}
      <Card className="bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-orange-500/10 border-purple-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="w-5 h-5" />
            Como conectar sua conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                1
              </div>
              <div>
                <p className="font-medium">Conta Business</p>
                <p className="text-sm text-muted-foreground">
                  Sua conta Instagram deve ser do tipo Business ou Creator
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                2
              </div>
              <div>
                <p className="font-medium">Página do Facebook</p>
                <p className="text-sm text-muted-foreground">
                  Conecte sua conta Instagram a uma Página do Facebook
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                3
              </div>
              <div>
                <p className="font-medium">Autorizar</p>
                <p className="text-sm text-muted-foreground">
                  Clique em "Conectar Instagram" e autorize o acesso
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 pt-2">
            <a 
              href="https://help.instagram.com/502981923235522" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Como converter para conta Business
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Connected Accounts */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          {accounts.length > 0 ? `Suas Contas (${accounts.length})` : 'Nenhuma conta conectada'}
        </h3>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                onDisconnect={disconnectAccount}
                tokenStatus={getTokenStatus(account.expires_at)}
                daysUntilExpiry={getDaysUntilExpiry(account.expires_at)}
              />
            ))}
          </div>
        ) : (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Instagram className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center mb-4">
                Nenhuma conta do Instagram conectada ainda.
                <br />
                Conecte uma conta para começar a publicar automaticamente.
              </p>
              <Button onClick={startOAuth} disabled={connecting}>
                {connecting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Conectar primeira conta
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Status Info */}
      {accounts.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>
                Pronto para publicar! Seus posts agendados serão publicados automaticamente nas contas conectadas.
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
