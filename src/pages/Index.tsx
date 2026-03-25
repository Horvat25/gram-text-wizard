import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AgentTab from "@/components/tabs/AgentTab";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VideoRenderingProvider } from "@/contexts/VideoRenderingContext";

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle OAuth callback from Facebook
  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    
    if (error) {
      console.error("OAuth error:", error, errorDescription);
      localStorage.setItem('oauth_result', JSON.stringify({
        success: false,
        error: errorDescription || error
      }));
      setSearchParams({});
      if (window.opener) {
        window.close();
      }
      return;
    }
    
    if (code) {
      processOAuthCode(code);
    }
  }, []);

  const processOAuthCode = async (code: string) => {
    try {
      const redirectUri = `${window.location.origin}/`;
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('oauth-callback', {
        body: { code, redirectUri, userId: user?.id }
      });

      if (error) throw error;

      if (data.success) {
        localStorage.setItem('oauth_result', JSON.stringify({
          success: true,
          accounts: data.accounts
        }));
        toast.success(`${data.accounts?.length || 1} conta(s) do Instagram conectada(s)!`);
      } else {
        throw new Error(data.error || 'Falha ao processar autorização');
      }
    } catch (err: any) {
      console.error("OAuth callback error:", err);
      localStorage.setItem('oauth_result', JSON.stringify({
        success: false,
        error: err.message
      }));
      toast.error(err.message || 'Erro ao conectar Instagram');
    } finally {
      setSearchParams({});
      if (window.opener) {
        window.close();
      }
    }
  };

  return (
    <VideoRenderingProvider>
      <div className="h-screen bg-background">
        <AgentTab />
      </div>
    </VideoRenderingProvider>
  );
};

export default Index;
