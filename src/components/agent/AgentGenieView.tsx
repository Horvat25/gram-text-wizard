import { useState, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { 
  MessageCircle, 
  Rss, 
  FileText, 
  Loader2,
  LayoutDashboard,
  Settings,
  TrendingUp
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAgentContext } from '@/hooks/useAgentContext';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

// Lazy load 3D component to avoid SSR issues
import AgentGenie3D from './AgentGenie3D';
import AgentMinimalChat from './AgentMinimalChat';
import AgentChatPanel from './AgentChatPanel';
import { CustomFeedsManager } from '@/components/CustomFeedsManager';
import AgentResponsesPanel from './AgentResponsesPanel';
import AgentSettingsPanel from './AgentSettingsPanel';
import AgentGrowthDashboard from './AgentGrowthDashboard';

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

interface AgentGenieViewProps {
  onNavigate?: (tab: string) => void;
}

export default function AgentGenieView({ onNavigate }: AgentGenieViewProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { context: agentCtx, updateContext } = useAgentContext();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({ 
    agent_name: 'Agente Horvat', 
    agent_avatar_url: null,
    auto_post_enabled: false
  });
  
  // Panel states
  const [showChat, setShowChat] = useState(false);
  const [showFeeds, setShowFeeds] = useState(false);
  const [showResponses, setShowResponses] = useState(false);
  const [showGrowth, setShowGrowth] = useState(false);

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
      const { data, error } = await supabase
        .from('agent_chat_messages')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        setMessages(data.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
          actions: Array.isArray(m.actions) ? m.actions : []
        })));
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
          actions: message.actions ? JSON.parse(JSON.stringify(message.actions)) : null
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

    setMessages(prev => [...prev, userMessage]);
    saveMessage(userMessage);
    setIsLoading(true);
    
    // Auto open chat when sending a message
    if (!showChat) setShowChat(true);

    try {
      const chatMessages = messages
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));
      
      chatMessages.push({ role: 'user', content: content.trim() });

      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: { 
          messages: chatMessages,
          userId: user.id,
          workspaceId: currentWorkspace?.id
        }
      });

      if (error) {
        console.error('agent-chat invoke error:', error);
        throw error;
      }
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

      setMessages(prev => [...prev, assistantMessage]);
      saveMessage(assistantMessage);
    } catch (error) {
      console.error('Error sending message to agent:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error('Agent error details:', { errorMsg, userId: user?.id, workspaceId: currentWorkspace?.id });
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Erro: ${errorMsg}. Tente novamente.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Close other panels when opening one
  const toggleChat = () => {
    setShowChat(!showChat);
    if (!showChat) {
      setShowFeeds(false);
      setShowResponses(false);
      setShowGrowth(false);
    }
  };

  const toggleFeeds = () => {
    setShowFeeds(!showFeeds);
    if (!showFeeds) {
      setShowChat(false);
      setShowResponses(false);
      setShowGrowth(false);
    }
  };

  const toggleResponses = () => {
    setShowResponses(!showResponses);
    if (!showResponses) {
      setShowChat(false);
      setShowFeeds(false);
      setShowGrowth(false);
    }
  };

  const toggleGrowth = () => {
    setShowGrowth(!showGrowth);
    if (!showGrowth) {
      setShowChat(false);
      setShowFeeds(false);
      setShowResponses(false);
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
    <div className="h-full flex flex-col relative overflow-hidden bg-background">
      {/* 3D Background */}
      <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
        <AgentGenie3D isProcessing={isLoading} />
      </Suspense>
      
      {/* Top Bar - Minimal with all controls */}
      <header className="relative z-20 flex items-center justify-between px-2 sm:px-4 py-2 gap-1">
        {/* Left side - Chat, Library, Responses buttons */}
        <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 overflow-x-auto no-scrollbar">
          <Button
            variant={showChat ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
              showChat && "neural-gradient border-0"
            )}
            onClick={toggleChat}
          >
            <MessageCircle className="h-3 w-3" />
            <span className="hidden xs:inline sm:inline">Chat</span>
          </Button>
          
          <Button
            variant={showFeeds ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
              showFeeds && "neural-gradient border-0"
            )}
            onClick={toggleFeeds}
          >
            <Rss className="h-3 w-3" />
            <span className="hidden xs:inline sm:inline">Fontes</span>
          </Button>
          
          <Button
            variant={showResponses ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
              showResponses && "neural-gradient border-0"
            )}
            onClick={toggleResponses}
          >
            <FileText className="h-3 w-3" />
            <span className="hidden xs:inline sm:inline">Respostas</span>
          </Button>
          
          <Button
            variant={showGrowth ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs shrink-0",
              showGrowth && "neural-gradient border-0"
            )}
            onClick={toggleGrowth}
          >
            <TrendingUp className="h-3 w-3" />
            <span className="hidden xs:inline sm:inline">Crescimento</span>
          </Button>
        </div>
        
        {/* Right side - Settings and Dashboard */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <AgentSettingsPanel 
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
          
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-1.5 sm:px-2 text-[11px] sm:text-xs"
            onClick={() => onNavigate?.('dashboard')}
          >
            <LayoutDashboard className="h-3 w-3" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
        </div>
      </header>
      
      {/* Center Area - 3D Genie Display (expanded) */}
      <div className="flex-1 relative z-10 flex items-center justify-center">
        {/* Floating Agent Name */}
        <div className="absolute bottom-4 text-center">
          <h2 className="text-xl font-bold bg-gradient-to-r from-primary via-violet-400 to-primary bg-clip-text text-transparent">
            {agentConfig.agent_name}
          </h2>
        </div>
      </div>
      
      {/* Minimal Chat Input - Always visible at bottom */}
      <AgentMinimalChat 
        onSend={sendMessage}
        isLoading={isLoading}
      />
      
      {/* Sliding Panels */}
      <AgentChatPanel
        isOpen={showChat}
        onClose={() => setShowChat(false)}
        messages={messages}
        agentName={agentConfig.agent_name}
        agentAvatar={agentConfig.agent_avatar_url}
      />
      
      {/* Feeds Sources Panel */}
      {showFeeds && (
        <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 max-w-lg mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-sm">Fontes de Conteúdo</h2>
                  <p className="text-xs text-muted-foreground">Sites que o agente usa para buscar notícias</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowFeeds(false)} className="h-7 w-7 p-0">✕</Button>
              </div>
              <CustomFeedsManager />
            </div>
          </ScrollArea>
        </div>
      )}
      
      <AgentResponsesPanel
        isOpen={showResponses}
        onClose={() => setShowResponses(false)}
      />
      
      {/* Growth Dashboard Panel */}
      {showGrowth && (
        <div className="absolute inset-x-0 bottom-14 top-12 z-30 bg-background/95 backdrop-blur-md border-t border-border/50 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 max-w-lg mx-auto">
              <AgentGrowthDashboard context={agentCtx} onUpdate={updateContext} />
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
