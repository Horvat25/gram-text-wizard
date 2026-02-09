import { useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MessageCircle, 
  ImageIcon, 
  FileText, 
  Settings,
  Bot,
  Loader2,
  LayoutDashboard
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Lazy load 3D component to avoid SSR issues
import AgentGenie3D from './AgentGenie3D';
import AgentMinimalChat from './AgentMinimalChat';
import AgentChatPanel from './AgentChatPanel';
import AgentLibraryPanel from './AgentLibraryPanel';
import AgentResponsesPanel from './AgentResponsesPanel';
import AgentConfigPanel from './AgentConfigPanel';

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

interface ExecutedAction {
  tool: string;
  success: boolean;
  message: string;
}

interface AgentGenieViewProps {
  onNavigate?: (tab: string) => void;
}

export default function AgentGenieView({ onNavigate }: AgentGenieViewProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  
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
  const [showLibrary, setShowLibrary] = useState(false);
  const [showResponses, setShowResponses] = useState(false);

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
    if (!content.trim() || !user) return;

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

      if (error) throw error;
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
      console.error('Error sending message:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ ${errorMsg}`,
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
      setShowLibrary(false);
      setShowResponses(false);
    }
  };

  const toggleLibrary = () => {
    setShowLibrary(!showLibrary);
    if (!showLibrary) {
      setShowChat(false);
      setShowResponses(false);
    }
  };

  const toggleResponses = () => {
    setShowResponses(!showResponses);
    if (!showResponses) {
      setShowChat(false);
      setShowLibrary(false);
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
      
      {/* Top Bar - Minimal */}
      <header className="relative z-20 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-10 w-10 border-2 border-primary/30 shadow-lg">
              <AvatarImage src={agentConfig.agent_avatar_url || undefined} />
              <AvatarFallback className="neural-gradient text-primary-foreground">
                <Bot className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background bg-emerald-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">{agentConfig.agent_name}</h1>
            <p className="text-xs text-muted-foreground">Online • Pronto para ajudar</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs gap-1.5 px-2.5 py-1 bg-card/50 backdrop-blur-sm">
            <span className={cn(
              "w-2 h-2 rounded-full",
              agentConfig.auto_post_enabled ? "bg-emerald-500" : "bg-muted-foreground"
            )} />
            {agentConfig.auto_post_enabled ? 'Auto' : 'Manual'}
          </Badge>
          
          <AgentConfigPanel 
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
            variant="outline"
            size="sm"
            className="gap-1.5 bg-card/50 backdrop-blur-sm"
            onClick={() => onNavigate?.('dashboard')}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>
        </div>
      </header>
      
      {/* Center Area - 3D Genie Display */}
      <div className="flex-1 relative z-10 flex items-center justify-center">
        {/* Floating Agent Name */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-8 text-center"
        >
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary via-violet-400 to-primary bg-clip-text text-transparent">
            {agentConfig.agent_name}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Seu assistente de conteúdo inteligente
          </p>
        </motion.div>
      </div>
      
      {/* Floating Action Buttons */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-28 z-20 flex items-center gap-3">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant={showChat ? "default" : "outline"}
            size="lg"
            className={cn(
              "rounded-2xl gap-2 shadow-lg",
              showChat ? "neural-gradient" : "bg-card/80 backdrop-blur-sm"
            )}
            onClick={toggleChat}
          >
            <MessageCircle className="h-5 w-5" />
            Chat
            {messages.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {messages.length}
              </Badge>
            )}
          </Button>
        </motion.div>
        
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant={showLibrary ? "default" : "outline"}
            size="lg"
            className={cn(
              "rounded-2xl gap-2 shadow-lg",
              showLibrary ? "neural-gradient" : "bg-card/80 backdrop-blur-sm"
            )}
            onClick={toggleLibrary}
          >
            <ImageIcon className="h-5 w-5" />
            Biblioteca
          </Button>
        </motion.div>
        
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            variant={showResponses ? "default" : "outline"}
            size="lg"
            className={cn(
              "rounded-2xl gap-2 shadow-lg",
              showResponses ? "neural-gradient" : "bg-card/80 backdrop-blur-sm"
            )}
            onClick={toggleResponses}
          >
            <FileText className="h-5 w-5" />
            Respostas
          </Button>
        </motion.div>
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
      
      <AgentLibraryPanel
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
      />
      
      <AgentResponsesPanel
        isOpen={showResponses}
        onClose={() => setShowResponses(false)}
      />
    </div>
  );
}
