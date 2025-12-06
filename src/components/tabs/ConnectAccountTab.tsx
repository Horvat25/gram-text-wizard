import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Instagram, Plus, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';
import { AccountCard } from '@/components/AccountCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function ConnectAccountTab() {
  const [connecting, setConnecting] = useState(false);
  const processedRef = useRef(false);
  const { accounts, loading, error, fetchAccounts, disconnectAccount, getTokenStatus, getDaysUntilExpiry } = useInstagramAccounts();
  const { toast } = useToast();

  // Check if this is a popup window
  const isPopup = () => {
    try {
      return window.opener !== null && window.opener !== window;
    } catch {
      return false;
    }
  };

  // Parse token data from URL fragment (hash)
  const parseHashFragment = (hash: string) => {
    if (!hash || hash.length <= 1) return null;
    
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const longLivedToken = params.get('long_lived_token');
    const expiresIn = params.get('expires_in');
    const dataAccessExpirationTime = params.get('data_access_expiration_time');

    if (!accessToken && !longLivedToken) return null;

    return {
      accessToken,
      longLivedToken,
      expiresIn: expiresIn ? parseInt(expiresIn, 10) : null,
      dataAccessExpirationTime: dataAccessExpirationTime ? parseInt(dataAccessExpirationTime, 10) : null
    };
  };

  // Check for OAuth callback - only process once and only if there's token data
  useEffect(() => {
    // Don't process if already processed
    if (processedRef.current) return;
    
    // Check for error in query params
    const urlParams = new URLSearchParams(window.location.search);
    const errorParam = urlParams.get('error');

    if (errorParam) {
      processedRef.current = true;
      const errorDesc = urlParams.get('error_description') || 'Falha ao conectar com o Instagram';
      
      // Store result for parent window
      localStorage.setItem('oauth_result', JSON.stringify({
        success: false,
        error: errorDesc
      }));
      
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      
      // If popup, close it
      if (isPopup()) {
        window.close();
        return;
      }
      
      // If not popup, show error toast
      toast({
        title: 'Erro na conexão',
        description: errorDesc,
        variant: 'destructive'
      });
      return;
    }

    // Check for token in URL fragment (hash)
    const tokenData = parseHashFragment(window.location.hash);
    if (tokenData) {
      processedRef.current = true;
      // Clean URL immediately to prevent re-processing
      window.history.replaceState({}, '', window.location.pathname);
      handleTokenCallback(tokenData);
    }
  }, []);

  const handleTokenCallback = async (tokenData: {
    accessToken: string | null;
    longLivedToken: string | null;
    expiresIn: number | null;
    dataAccessExpirationTime: number | null;
  }) => {
    setConnecting(true);
    
    try {
      console.log('Processing token callback with data:', tokenData);

      const { data, error } = await supabase.functions.invoke('process-token', {
        body: tokenData
      });

      if (error) throw error;

      if (data.success) {
        // Store result for parent window
        localStorage.setItem('oauth_result', JSON.stringify({
          success: true,
          accounts: data.accounts
        }));
        
        toast({
          title: 'Conta conectada!',
          description: data.message || `${data.accounts.length} conta(s) do Instagram conectada(s) com sucesso.`,
        });
        fetchAccounts();
      } else {
        throw new Error(data.error || 'Falha ao processar o token');
      }
    } catch (error: any) {
      console.error('Token callback error:', error);
      
      const errorMessage = error.message || 'Falha ao processar a autorização';
      
      // Store error for parent window
      localStorage.setItem('oauth_result', JSON.stringify({
        success: false,
        error: errorMessage
      }));
      
      toast({
        title: 'Erro ao conectar',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setConnecting(false);
      
      // If this is a popup, close it after a short delay to show the toast
      if (isPopup()) {
        setTimeout(() => {
          window.close();
        }, 2000);
      }
    }
  };

  const startOAuth = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/`;
      
      const { data, error } = await supabase.functions.invoke('start-oauth', {
        body: { redirectUri }
      });

      if (error) throw error;

      // Store state for CSRF validation
      sessionStorage.setItem('oauth_state', data.state);
      
      // Clear any previous result
      localStorage.removeItem('oauth_result');
      
      // Open Facebook OAuth in a new window
      const popup = window.open(
        data.authUrl,
        'instagram_oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        toast({
          title: 'Popup bloqueado',
          description: 'Por favor, permita popups para este site e tente novamente.',
          variant: 'destructive'
        });
        setConnecting(false);
        return;
      }
      
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
        
        try {
          if (popup.closed) {
            clearInterval(checkPopup);
            setConnecting(false);
            // Refresh accounts in case something changed
            fetchAccounts();
          }
        } catch {
          // Cross-origin access error, popup is still open
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
        <Button onClick={startOAuth} disabled={connecting} size="lg">
          {connecting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Conectar Instagram
        </Button>
      </div>

      {/* Error Alert with Retry */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro de conexão</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fetchAccounts()}
              className="ml-4"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Connected Accounts */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length > 0 ? (
          <>
            <h3 className="text-lg font-semibold mb-4">
              Suas Contas ({accounts.length})
            </h3>
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
            
            {/* Status Info */}
            <Card className="bg-muted/30 mt-6">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>
                    Pronto para publicar! Seus posts agendados serão publicados automaticamente nas contas conectadas.
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-orange-500/10 border-purple-500/20">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center mb-6">
                <Instagram className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Conecte sua conta do Instagram</h3>
              <p className="text-muted-foreground text-center mb-6 max-w-md">
                Para começar a publicar automaticamente, conecte sua conta Business ou Creator do Instagram.
              </p>
              
              <div className="grid gap-4 md:grid-cols-3 mb-8 max-w-2xl">
                <div className="flex flex-col items-center text-center p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold mb-3">
                    1
                  </div>
                  <p className="font-medium text-sm">Conta Business</p>
                  <p className="text-xs text-muted-foreground">
                    Conta Business ou Creator
                  </p>
                </div>
                <div className="flex flex-col items-center text-center p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold mb-3">
                    2
                  </div>
                  <p className="font-medium text-sm">Página Facebook</p>
                  <p className="text-xs text-muted-foreground">
                    Conectada a uma Página
                  </p>
                </div>
                <div className="flex flex-col items-center text-center p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold mb-3">
                    3
                  </div>
                  <p className="font-medium text-sm">Autorizar</p>
                  <p className="text-xs text-muted-foreground">
                    Clique e autorize
                  </p>
                </div>
              </div>
              
              <Button onClick={startOAuth} disabled={connecting} size="lg" className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:opacity-90">
                {connecting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Instagram className="w-4 h-4 mr-2" />
                )}
                Conectar Instagram
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}