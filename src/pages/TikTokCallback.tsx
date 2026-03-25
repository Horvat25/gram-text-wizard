import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle, Video } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const TikTokCallback = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      const finishWithError = (message: string) => {
        setStatus("error");
        setMessage(message);
        if (window.opener) {
          localStorage.setItem("tiktok_oauth_result", JSON.stringify({ success: false, error: message }));
          setTimeout(() => window.close(), 3000);
        }
      };

      if (error) {
        finishWithError(errorDescription || error || "Autorização cancelada");
        return;
      }

      if (!code) {
        finishWithError("Código de autorização não encontrado");
        return;
      }

      let userId: string | null = null;
      try {
        if (state) {
          const parsedState = JSON.parse(atob(state));
          userId = parsedState?.userId ?? null;
        }
      } catch (decodeError) {
        console.warn("Failed to decode TikTok OAuth state:", decodeError);
      }

      if (!userId) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          userId = user?.id ?? localStorage.getItem("tiktok_oauth_user_id");
        } catch (authError) {
          console.warn("Failed to read auth session in TikTok callback:", authError);
        }
      }

      if (!userId) {
        finishWithError("Você precisa estar logado para conectar o TikTok");
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/tiktok-callback`;
        const { data, error: callbackError } = await supabase.functions.invoke("tiktok-callback", {
          body: {
            code,
            redirectUri,
            userId,
          },
        });

        if (callbackError) throw callbackError;
        if (!data.success) throw new Error(data.error || "Falha ao conectar conta");

        setStatus("success");
        setMessage(`Conta @${data.account?.username || "TikTok"} conectada com sucesso!`);

        if (window.opener) {
          localStorage.setItem("tiktok_oauth_result", JSON.stringify({
            success: true,
            account: data.account,
          }));
          setTimeout(() => window.close(), 2000);
        }
      } catch (err: any) {
        console.error("TikTok callback error:", err);
        finishWithError(err.message || "Erro ao processar autorização");
      }
    };

    processCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center py-12">
          {status === "loading" && (
            <>
              <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
              <h2 className="text-xl font-semibold mb-2">Conectando TikTok...</h2>
              <p className="text-muted-foreground text-center">
                Aguarde enquanto processamos sua autorização
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Sucesso!</h2>
              <p className="text-muted-foreground text-center mb-4">{message}</p>
              <p className="text-sm text-muted-foreground">Esta janela fechará automaticamente...</p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Erro</h2>
              <p className="text-muted-foreground text-center mb-4">{message}</p>
              <Button onClick={() => window.close()} variant="outline">
                Fechar
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TikTokCallback;
