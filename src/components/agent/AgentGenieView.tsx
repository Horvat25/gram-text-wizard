import { useState, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Loader2,
  Settings,
  TrendingUp,
  Bot,
  History,
  CalendarDays,
  FlaskConical,
  Share2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAgentContext } from '@/hooks/useAgentContext';
import { usePosts } from '@/hooks/usePosts';
import { useVideoRendering } from '@/contexts/VideoRenderingContext';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

import AgentGenie3D from './AgentGenie3D';
import AgentMinimalChat from './AgentMinimalChat';
import AgentProactiveChat from './AgentProactiveChat';
import AgentSettingsPanel from './AgentSettingsPanel';
import AgentGrowthDashboard from './AgentGrowthDashboard';

import PublicationQueueTab from '@/components/tabs/PublicationQueueTab';
import { PostHistoryTab } from '@/components/tabs/PostHistoryTab';

import ContentTestTab from '@/components/tabs/ContentTestTab';
import ArticleDistributionPanel from './ArticleDistributionPanel';

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
    fetchPosts,
  } = usePosts();
  const { renderVideo } = useVideoRendering();
  
  const [igMessages, setIgMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({ 
    agent_name: 'Agente Horvat', 
    agent_avatar_url: null,
    auto_post_enabled: false
  });
  
  // Panel states
  const [showAgentChat, setShowAgentChat] = useState(false);
  const [showHistory] = useState(false); // kept for closeAllPanels compat
  const [showGrowth, setShowGrowth] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showPostHistory, setShowPostHistory] = useState(false);
  const [showContentTest, setShowContentTest] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);

  useEffect(() => {
    if (user && currentWorkspace) {
      loadChatHistory();
      loadAgentConfig();
    }
  }, [user, currentWorkspace]);

  useEffect(() => {
    const onCleared = () => {
      setIgMessages([]);
    };
    const onDeleted = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      if (!id) return;
      setIgMessages(prev => prev.filter(m => m.id !== id));
    };
    window.addEventListener('agent-chat-cleared', onCleared);
    window.addEventListener('agent-chat-message-deleted', onDeleted as EventListener);
    return () => {
      window.removeEventListener('agent-chat-cleared', onCleared);
      window.removeEventListener('agent-chat-message-deleted', onDeleted as EventListener);
    };
  }, []);

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
      const { data } = await supabase
        .from('agent_chat_messages')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('platform', 'instagram')
        .order('created_at', { ascending: true })
        .limit(50);

      const mapMsg = (m: any): Message => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.created_at),
        actions: Array.isArray(m.actions) ? m.actions : []
      });

      if (data && data.length > 0) {
        setIgMessages(data.map(mapMsg));
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const saveMessage = async (message: Message) => {
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
          platform: 'instagram',
        } as any);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || !user || !currentWorkspace) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setIgMessages(prev => [...prev, userMessage]);
    saveMessage(userMessage);
    setIsLoading(true);

    try {
      const chatMessages = igMessages
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));
      
      chatMessages.push({ role: 'user', content: content.trim() });

      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: { 
          messages: chatMessages,
          userId: user.id,
          workspaceId: currentWorkspace?.id,
          platform: 'instagram',
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

      setIgMessages(prev => [...prev, assistantMessage]);
      saveMessage(assistantMessage);
      if (executedActions.some((action: any) => action?.post?.id || action?.post_id)) {
        await fetchPosts();
      }
    } catch (error) {
      console.error('Error sending message to agent:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Erro: ${errorMsg}. Tente novamente.`,
        timestamp: new Date()
      };
      setIgMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const closeAllPanels = () => {
    setShowAgentChat(false);
    setShowGrowth(false);
    setShowQueue(false);
    setShowPostHistory(false);
    setShowContentTest(false);
    setShowDistribution(false);
  };

  const togglePanel = (panel: string) => {
    const isCurrentlyOpen: Record<string, boolean> = {
      agentChat: showAgentChat,
      history: showHistory,
      growth: showGrowth,
      queue: showQueue,
      postHistory: showPostHistory,
      contentTest: showContentTest,
      distribution: showDistribution,
    };

    closeAllPanels();
    if (!isCurrentlyOpen[panel]) {
      switch (panel) {
        case 'agentChat': setShowAgentChat(true); break;
        case 'history': break;
        case 'growth': setShowGrowth(true); break;
        case 'queue': setShowQueue(true); break;
        case 'postHistory': setShowPostHistory(true); break;
        case 'contentTest': setShowContentTest(true); break;
        case 'distribution': setShowDistribution(true); break;
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

            <Button
              variant={showDistribution ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
                showDistribution && "neural-gradient border-0"
              )}
              onClick={() => togglePanel('distribution')}
            >
              <Share2 className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Distribuir</span>
            </Button>

            <div className="w-px h-4 bg-border/50 mx-0.5 shrink-0" />

            <Button
              variant={showPostHistory ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0 opacity-80",
                showPostHistory && "neural-gradient border-0 opacity-100"
              )}
              onClick={() => togglePanel('postHistory')}
            >
              <History className="h-3 w-3" />
              <span className="hidden xs:inline sm:inline">Histórico</span>
            </Button>
          </div>
          
          {/* Right side */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <AgentSettingsPanel 
              activePlatform="instagram"
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
        {/* Growth Dashboard Panel */}
        {showGrowth && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Crescimento — Instagram</h2>
                    <p className="text-xs text-muted-foreground">Analytics e estratégia de conteúdo</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowGrowth(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <AgentGrowthDashboard 
                  context={agentCtx}
                  onUpdate={updateContext}
                  platform="instagram"
                />
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

        {/* Article Distribution Panel */}
        {showDistribution && (
          <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Distribuição — Artigos → IG</h2>
                    <p className="text-xs text-muted-foreground">Cada artigo do Neural Update em múltiplos formatos</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowDistribution(false)} className="h-7 w-7 p-0">✕</Button>
                </div>
                <ArticleDistributionPanel />
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
