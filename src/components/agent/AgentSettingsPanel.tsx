import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { 
  Settings, 
  Loader2,
  Trash2,
  Zap,
  Save,
  Instagram,
  Music2,
  Link2,
  Plus,
  Video,
  Mic,
  Play,
  CheckCircle,
  Moon,
  Sun,
  Sliders,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';

import { useBrandSettings } from '@/hooks/useBrandSettings';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentContext } from '@/hooks/useAgentContext';
import { cn } from '@/lib/utils';

interface AgentSettingsPanelProps {
  trigger?: React.ReactNode;
  onConfigChange?: (config: any) => void;
  onClearChat?: () => void;
  activePlatform?: 'instagram' | 'blog';
}

export default function AgentSettingsPanel({ trigger, onConfigChange, onClearChat, activePlatform = 'instagram' }: AgentSettingsPanelProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { accounts: igAccounts, fetchAccounts: fetchIgAccounts, disconnectAccount: disconnectIg, getTokenStatus: getIgTokenStatus, getDaysUntilExpiry: getIgDaysUntilExpiry } = useInstagramAccounts();

  const { settings: brandSettings, updateSettings: updateBrandSettings } = useBrandSettings();
  
  const [context, setContext] = useState<AgentContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'connections' | 'general'>('connections');
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [connecting, setConnecting] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("camila");
  const [testingVoice, setTestingVoice] = useState<string | null>(null);
  
  const [config, setConfig] = useState({
    agent_name: 'Agente IA',
    agent_avatar_url: null as string | null,
    brand_voice: '',
    personality_traits: ['Analítico', 'Criativo'] as string[],
    content_focus: ['Notícias', 'Tendências'] as string[],
    target_audience: '',
    industry_niche: 'Tecnologia',
    hashtag_strategy: 'moderate',
    preferred_platforms: ['instagram'] as string[],
    auto_post_enabled: false,
    emoji_usage: 'moderate',
    language_formality: 'informal',
    avoid_topics: [] as string[],
    response_style: 'balanced',
  });

  useEffect(() => {
    if (user && currentWorkspace && isOpen) {
      loadContext();
    }
  }, [user, currentWorkspace, isOpen]);

  const loadContext = async () => {
    if (!user || !currentWorkspace) return;
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('agent_context')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setContext(data as AgentContext);
        setConfig({
          agent_name: data.agent_name || 'Agente IA',
          agent_avatar_url: data.agent_avatar_url || null,
          brand_voice: data.brand_voice || '',
          personality_traits: data.personality_traits || ['Analítico', 'Criativo'],
          content_focus: data.content_focus || ['Notícias', 'Tendências'],
          target_audience: data.target_audience || '',
          industry_niche: data.industry_niche || 'Tecnologia',
          hashtag_strategy: data.hashtag_strategy || 'moderate',
          preferred_platforms: data.preferred_platforms || ['instagram'],
          auto_post_enabled: data.auto_post_enabled || false,
          emoji_usage: data.emoji_usage || 'moderate',
          language_formality: data.language_formality || 'informal',
          avoid_topics: data.avoid_topics || [],
          response_style: data.response_style || 'balanced',
        });
      }
    } catch (error) {
      console.error('Error loading context:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !currentWorkspace) return;
    setIsSaving(true);

    try {
      const { data: existing } = await supabase
        .from('agent_context')
        .select('id')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      const updates = {
        ...config,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        await supabase
          .from('agent_context')
          .update(updates)
          .eq('workspace_id', currentWorkspace.id);
      } else {
        await supabase
          .from('agent_context')
          .insert({ user_id: user.id, workspace_id: currentWorkspace.id, ...updates });
      }

      toast.success('Configurações salvas!');
      onConfigChange?.({ ...context, ...config });
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearChat = async () => {
    if (!user || !currentWorkspace) return;
    try {
      await supabase
        .from('agent_chat_messages')
        .delete()
        .eq('workspace_id', currentWorkspace.id);
      toast.success('Histórico limpo!');
      onClearChat?.();
    } catch (error) {
      toast.error('Erro ao limpar histórico');
    }
  };

  const togglePlatform = (platform: string) => {
    const updated = config.preferred_platforms.includes(platform)
      ? config.preferred_platforms.filter(p => p !== platform)
      : [...config.preferred_platforms, platform];
    if (updated.length > 0) {
      setConfig(c => ({ ...c, preferred_platforms: updated }));
    }
  };

  const VOICE_OPTIONS = [
    { id: 'thalita', name: 'Thalita Neural', gender: 'Feminino', description: 'Microsoft Edge Neural — natural e moderna (recomendada)' },
    { id: 'francisca', name: 'Francisca Neural', gender: 'Feminino', description: 'Microsoft Edge Neural — calorosa e expressiva' },
    { id: 'antonio', name: 'Antônio Neural', gender: 'Masculino', description: 'Microsoft Edge Neural — voz de locutor de podcast' },
    { id: 'camila', name: 'Camila (Polly)', gender: 'Feminino', description: 'Amazon Polly — calorosa e profissional' },
    { id: 'vitoria', name: 'Vitória (Polly)', gender: 'Feminino', description: 'Amazon Polly — suave e gentil' },
    { id: 'ricardo', name: 'Ricardo (Polly)', gender: 'Masculino', description: 'Amazon Polly — grave e autoritária' },
  ];

  const startOAuth = async () => {
    setConnecting(true);
    try {
      const publishedOrigin = 'https://gram-text-wizard.lovable.app';
      const redirectUri = `${publishedOrigin}/instagram/callback`;
      const { data, error } = await supabase.functions.invoke('start-oauth', { body: { redirectUri } });
      if (error) throw error;
      sessionStorage.setItem('oauth_state', data.state);
      localStorage.removeItem('oauth_result');
      window.location.href = data.authUrl;
    } catch (e: any) { toast.error(e.message); setConnecting(false); }
  };


  const handleVoiceSelect = (voiceId: string) => {
    setSelectedVoice(voiceId);
    updateBrandSettings({ preferredVoice: voiceId });
    toast.success(`Voz "${VOICE_OPTIONS.find(v => v.id === voiceId)?.name}" selecionada!`);
  };

  const testVoice = async (voiceId: string) => {
    setTestingVoice(voiceId);
    try {
      const { data, error } = await supabase.functions.invoke('lovable-tts', { body: { text: 'Olá! Esta é uma demonstração da voz neural.', voice: voiceId } });
      if (error) throw error;
      if (!data?.audioContent) throw new Error('Sem áudio');
      const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
      audio.onended = () => setTestingVoice(null);
      audio.onerror = () => setTestingVoice(null);
      await audio.play();
    } catch (e: any) { toast.error(e.message); setTestingVoice(null); }
  };

  useEffect(() => { setSelectedVoice(brandSettings.preferredVoice || 'camila'); }, [brandSettings]);

  const sections = [
    { id: 'connections' as const, label: 'Contas', icon: Link2 },
    { id: 'general' as const, label: 'Geral', icon: Sliders },
  ];

  const toggleDarkMode = () => {
    const newVal = !darkMode;
    setDarkMode(newVal);
    if (newVal) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const runCleanup = async () => {
    if (!user || !currentWorkspace) return;
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('agent_chat_messages').delete().eq('workspace_id', currentWorkspace.id).lt('created_at', thirtyDaysAgo);
      await supabase.from('agent_proactive_messages').delete().eq('workspace_id', currentWorkspace.id).lt('created_at', thirtyDaysAgo);

      const { data: chatMessages } = await supabase
        .from('agent_chat_messages')
        .select('id, created_at')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: false });

      if (chatMessages && chatMessages.length > 200) {
        const idsToDelete = chatMessages.slice(200).map(m => m.id);
        await supabase.from('agent_chat_messages').delete().in('id', idsToDelete);
      }

      toast.success('Limpeza concluída! Dados antigos removidos.');
      onClearChat?.();
    } catch (error) {
      console.error('Cleanup error:', error);
      toast.error('Erro na limpeza');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon">
            <Settings className="h-5 w-5" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-4 pb-0">
          <SheetTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg neural-gradient">
              <Settings className="h-4 w-4 text-white" />
            </div>
            Configurações do Agente
          </SheetTitle>
          <SheetDescription>Gerencie contas e configurações gerais</SheetDescription>
        </SheetHeader>
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Section Tabs */}
            <div className="px-4 pt-4">
              <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                      activeSection === section.id 
                        ? "bg-background shadow-sm text-foreground" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <section.icon className="h-4 w-4" />
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1 px-4">
              <div className="py-4 space-y-6">
                <AnimatePresence mode="wait">
                  {/* CONNECTIONS Section — Instagram */}
                  {activeSection === 'connections' && (
                    <motion.div 
                      key="connections"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-5"
                    >
                      {/* Instagram Account */}
                        <div className="space-y-3">
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Instagram className="h-3.5 w-3.5" /> Instagram
                          </Label>
                          {igAccounts.length > 0 ? (
                            <div className="space-y-2">
                              {igAccounts.map(acc => (
                                <div key={acc.id} className="flex items-center justify-between p-3 rounded-xl border border-primary/20 bg-primary/5">
                                  <div className="flex items-center gap-3">
                                    {acc.profile_picture_url ? (
                                      <img src={acc.profile_picture_url} alt={acc.username || ''} className="w-10 h-10 rounded-full object-cover border-2 border-primary/30" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                                        <Instagram className="w-5 h-5 text-white" />
                                      </div>
                                    )}
                                    <div>
                                      <p className="text-sm font-medium">@{acc.username || 'Conectado'}</p>
                                      <Badge variant={getIgTokenStatus(acc.expires_at) === 'active' ? 'default' : 'destructive'} className="text-[10px] h-4">
                                        {getIgTokenStatus(acc.expires_at) === 'active' 
                                          ? `✅ Ativo (${getIgDaysUntilExpiry(acc.expires_at)}d)` 
                                          : '❌ Expirado'}
                                      </Badge>
                                    </div>
                                  </div>
                                  <Button variant="ghost" size="sm" className="text-destructive text-xs h-7" onClick={() => disconnectIg(acc.id)}>
                                    Desconectar
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Button onClick={startOAuth} disabled={connecting} className="w-full gap-2" variant="outline">
                              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                              Conectar Instagram
                            </Button>
                          )}
                        </div>

                    </motion.div>
                  )}

                  {/* General Section */}
                  {activeSection === 'general' && (
                    <motion.div 
                      key="general"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-5"
                    >
                      {/* Dark Mode */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Aparência</Label>
                        <div 
                          className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-all"
                          onClick={toggleDarkMode}
                        >
                          <div className="flex items-center gap-3">
                            {darkMode ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-amber-500" />}
                            <div>
                              <p className="text-sm font-medium">{darkMode ? 'Modo Escuro' : 'Modo Claro'}</p>
                              <p className="text-xs text-muted-foreground">Toque para alternar</p>
                            </div>
                          </div>
                          <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
                        </div>
                      </div>

                      {/* Auto Cleanup */}
                      <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Manutenção</Label>
                        <div className="space-y-3">
                          <div className="p-3 rounded-lg border border-border space-y-2">
                            <p className="text-sm font-medium">Auto-limpeza de dados</p>
                            <p className="text-xs text-muted-foreground">
                              Remove mensagens do chat, relatórios e notificações com mais de 30 dias. Mantém no máximo 200 mensagens recentes.
                            </p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="gap-2 w-full"
                              onClick={runCleanup}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Executar Limpeza Agora
                            </Button>
                          </div>

                          <div className="p-3 rounded-lg border border-destructive/30 space-y-2">
                            <p className="text-sm font-medium text-destructive">Limpar todo o histórico</p>
                            <p className="text-xs text-muted-foreground">
                              Remove todas as mensagens do chat com o agente.
                            </p>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="gap-2 w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={handleClearChat}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Limpar Tudo
                            </Button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 border-t space-y-2">
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                className="w-full gap-2 neural-gradient border-0"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
