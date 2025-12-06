import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Upload, Loader2, Instagram, CheckCircle, ExternalLink, ImageIcon, Moon, Sun } from "lucide-react";
import Header from "@/components/Header";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";

const Settings = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  
  const { settings, updateSettings } = useBrandSettings();
  const { accounts, loading: loadingAccounts } = useInstagramAccounts();
  const hasConnectedAccount = accounts.length > 0;

  useEffect(() => {
    setBrandName(settings.brandName || "");
    setBrandLogoUrl(settings.brandLogoUrl || "");
    
    // Check current theme
    const isDark = document.documentElement.classList.contains('dark');
    setDarkMode(isDark);
    
    // Also check localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else if (savedTheme === 'light') {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
    
    setIsLoading(false);
  }, [settings]);

  const toggleDarkMode = (enabled: boolean) => {
    setDarkMode(enabled);
    if (enabled) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    toast.success(enabled ? "Modo noturno ativado" : "Modo claro ativado");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

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

  const handleUseInstagramPhoto = () => {
    if (accounts[0]?.profile_picture_url) {
      setBrandLogoUrl(accounts[0].profile_picture_url);
      toast.success("Foto do Instagram aplicada!");
    } else {
      toast.info("Foto do Instagram não disponível. Sincronizando...");
    }
  };

  const handleSave = async () => {
    if (!brandName.trim()) {
      toast.error("Por favor, insira o nome da marca");
      return;
    }

    setIsSaving(true);
    try {
      updateSettings({
        brandName,
        brandLogoUrl: brandLogoUrl || null,
      });

      toast.success("Configurações salvas com sucesso!");
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSaving(false);
    }
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
            {/* Appearance Settings */}
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {darkMode ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
                  Aparência
                </CardTitle>
                <CardDescription>
                  Personalize a aparência do aplicativo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Moon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Modo Noturno</p>
                      <p className="text-sm text-muted-foreground">
                        Ativar tema escuro para reduzir cansaço visual
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={darkMode}
                    onCheckedChange={toggleDarkMode}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Brand Settings */}
            <Card className="border-primary/20">
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
                    {brandLogoUrl ? (
                      <div className="w-24 h-24 rounded-lg border-2 border-primary/20 overflow-hidden flex-shrink-0">
                        <img
                          src={brandLogoUrl}
                          alt="Logo"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-lg border-2 border-dashed border-primary/30 flex items-center justify-center bg-muted/50 flex-shrink-0">
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <Input
                        id="brand-logo"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground">
                        Formatos aceitos: PNG, JPG, GIF (máx. 5MB)
                      </p>
                      {hasConnectedAccount && accounts[0]?.profile_picture_url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleUseInstagramPhoto}
                          className="border-primary/30 hover:bg-primary/10"
                        >
                          <Instagram className="mr-2 h-4 w-4" />
                          Usar foto do Instagram
                        </Button>
                      )}
                      {brandLogoUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setBrandLogoUrl("")}
                          className="text-destructive hover:text-destructive"
                        >
                          Remover logo
                        </Button>
                      )}
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

            {/* Instagram Integration */}
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Instagram className="h-5 w-5 text-primary" />
                  Integração com Instagram
                </CardTitle>
                <CardDescription>
                  Gerencie suas contas do Instagram conectadas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingAccounts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : hasConnectedAccount ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/20">
                      <CheckCircle className="h-5 w-5 text-success" />
                      <div className="flex-1">
                        <p className="font-medium text-success">
                          {accounts.length} conta(s) conectada(s)
                        </p>
                        <p className="text-sm text-success/80">
                          @{accounts.map(a => a.username || 'Conta').join(', @')}
                        </p>
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      onClick={() => navigate("/?tab=connect")}
                      className="w-full border-primary/30 hover:bg-primary/10"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Gerenciar Contas
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Nenhuma conta do Instagram conectada. Conecte uma conta para publicar automaticamente.
                    </p>
                    
                    <Button
                      onClick={() => navigate("/?tab=connect")}
                      className="w-full neural-gradient text-white hover:opacity-90"
                    >
                      <Instagram className="mr-2 h-4 w-4" />
                      Conectar Instagram
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