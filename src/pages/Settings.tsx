import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Upload, 
  Loader2, 
  Instagram, 
  CheckCircle, 
  ImageIcon, 
  Moon, 
  Sun,
  Settings as SettingsIcon,
  Sparkles,
  Link2,
  Plus,
  AlertCircle,
  RefreshCw,
  Save,
  RotateCcw,
  Image,
  Video,
  Mic,
  Play
} from "lucide-react";
import Header from "@/components/Header";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { useInstagramAccounts } from "@/hooks/useInstagramAccounts";
import { useTikTokAccounts } from "@/hooks/useTikTokAccounts";
import { AccountCard } from "@/components/AccountCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";

// AI Settings Types
interface AISettings {
  captionInstructions: string;
  imageStyles: string[];
  brandName: string;
  brandVoice: string;
  targetAudience: string;
  useEmojis: boolean;
  emojiAmount: string;
  preferredHashtagCount: number;
}

const STYLE_PRESETS = [
  { label: 'Minimalista', value: 'Minimalista, clean, cores neutras, muito espaço em branco' },
  { label: 'Tech', value: 'Futurista, tons de azul e roxo, elementos de tecnologia, gradientes' },
  { label: 'Vibrante', value: 'Cores vibrantes, alto contraste, energia visual, moderno' },
  { label: 'Natural', value: 'Tons terrosos, orgânico, iluminação natural, calmo' },
  { label: 'Luxo', value: 'Elegante, dourado, preto, sofisticado, premium' },
  { label: 'Artístico', value: 'Ilustração artística, criativo, cores únicas, expressivo' },
];

// Voice options for TTS - Uses OpenAI HD voices via Lovable AI
const VOICE_OPTIONS = [
  { id: 'camila', name: 'Camila (Nova)', gender: 'Feminino', description: 'Voz calorosa e amigável, ideal para conteúdo profissional', lang: 'pt-BR' },
  { id: 'vitoria', name: 'Vitória (Shimmer)', gender: 'Feminino', description: 'Voz suave e gentil, perfeita para bem-estar e lifestyle', lang: 'pt-BR' },
  { id: 'thiago', name: 'Thiago (Echo)', gender: 'Masculino', description: 'Voz dinâmica e envolvente, ótima para tech e games', lang: 'pt-BR' },
  { id: 'ricardo', name: 'Ricardo (Onyx)', gender: 'Masculino', description: 'Voz grave e autoritária, perfeita para notícias', lang: 'pt-BR' },
  { id: 'fernanda', name: 'Fernanda (Alloy)', gender: 'Feminino', description: 'Voz neutra e equilibrada, versátil para qualquer conteúdo', lang: 'pt-PT' },
];

const DEFAULT_AI_SETTINGS: AISettings = {
  captionInstructions: '',
  imageStyles: [],
  brandName: '',
  brandVoice: 'Conversacional e autêntico',
  targetAudience: '',
  useEmojis: true,
  emojiAmount: 'moderado',
  preferredHashtagCount: 10,
};

const AI_STORAGE_KEY = 'ai_generation_settings';

const Settings = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectingTikTok, setConnectingTikTok] = useState(false);
  const [aiSettings, setAiSettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [isSavingAI, setIsSavingAI] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("camila");
  const [testingVoice, setTestingVoice] = useState<string | null>(null);
  
  const { settings, updateSettings } = useBrandSettings();
  const { accounts, loading: loadingAccounts, error, fetchAccounts, disconnectAccount, getTokenStatus, getDaysUntilExpiry } = useInstagramAccounts();
  const { 
    accounts: tiktokAccounts, 
    isLoading: loadingTikTok, 
    error: tiktokError, 
    fetchAccounts: fetchTikTokAccounts, 
    disconnectAccount: disconnectTikTok,
    getTokenStatus: getTikTokTokenStatus,
    getDaysUntilExpiry: getTikTokDaysUntilExpiry
  } = useTikTokAccounts();
  const hasConnectedAccount = accounts.length > 0;

  useEffect(() => {
    setBrandName(settings.brandName || "");
    setBrandLogoUrl(settings.brandLogoUrl || "");
    setSelectedVoice(settings.preferredVoice || "camila");
    
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

    // Load AI settings
    try {
      const saved = localStorage.getItem(AI_STORAGE_KEY);
      if (saved) {
        setAiSettings({ ...DEFAULT_AI_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (error) {
      console.error('Error loading AI settings:', error);
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

  // AI Settings handlers
  const handleSaveAI = async () => {
    setIsSavingAI(true);
    try {
      localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(aiSettings));
      toast.success('Configurações de IA salvas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSavingAI(false);
    }
  };

  const handleResetAI = () => {
    setAiSettings(DEFAULT_AI_SETTINGS);
    localStorage.removeItem(AI_STORAGE_KEY);
    toast.success('Configurações restauradas para o padrão');
  };

  const updateAISetting = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    setAiSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleVoiceSelect = (voiceId: string) => {
    setSelectedVoice(voiceId);
    updateSettings({ preferredVoice: voiceId });
    toast.success(`Voz "${VOICE_OPTIONS.find(v => v.id === voiceId)?.name}" selecionada!`);
  };

  const testVoice = async (voiceId: string) => {
    setTestingVoice(voiceId);
    try {
      // Use browser TTS for instant free voice testing
      const testText = "Olá! Esta é uma demonstração da voz selecionada.";
      
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(testText);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.0;
      
      // Try to find a Portuguese voice
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt'));
      if (ptVoice) {
        utterance.voice = ptVoice;
      }
      
      utterance.onend = () => setTestingVoice(null);
      utterance.onerror = () => setTestingVoice(null);
      
      window.speechSynthesis.speak(utterance);
      toast.success(`Testando voz: ${VOICE_OPTIONS.find(v => v.id === voiceId)?.name || voiceId}`);
    } catch (error: any) {
      console.error('Erro ao testar voz:', error);
      toast.error('Erro ao testar voz');
    } finally {
      setTimeout(() => setTestingVoice(null), 3000);
    }
  };

  // Instagram OAuth
  const startOAuth = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/`;
      
      const { data, error } = await supabase.functions.invoke('start-oauth', {
        body: { redirectUri }
      });

      if (error) throw error;

      sessionStorage.setItem('oauth_state', data.state);
      localStorage.removeItem('oauth_result');
      
      const popup = window.open(
        data.authUrl,
        'instagram_oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        toast.error('Por favor, permita popups para este site e tente novamente.');
        setConnecting(false);
        return;
      }
      
      const checkPopup = setInterval(() => {
        const oauthResult = localStorage.getItem('oauth_result');
        
        if (oauthResult) {
          clearInterval(checkPopup);
          localStorage.removeItem('oauth_result');
          
          const result = JSON.parse(oauthResult);
          if (result.success) {
            toast.success(`${result.accounts?.length || 1} conta(s) conectada(s)!`);
            fetchAccounts();
          } else {
            toast.error(result.error || 'Falha ao processar a autorização');
          }
          setConnecting(false);
        }
        
        try {
          if (popup.closed) {
            clearInterval(checkPopup);
            setConnecting(false);
            fetchAccounts();
          }
        } catch {
          // Cross-origin access error
        }
      }, 500);
      
      setTimeout(() => {
        clearInterval(checkPopup);
        setConnecting(false);
      }, 300000);
      
    } catch (error: any) {
      console.error('Start OAuth error:', error);
      toast.error(error.message || 'Falha ao iniciar o processo de autorização');
      setConnecting(false);
    }
  };

  // TikTok OAuth
  const startTikTokOAuth = async () => {
    setConnectingTikTok(true);
    try {
      const redirectUri = `${window.location.origin}/tiktok-callback`;
      
      const { data, error } = await supabase.functions.invoke('start-tiktok-oauth', {
        body: { redirectUri }
      });

      if (error) throw error;

      sessionStorage.setItem('tiktok_oauth_state', data.state);
      
      const popup = window.open(
        data.authUrl,
        'tiktok_oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );
      
      if (!popup) {
        toast.error('Por favor, permita popups para este site e tente novamente.');
        setConnectingTikTok(false);
        return;
      }
      
      const checkPopup = setInterval(() => {
        const tiktokResult = localStorage.getItem('tiktok_oauth_result');
        
        if (tiktokResult) {
          clearInterval(checkPopup);
          localStorage.removeItem('tiktok_oauth_result');
          
          const result = JSON.parse(tiktokResult);
          if (result.success) {
            toast.success('Conta TikTok conectada com sucesso!');
            fetchTikTokAccounts();
          } else {
            toast.error(result.error || 'Falha ao processar a autorização');
          }
          setConnectingTikTok(false);
        }
        
        try {
          if (popup.closed) {
            clearInterval(checkPopup);
            setConnectingTikTok(false);
            fetchTikTokAccounts();
          }
        } catch {
          // Cross-origin access error
        }
      }, 500);
      
      setTimeout(() => {
        clearInterval(checkPopup);
        setConnectingTikTok(false);
      }, 300000);
      
    } catch (error: any) {
      console.error('Start TikTok OAuth error:', error);
      toast.error(error.message || 'Falha ao iniciar o processo de autorização');
      setConnectingTikTok(false);
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
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <div className="mb-6">
            <h1 className="text-3xl font-bold neural-gradient-text">Configurações</h1>
            <p className="text-muted-foreground">Gerencie todas as configurações do app</p>
          </div>

          <Tabs defaultValue="general" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general" className="flex items-center gap-2">
                <SettingsIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Geral</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">IA</span>
              </TabsTrigger>
              <TabsTrigger value="instagram" className="flex items-center gap-2">
                <Instagram className="h-4 w-4" />
                <span className="hidden sm:inline">Instagram</span>
              </TabsTrigger>
              <TabsTrigger value="tiktok" className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                <span className="hidden sm:inline">TikTok</span>
              </TabsTrigger>
            </TabsList>

            {/* General Settings Tab */}
            <TabsContent value="general" className="space-y-6">
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
            </TabsContent>

            {/* AI Settings Tab */}
            <TabsContent value="ai" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Configurações da IA</h2>
                  <p className="text-muted-foreground text-sm">
                    Personalize como a IA gera suas legendas e imagens
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleResetAI}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restaurar
                  </Button>
                  <Button size="sm" onClick={handleSaveAI} disabled={isSavingAI}>
                    {isSavingAI ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Caption Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Geração de Legendas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="aiBrandName">Nome da Marca/Perfil</Label>
                      <Input
                        id="aiBrandName"
                        placeholder="Ex: Neural Update"
                        value={aiSettings.brandName}
                        onChange={(e) => updateAISetting('brandName', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="targetAudience">Público-Alvo</Label>
                      <Input
                        id="targetAudience"
                        placeholder="Ex: Empreendedores, profissionais de tecnologia"
                        value={aiSettings.targetAudience}
                        onChange={(e) => updateAISetting('targetAudience', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="brandVoice">Tom de Voz</Label>
                      <Input
                        id="brandVoice"
                        placeholder="Ex: Conversacional, profissional, divertido"
                        value={aiSettings.brandVoice}
                        onChange={(e) => updateAISetting('brandVoice', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="captionInstructions">Instruções Customizadas</Label>
                      <Textarea
                        id="captionInstructions"
                        placeholder="Ex: Sempre mencione nosso site no final..."
                        value={aiSettings.captionInstructions}
                        onChange={(e) => updateAISetting('captionInstructions', e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Usar Emojis</Label>
                        <p className="text-xs text-muted-foreground">Incluir emojis nas legendas</p>
                      </div>
                      <Switch
                        checked={aiSettings.useEmojis}
                        onCheckedChange={(checked) => updateAISetting('useEmojis', checked)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="hashtagCount">Quantidade de Hashtags</Label>
                      <Input
                        id="hashtagCount"
                        type="number"
                        min={5}
                        max={30}
                        value={aiSettings.preferredHashtagCount}
                        onChange={(e) => updateAISetting('preferredHashtagCount', parseInt(e.target.value) || 10)}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Image Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Image className="h-5 w-5 text-primary" />
                      Geração de Imagens
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <Label>Estilos Pré-definidos</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {STYLE_PRESETS.map((style) => {
                          const isSelected = aiSettings.imageStyles.includes(style.value);
                          return (
                            <Button
                              key={style.label}
                              variant={isSelected ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                const newStyles = isSelected
                                  ? aiSettings.imageStyles.filter(s => s !== style.value)
                                  : [...aiSettings.imageStyles, style.value];
                                updateAISetting('imageStyles', newStyles);
                              }}
                              className="w-full"
                            >
                              {style.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-medium mb-2 text-sm">Dicas:</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• Seja específico sobre cores e atmosfera</li>
                        <li>• Mencione o tipo de iluminação</li>
                        <li>• Descreva a composição desejada</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                {/* Voice Settings */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mic className="h-5 w-5 text-primary" />
                      Voz para Narração
                    </CardTitle>
                    <CardDescription>
                      Escolha a voz que será usada nos vídeos narrados
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3">
                      {VOICE_OPTIONS.map((voice) => {
                        const isSelected = selectedVoice === voice.id;
                        return (
                          <div
                            key={voice.id}
                            className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all cursor-pointer ${
                              isSelected 
                                ? 'border-primary bg-primary/5' 
                                : 'border-border hover:border-primary/50 hover:bg-muted/50'
                            }`}
                            onClick={() => handleVoiceSelect(voice.id)}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'
                              }`}>
                                <Mic className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{voice.name}</span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {voice.gender}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {voice.lang}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">{voice.description}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  testVoice(voice.id);
                                }}
                                disabled={testingVoice === voice.id}
                              >
                                {testingVoice === voice.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Play className="w-4 h-4" />
                                )}
                                <span className="ml-1">Testar</span>
                              </Button>
                              {isSelected && (
                                <CheckCircle className="w-5 h-5 text-primary" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-medium mb-2 text-sm">💡 Sobre as vozes:</h4>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• <strong>Camila</strong> - Ideal para conteúdo profissional e empresarial</li>
                        <li>• <strong>Vitória</strong> - Ótima para conteúdo lifestyle e bem-estar</li>
                        <li>• <strong>Thiago</strong> - Perfeita para tech, games e entretenimento</li>
                        <li>• <strong>Ricardo</strong> - Excelente para documentários e notícias</li>
                        <li>• <strong>Fernanda</strong> - Ideal para conteúdo de Portugal</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Instagram Settings Tab */}
            <TabsContent value="instagram" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Contas Conectadas</h2>
                  <p className="text-muted-foreground text-sm">
                    Gerencie suas contas do Instagram
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

              {loadingAccounts ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : accounts.length > 0 ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
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
                  
                  <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span>
                          Pronto para publicar! Seus posts agendados serão publicados automaticamente.
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="space-y-6">
                  {/* Main Connect Card */}
                  <Card className="bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-orange-500/10 border-purple-500/20">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center mb-4">
                        <Instagram className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">Conecte sua conta</h3>
                      <p className="text-muted-foreground text-center mb-6 max-w-md text-sm">
                        Conecte sua conta Business ou Creator do Instagram para publicar automaticamente.
                      </p>
                      
                      <Button onClick={startOAuth} disabled={connecting} className="bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:opacity-90">
                        {connecting ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Instagram className="w-4 h-4 mr-2" />
                        )}
                        Conectar Instagram
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Instructions Card */}
                  <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-primary" />
                        Como conectar sua conta
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Prerequisites */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Pré-requisitos:</h4>
                        <ul className="text-sm text-muted-foreground space-y-2">
                          <li className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                            <span>Conta do Instagram configurada como <strong>Business</strong> ou <strong>Creator</strong></span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                            <span>Uma <strong>Página do Facebook</strong> vinculada ao Instagram</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                            <span>Ser <strong>administrador</strong> da Página do Facebook</span>
                          </li>
                        </ul>
                      </div>

                      {/* Steps */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Durante a autorização:</h4>
                        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center text-xs flex-shrink-0">✓</div>
                            <div className="text-sm">
                              <p className="font-medium">Selecione sua Página do Facebook</p>
                              <p className="text-muted-foreground text-xs">Escolha a página que está vinculada ao seu Instagram</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center text-xs flex-shrink-0">✓</div>
                            <div className="text-sm">
                              <p className="font-medium">Selecione sua conta do Instagram</p>
                              <p className="text-muted-foreground text-xs">Marque a conta que deseja conectar ao app</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center text-xs flex-shrink-0">✓</div>
                            <div className="text-sm">
                              <p className="font-medium">Conceda TODAS as permissões</p>
                              <p className="text-muted-foreground text-xs">Mantenha todas as opções marcadas para o app funcionar</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Warning */}
                      <Alert className="bg-amber-500/10 border-amber-500/30">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-sm">
                          Se você <strong>desmarcar</strong> alguma permissão ou não selecionar seu Instagram, a conexão falhará.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* TikTok Settings Tab */}
            <TabsContent value="tiktok" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">Contas TikTok</h2>
                  <p className="text-muted-foreground text-sm">
                    Gerencie suas contas do TikTok
                  </p>
                </div>
                <Button onClick={startTikTokOAuth} disabled={connectingTikTok}>
                  {connectingTikTok ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  Conectar TikTok
                </Button>
              </div>

              {tiktokError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Erro de conexão</AlertTitle>
                  <AlertDescription className="flex items-center justify-between">
                    <span>{tiktokError}</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fetchTikTokAccounts()}
                      className="ml-4"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Tentar novamente
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {loadingTikTok ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : tiktokAccounts.length > 0 ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {tiktokAccounts.map(account => (
                      <Card key={account.id} className="border-primary/20">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            {account.avatar_url ? (
                              <img 
                                src={account.avatar_url} 
                                alt={account.username || 'TikTok'} 
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center">
                                <Video className="w-6 h-6 text-white" />
                              </div>
                            )}
                            <div className="flex-1">
                              <p className="font-semibold">@{account.username || account.display_name || 'TikTok User'}</p>
                              <p className="text-sm text-muted-foreground">
                                {getTikTokTokenStatus(account) === 'active' ? (
                                  <span className="text-green-500">● Ativo</span>
                                ) : getTikTokTokenStatus(account) === 'expiring' ? (
                                  <span className="text-amber-500">● Expira em {getTikTokDaysUntilExpiry(account)} dias</span>
                                ) : (
                                  <span className="text-red-500">● Expirado</span>
                                )}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => disconnectTikTok(account.id)}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              Desconectar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-success" />
                        <span>
                          Pronto para publicar no TikTok! Apenas vídeos são suportados.
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : (
                <div className="space-y-6">
                  {/* Main Connect Card */}
                  <Card className="bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-pink-500/10 border-purple-500/20">
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center mb-4">
                        <Video className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">Conecte sua conta TikTok</h3>
                      <p className="text-muted-foreground text-center mb-6 max-w-md text-sm">
                        Conecte sua conta do TikTok para publicar vídeos automaticamente.
                      </p>
                      
                      <Button onClick={startTikTokOAuth} disabled={connectingTikTok} className="bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:opacity-90">
                        {connectingTikTok ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Video className="w-4 h-4 mr-2" />
                        )}
                        Conectar TikTok
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Instructions Card */}
                  <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-primary" />
                        Como conectar sua conta TikTok
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Prerequisites */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Pré-requisitos:</h4>
                        <ul className="text-sm text-muted-foreground space-y-2">
                          <li className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                            <span>Conta do TikTok <strong>verificada</strong></span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                            <span>Aceitar as permissões de <strong>publicação de vídeo</strong></span>
                          </li>
                        </ul>
                      </div>

                      {/* Warning */}
                      <Alert className="bg-cyan-500/10 border-cyan-500/30">
                        <Video className="h-4 w-4 text-cyan-600" />
                        <AlertDescription className="text-sm">
                          <strong>Importante:</strong> O TikTok só permite publicar <strong>vídeos</strong>. Posts com imagens não serão publicados no TikTok.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Settings;