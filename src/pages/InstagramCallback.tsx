import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { handleOAuthCallback } from "@/lib/instagram-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";

const InstagramCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      setStatus("error");
      setErrorMessage(errorDescription || error);
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMessage("Código de autorização não encontrado");
      return;
    }

    // Get Instagram App credentials from localStorage
    const appId = localStorage.getItem("instagram_app_id");
    const appSecret = localStorage.getItem("instagram_app_secret");

    if (!appId || !appSecret) {
      setStatus("error");
      setErrorMessage("Credenciais do app não configuradas. Configure primeiro nas Settings.");
      return;
    }

    const redirectUri = `${window.location.origin}/instagram/callback`;

    // Process OAuth callback
    handleOAuthCallback(code, appId, appSecret, redirectUri)
      .then((result) => {
        if (result.success) {
          setStatus("success");
          setTimeout(() => {
            navigate("/settings");
          }, 2000);
        } else {
          setStatus("error");
          setErrorMessage(result.error || "Erro ao conectar com Instagram");
        }
      })
      .catch((error) => {
        setStatus("error");
        setErrorMessage(error.message);
      });
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
                {status === "success" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
                
                {status === "loading" && "Conectando..."}
                {status === "success" && "Conectado!"}
                {status === "error" && "Erro na Conexão"}
              </CardTitle>
              <CardDescription>
                {status === "loading" && "Processando autorização do Instagram..."}
                {status === "success" && "Sua conta Instagram foi conectada com sucesso!"}
                {status === "error" && "Não foi possível conectar sua conta"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status === "loading" && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
              )}
              
              {status === "success" && (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">
                    Redirecionando para Settings...
                  </p>
                </div>
              )}
              
              {status === "error" && (
                <div className="space-y-4">
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <p className="text-sm text-destructive">{errorMessage}</p>
                  </div>
                  <Button onClick={() => navigate("/settings")} className="w-full">
                    Voltar para Settings
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default InstagramCallback;
