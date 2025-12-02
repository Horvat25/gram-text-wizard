import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Upload, Loader2, Instagram, CheckCircle2, XCircle } from "lucide-react";
import Header from "@/components/Header";
import { loadSettings, saveSettings } from "@/lib/local-storage";
import { 
  isInstagramConnected, 
  getInstagramCredentials, 
  connectInstagram, 
  disconnectInstagram 
} from "@/lib/instagram-api";

const Settings = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [instagramAppId, setInstagramAppId] = useState("");
  const [instagramAppSecret, setInstagramAppSecret] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [instagramUsername, setInstagramUsername] = useState("");

  useEffect(() => {
    loadSettingsFromStorage();
    checkInstagramConnection();
  }, []);

  const loadSettingsFromStorage = () => {
    setIsLoading(true);
    try {
      const settings = loadSettings();
      setBrandName(settings.brandName || "");
      setBrandLogoUrl(settings.brandLogoUrl || "");
      
      // Load Instagram App credentials
      const appId = localStorage.getItem("instagram_app_id") || "";
      const appSecret = localStorage.getItem("instagram_app_secret") || "";
      setInstagramAppId(appId);
      setInstagramAppSecret(appSecret);
    } catch (error: any) {
      console.error("Error loading settings:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setIsLoading(false);
    }
  };

  const checkInstagramConnection = () => {
    const connected = isInstagramConnected();
    setIsConnected(connected);
    
    if (connected) {
      const credentials = getInstagramCredentials();
      setInstagramUsername(credentials?.username || "");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    // Convert image to base64 for local storage
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setBrandLogoUrl(base64String);
      toast.success("Logo carregado com sucesso!");
    };
    reader.onerror = () => {
      toast.error("Erro ao carregar imagem");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!brandName.trim()) {
      toast.error("Por favor, insira o nome da marca");
      return;
    }

    setIsSaving(true);
    try {
      saveSettings({
        brandName,
        brandLogoUrl: brandLogoUrl || undefined,
      });

      // Save Instagram App credentials
      if (instagramAppId) {
        localStorage.setItem("instagram_app_id", instagramAppId);
      }
      if (instagramAppSecret) {
        localStorage.setItem("instagram_app_secret", instagramAppSecret);
      }

      toast.success("Configurações salvas com sucesso!");
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectInstagram = () => {
    if (!instagramAppId) {
      toast.error("Configure o App ID do Instagram primeiro");
      return;
    }
    
    const redirectUri = `${window.location.origin}/instagram/callback`;
    connectInstagram(instagramAppId, redirectUri);
  };

  const handleDisconnectInstagram = () => {
    disconnectInstagram();
    setIsConnected(false);
    setInstagramUsername("");
    toast.success("Conta Instagram desconectada");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Configurações da Marca</CardTitle>
                <CardDescription>
                  Configure o nome e a logo da sua marca
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="brand-name">Nome da Marca</Label>
                  <Input
                    id="brand-name"
                    placeholder="Ex: Minha Empresa"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brand-logo">Logo da Marca</Label>
                  <div className="flex items-start gap-4">
                    {brandLogoUrl && (
                      <div className="w-24 h-24 rounded-lg border overflow-hidden flex-shrink-0">
                        <img
                          src={brandLogoUrl}
                          alt="Logo"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <Input
                        id="brand-logo"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Formatos aceitos: PNG, JPG, GIF (máx. 5MB)
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Salvar Configurações
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Instagram className="h-5 w-5" />
                  Integração com Instagram
                </CardTitle>
                <CardDescription>
                  Conecte sua conta comercial do Instagram para publicar automaticamente
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Instagram App Credentials */}
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <div className="space-y-2">
                    <Label htmlFor="instagram-app-id">Instagram App ID</Label>
                    <Input
                      id="instagram-app-id"
                      type="text"
                      placeholder="Digite o App ID do Facebook Developers"
                      value={instagramAppId}
                      onChange={(e) => setInstagramAppId(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Obtenha em{" "}
                      <a
                        href="https://developers.facebook.com/apps"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Facebook Developers
                      </a>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="instagram-app-secret">Instagram App Secret</Label>
                    <Input
                      id="instagram-app-secret"
                      type="password"
                      placeholder="Digite o App Secret"
                      value={instagramAppSecret}
                      onChange={(e) => setInstagramAppSecret(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Mantenha este valor em segredo
                    </p>
                  </div>
                </div>

                {/* Connection Status */}
                {isConnected ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-900 dark:text-green-100">
                            Conectado
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            @{instagramUsername}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnectInstagram}
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Desconectar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground mb-2">
                        ⚠️ Antes de conectar, certifique-se de:
                      </p>
                      <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Ter uma conta comercial do Instagram</li>
                        <li>Ter configurado o App ID e App Secret acima</li>
                        <li>Adicionar a URL de redirect no Facebook Developers:</li>
                        <code className="block mt-1 p-2 bg-background rounded text-xs">
                          {window.location.origin}/instagram/callback
                        </code>
                      </ul>
                    </div>

                    <Button
                      onClick={handleConnectInstagram}
                      disabled={!instagramAppId}
                      className="w-full"
                    >
                      <Instagram className="mr-2 h-4 w-4" />
                      Conectar com Instagram
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
