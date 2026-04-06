import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import { toast } from "sonner";

const InstagramCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processando autorização do Instagram...");

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error) {
        const msg = errorDescription || error;
        setStatus("error");
        setMessage(msg);
        toast.error(msg);
        return;
      }

      if (!code) {
        setStatus("error");
        setMessage("Código de autorização não encontrado");
        return;
      }

      try {
        const publishedOrigin = 'https://gram-text-wizard.lovable.app';
        const redirectUri = `${publishedOrigin}/instagram/callback`;
        const { data: { user } } = await supabase.auth.getUser();

        // Get workspace_id from localStorage (set before OAuth redirect)
        const workspaceId = localStorage.getItem('oauth_workspace_id');

        const { data, error: callbackError } = await supabase.functions.invoke('oauth-callback', {
          body: { code, redirectUri, userId: user?.id, workspaceId }
        });

        if (callbackError) throw callbackError;
        if (!data?.success) throw new Error(data?.error || 'Falha ao processar autorização');

        localStorage.setItem('oauth_result', JSON.stringify({
          success: true,
          accounts: data.accounts,
        }));

        setStatus("success");
        setMessage(`${data.accounts?.length || 1} conta(s) do Instagram conectada(s)!`);
        toast.success(`${data.accounts?.length || 1} conta(s) do Instagram conectada(s)!`);

        setTimeout(() => {
          navigate("/");
        }, 1500);
      } catch (err: any) {
        console.error("Instagram callback error:", err);
        localStorage.setItem('oauth_result', JSON.stringify({
          success: false,
          error: err.message,
        }));
        setStatus("error");
        setMessage(err.message || "Erro ao conectar Instagram");
        toast.error(err.message || "Erro ao conectar Instagram");
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto mt-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {status === "loading" && <Loader2 className="h-5 w-5 animate-spin" />}
                {status === "success" && <CheckCircle2 className="h-5 w-5 text-primary" />}
                {status === "error" && <XCircle className="h-5 w-5 text-destructive" />}
                {status === "loading" && "Conectando Instagram..."}
                {status === "success" && "Instagram conectado"}
                {status === "error" && "Erro na conexão"}
              </CardTitle>
              <CardDescription>{message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status === "loading" && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
              )}

              {status === "success" && (
                <p className="text-sm text-muted-foreground text-center">Redirecionando...</p>
              )}

              {status === "error" && (
                <Button onClick={() => navigate("/")} className="w-full" variant="outline">
                  Voltar
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default InstagramCallback;
