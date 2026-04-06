import { useState, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Rss, 
  Loader2,
  Settings,
  TrendingUp,
  Megaphone,
  Bot,
  History,
  CalendarDays,
  Instagram,
  Film,
  FlaskConical,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAgentContext } from '@/hooks/useAgentContext';
import { usePosts } from '@/hooks/usePosts';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

import AgentGenie3D from './AgentGenie3D';
import AgentMinimalChat from './AgentMinimalChat';
import AgentChatPanel from './AgentChatPanel';
import AgentProactiveChat from './AgentProactiveChat';
import { CustomFeedsManager } from '@/components/CustomFeedsManager';
import AgentSettingsPanel from './AgentSettingsPanel';
import AgentGrowthDashboard from './AgentGrowthDashboard';
import AgentMarketingPanel from './AgentMarketingPanel';
import TikTokGrowthDashboard from './TikTokGrowthDashboard';
import PublicationQueueTab from '@/components/tabs/PublicationQueueTab';
import { PostHistoryTab } from '@/components/tabs/PostHistoryTab';
import TikTokContentCreation from '@/components/TikTokContentCreation';
import VideoClipsTab from '@/components/tabs/VideoClipsTab';
import ContentTestTab from '@/components/tabs/ContentTestTab';
import { Platform } from '@/components/PlatformSelector';

// Small TikTok icon
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const PlatformToggle = ({ selected, onSelect }: { selected: Platform; onSelect: (p: Platform) => void }) => (
  <div className="flex items-center bg-muted/50 rounded-md p-0.5">
    <button
      onClick={() => onSelect("instagram")}
      className={cn(
        "p-1 rounded transition-all",
        selected === "instagram" 
          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm" 
          : "text-muted-foreground hover:text-foreground"
      )}
      title="Instagram"
    >
      <Instagram className="h-3.5 w-3.5" />
    </button>
    <button
      onClick={() => onSelect("tiktok")}
      className={cn(
        "p-1 rounded transition-all",
        selected === "tiktok" 
          ? "bg-gradient-to-r from-cyan-500 to-pink-500 text-white shadow-sm" 
          : "text-muted-foreground hover:text-foreground"
      )}
      title="TikTok"
    >
      <TikTokIcon className="h-3.5 w-3.5" />
    </button>
  </div>
);

interface AgentConfig {
  agent_name: string;
  agent_avatar_url: string | null;
  auto_post_enabled?: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: any[];
}

export default function AgentGenieView() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { context: agentCtx, updateContext } = useAgentContext();
  
  const {
    posts,
    publishPost,
    reschedulePost,
    deletePost,
    updatePost,
  } = usePosts();
  
  const [igMessages, setIgMessages] = useState<Message[]>([]);
  const [tkMessages, setTkMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({ 
    agent_name: 'Agente Horvat', 
    agent_avatar_url: null,
    auto_post_enabled: false
  });
  
  // Platform toggle
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("instagram");
  
  // Panel states
  const [showAgentChat, setShowAgentChat] = useState(false);
  const [showHistory] = useState(false); // kept for closeAllPanels compat
  const [showGrowth, setShowGrowth] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showPostHistory, setShowPostHistory] = useState(false);
  const [showVideoClips, setShowVideoClips] = useState(false);
  const [showContentTest, setShowContentTest] = useState(false);
  
  // TikTok panel states
    const [showTikTokQueue, setShowTikTokQueue] = useState(false);
    const [showTikTokHistory, setShowTikTokHistory] = useState(false);
    const [showTikTokGrowth, setShowTikTokGrowth] = useState(false);

  useEffect(() => {
    if (user && currentWorkspace) {
      loadChatHistory();
      loadAgentConfig();
    }
  }, [user, currentWorkspace]);

  const loadAgentConfig = async () => {
    if (!user || !currentWorkspace) return;
    try {
      const { data } = await supabase
        .from('agent_context')
        .select('agent_name, agent_avatar_url, auto_post_enabled')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();
      
      if (data) {
        setAgentConfig({
          agent_name: data.agent_name || 'Agente Horvat',
          agent_avatar_url: data.agent_avatar_url,
          auto_post_enabled: data.auto_post_enabled || false
        });
      }
    } catch (error) {
      console.error('Error loading agent config:', error);
    }
  };

  const loadChatHistory = async () => {
    if (!user || !currentWorkspace) return;
    
    setIsLoadingHistory(true);
    try {
      // Load both platforms in parallel
      const [igResult, tkResult] = await Promise.all([
        supabase
          .from('agent_chat_messages')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .eq('platform', 'instagram')
          .order('created_at', { ascending: true })
          .limit(50),
        supabase
          .from('agent_chat_messages')
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .eq('platform', 'tiktok')
          .order('created_at', { ascending: true })
          .limit(50),
      ]);

      const mapMsg = (m: any): Message => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
        actions: Array.isArray(m.actions) ? m.actions : []
      });

      if (igResult.data && igResult.data.length > 0) {
        setIgMessages(igResult.data.map(mapMsg));
      }
      if (tkResult.data && tkResult.data.length > 0) {
        setTkMessages(tkResult.data.map(mapMsg));
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const saveMessage = async (message: Message, platform: string) => {
    if (!user || !currentWorkspace) return;
    
    try {
      await supabase
        .from('agent_chat_messages')
        .insert({
          user_id: user.id,
          workspace_id: currentWorkspace.id,
          role: message.role,
          content: message.content,
          actions: message.actions ? JSON.parse(JSON.stringify(message.actions)) : null,
          platform,
        } as any);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !user || !currentWorkspace) return;

    const platform = selectedPlatform;
    const setMsgs = platform === 'tiktok' ? setTkMessages : setIgMessages;
    const msgs = platform === 'tiktok' ? tkMessages : igMessages;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMsgs(prev => [...prev, userMessage]);
    saveMessage(userMessage, platform);
    setIsLoading(true);
    
    if (!showHistory) 

    try {
      const chatMessages = msgs
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));
      
      chatMessages.push({ role: 'user', content: content.trim() });

      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: { 
          messages: chatMessages,
          userId: user.id,
          workspaceId: currentWorkspace?.id,
          platform,
        }
      });

      if (error) throw error;
      if (!data) throw new Error('Resposta vazia do servidor');
      if (data.error) throw new Error(data.error);

      const assistantContent = data.content || 'Desculpe, não consegui processar.';
      const executedActions = data.actions || [];

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        actions: executedActions
      };

      setMsgs(prev => [...prev, assistantMessage]);
      saveMessage(assistantMessage, platform);
    } catch (error) {
      console.error('Error sending message to agent:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Erro: ${errorMsg}. Tente novamente.`,
        timestamp: new Date()
      };
      setMsgs(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };


  const closeAllPanels = () => {
    setShowAgentChat(false);
    setShowGrowth(false);
    setShowQueue(false);
    setShowPostHistory(false);
    setShowVideoClips(false);
    setShowContentTest(false);
    setShowTikTokQueue(false);
    setShowTikTokHistory(false);
    setShowTikTokGrowth(false);
  };

  const togglePanel = (panel: string) => {
    const isCurrentlyOpen: Record<string, boolean> = {
      agentChat: showAgentChat,
      history: showHistory,
      growth: showGrowth,
      queue: showQueue,
      postHistory: showPostHistory,
      videoClips: showVideoClips,
      contentTest: showContentTest,
      tiktokQueue: showTikTokQueue,
      tiktokHistory: showTikTokHistory,
      tiktokGrowth: showTikTokGrowth,
    };

    closeAllPanels();
    if (!isCurrentlyOpen[panel]) {
      switch (panel) {
        case 'agentChat': setShowAgentChat(true); break;
        case 'history':  break;
        case 'growth': setShowGrowth(true); break;
        
        case 'queue': setShowQueue(true); break;
        case 'postHistory': setShowPostHistory(true); break;
        case 'videoClips': setShowVideoClips(true); break;
        case 'contentTest': setShowContentTest(true); break;
        case 'tiktokQueue': setShowTikTokQueue(true); break;
        case 'tiktokHistory': setShowTikTokHistory(true); break;
        case 'tiktokGrowth': setShowTikTokGrowth(true); break;
      }
    }
  };

  if (isLoadingHistory) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Conectando com o agente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
    {selectedPlatform === "tiktok" ? (
      <div className="h-full flex flex-col relative overflow-hidden bg-background">
        {/* 3D Background */}
        <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
          <AgentGenie3D isProcessing={isLoading} />
        </Suspense>
        
        {/* Top Bar */}
        <header className="relative z-20 flex items-center justify-between px-2 sm:px-4 py-2 gap-1">
          <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 overflow-x-auto no-scrollbar">
            <Button
              variant={showHistory ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showHistory && "bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-0"
              )}
              onClick={() => togglePanel('history')}
            >
              <Bot className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Chat</span>
            </Button>
            
            <Button
              variant={showTikTokQueue ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showTikTokQueue && "bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-0"
              )}
              onClick={() => togglePanel('tiktokQueue')}
            >
              <CalendarDays className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Fila</span>
            </Button>
            
            <Button
              variant={showTikTokHistory ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showTikTokHistory && "bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-0"
              )}
              onClick={() => togglePanel('tiktokHistory')}
            >
              <History className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Posts</span>
            </Button>
            
            <Button
              variant={showTikTokGrowth ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showTikTokGrowth && "bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-0"
              )}
              onClick={() => togglePanel('tiktokGrowth')}
            >
              <TrendingUp className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Crescimento</span>
            </Button>
          </div>
          
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <PlatformToggle selected={selectedPlatform} onSelect={setSelectedPlatform} />
            <AgentSettingsPanel 
              activePlatform={selectedPlatform}
              trigger={
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              }
              onConfigChange={(config) => {
                setAgentConfig(prev => ({
                  ...prev,
                  agent_name: config.agent_name,
                  agent_avatar_url: config.agent_avatar_url,
                  auto_post_enabled: config.auto_post_enabled
                }));
              }}
            />
          </div>
        </header>
        
        {/* Center Area - 3D Genie Display */}
        <div className="flex-1 relative z-10 flex items-center justify-center">
          <div className="absolute bottom-4 text-center">
            <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {agentConfig.agent_name}
            </h2>
            <p className="text-xs text-muted-foreground">TikTok</p>
          </div>
        </div>
        
        {/* Minimal Chat Input */}
        <AgentMinimalChat 
          onSend={sendMessage}
          isLoading={isLoading}
          placeholder="Peça ao agente para criar vídeos..."
        />

        {/* Agent Unified Panel */}
        <AgentProactiveChat
          isOpen={showAgentChat}
          onClose={() => setShowAgentChat(false)}
          agentName={agentConfig.agent_name}
          agentAvatar={agentConfig.agent_avatar_url}
        />
        
        {/* Chat history moved into Agente panel */}
        
        {/* TikTok Queue Panel */}
        {showTikTokQueue && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Fila — TikTok</h2>
                    <p className="text-xs text-muted-foreground">Vídeos agendados e rascunhos</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowTikTokQueue(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <PublicationQueueTab
                  posts={posts.filter(p => p.platforms?.includes('tiktok'))}
                  onPublish={publishPost}
                  onReschedule={reschedulePost}
                  onDelete={deletePost}
                  onUpdate={updatePost}
                />
              </div>
            </ScrollArea>
          </div>
        )}
        
        {/* TikTok Post History Panel */}
        {showTikTokHistory && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Histórico — TikTok</h2>
                    <p className="text-xs text-muted-foreground">Vídeos publicados</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowTikTokHistory(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <PostHistoryTab platform="tiktok" />
              </div>
            </ScrollArea>
          </div>
        )}
        
        {/* TikTok Growth Panel */}
        {showTikTokGrowth && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Crescimento — TikTok</h2>
                    <p className="text-xs text-muted-foreground">Métricas e estratégia de crescimento</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowTikTokGrowth(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <TikTokGrowthDashboard />
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    ) : (
      /* Instagram / Agent View */
      <div className="h-full flex flex-col relative overflow-hidden bg-background">
        {/* 3D Background */}
        <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
          <AgentGenie3D isProcessing={isLoading} />
        </Suspense>
        
        {/* Top Bar */}
        <header className="relative z-20 flex items-center justify-between px-2 sm:px-4 py-2 gap-1">
          {/* Left side tabs */}
          <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 overflow-x-auto no-scrollbar">
            <Button
              variant={showAgentChat ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showAgentChat && "neural-gradient border-0"
              )}
              onClick={() => togglePanel('agentChat')}
            >
              <Bot className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Agente</span>
            </Button>
            
            <Button
              variant={showQueue ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showQueue && "neural-gradient border-0"
              )}
              onClick={() => togglePanel('queue')}
            >
              <CalendarDays className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Fila</span>
            </Button>

            <Button
              variant={showGrowth ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showGrowth && "neural-gradient border-0"
              )}
              onClick={() => togglePanel('growth')}
            >
              <TrendingUp className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Crescimento</span>
            </Button>

            <Button
              variant={showPostHistory ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showPostHistory && "neural-gradient border-0"
              )}
              onClick={() => togglePanel('postHistory')}
            >
              <History className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Posts</span>
            </Button>
            
            <Button
              variant={showVideoClips ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showVideoClips && "neural-gradient border-0"
              )}
              onClick={() => togglePanel('videoClips')}
            >
              <Film className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Clips</span>
            </Button>
            
            <Button
              variant={showContentTest ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showContentTest && "neural-gradient border-0"
              )}
              onClick={() => togglePanel('contentTest')}
            >
              <FlaskConical className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Teste</span>
            </Button>
          </div>
          
          {/* Right side */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <PlatformToggle selected={selectedPlatform} onSelect={setSelectedPlatform} />

            <AgentSettingsPanel 
              activePlatform={selectedPlatform}
              trigger={
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              }
              onConfigChange={(config) => {
                setAgentConfig(prev => ({
                  ...prev,
                  agent_name: config.agent_name,
                  agent_avatar_url: config.agent_avatar_url,
                  auto_post_enabled: config.auto_post_enabled
                }));
              }}
            />
          </div>
        </header>
        
        {/* Center Area - 3D Genie Display */}
        <div className="flex-1 relative z-10 flex items-center justify-center">
          <div className="absolute bottom-4 text-center">
            <h2 className="text-xl font-bold bg-gradient-to-r from-primary via-violet-400 to-primary bg-clip-text text-transparent">
              {agentConfig.agent_name}
            </h2>
          </div>
        </div>
        
        {/* Minimal Chat Input */}
        <AgentMinimalChat 
          onSend={sendMessage}
          isLoading={isLoading}
          placeholder="Peça algo ao agente..."
        />
        
        {/* Agent Unified Panel */}
        <AgentProactiveChat
          isOpen={showAgentChat}
          onClose={() => setShowAgentChat(false)}
          agentName={agentConfig.agent_name}
          agentAvatar={agentConfig.agent_avatar_url}
        />
        
        {/* Chat history moved into Agente panel */}
        
        {/* Queue Panel */}
        {showQueue && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Fila — Instagram</h2>
                    <p className="text-xs text-muted-foreground">Posts agendados e rascunhos</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowQueue(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <PublicationQueueTab
                  posts={posts}
                  onPublish={publishPost}
                  onReschedule={reschedulePost}
                  onDelete={deletePost}
                  onUpdate={updatePost}
                />
              </div>
            </ScrollArea>
          </div>
        )}
        
        {/* Post History Panel */}
        {showPostHistory && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Histórico — Instagram</h2>
                    <p className="text-xs text-muted-foreground">Calendário de posts publicados</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowPostHistory(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <PostHistoryTab platform="instagram" />
              </div>
            </ScrollArea>
          </div>
        )}
        
        
        
        {/* Video Clips Panel */}
        {showVideoClips && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Vídeo Clips</h2>
                    <p className="text-xs text-muted-foreground">Cortes automáticos para Reels</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowVideoClips(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <VideoClipsTab />
              </div>
            </ScrollArea>
          </div>
        )}
        
        {/* Content Test Panel */}
        {showContentTest && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Teste de Conteúdo</h2>
                    <p className="text-xs text-muted-foreground">Gere 1 exemplo de cada tipo para testar</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowContentTest(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <ContentTestTab />
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    )}
    </div>
  );
}
