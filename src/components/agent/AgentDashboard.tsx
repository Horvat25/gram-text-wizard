import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstagramAccounts } from '@/hooks/useInstagramAccounts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  Bot, 
  User,
  Loader2,
  Sparkles,
  Calendar,
  Settings,
  History,
  Mic,
  Video,
  Newspaper,
  BarChart3,
  Image as ImageIcon,
  Zap,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { motion, AnimatePresence } from 'framer-motion';
import agentHeroBg from '@/assets/agent-hero-bg.jpg';
import AgentConfigPanel from './AgentConfigPanel';
import AgentExecutionHistory from './AgentExecutionHistory';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

// Type definitions for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface AgentConfig {
  agent_name: string;
  agent_avatar_url: string | null;
  auto_post_enabled?: boolean;
  daily_post_limit?: number;
}

interface ExecutedAction {
  tool: string;
  success: boolean;
  message: string;
  posts?: any[];
  data?: any;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ExecutedAction[];
}

interface AgentDashboardProps {
  onNavigate?: (tab: string) => void;
}

// Quick action cards
const QUICK_ACTIONS = [
  { icon: Sparkles, label: 'Criar Posts', prompt: 'Crie 5 posts criativos para minha marca', color: 'from-violet-500 to-purple-600' },
  { icon: Video, label: 'Vídeo Viral', prompt: 'Crie um vídeo narrado sobre tecnologia', color: 'from-cyan-500 to-blue-600' },
  { icon: Newspaper, label: 'Notícia', prompt: 'Crie um post de notícia sobre IA', color: 'from-amber-500 to-orange-600' },
  { icon: BarChart3, label: 'Analytics', prompt: 'Mostre meus analytics e insights', color: 'from-emerald-500 to-green-600' },
  { icon: Calendar, label: 'Plano Semanal', prompt: 'Crie um plano de conteúdo para 7 dias', color: 'from-pink-500 to-rose-600' },
  { icon: ImageIcon, label: 'Buscar Imagens', prompt: 'Busque imagens sobre robôs humanoides', color: 'from-indigo-500 to-violet-600' },
];

export default function AgentDashboard({ onNavigate }: AgentDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { accounts: instagramAccounts, loading: loadingInstagram } = useInstagramAccounts();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({ 
    agent_name: 'Agente IA', 
    agent_avatar_url: null,
    auto_post_enabled: false,
    daily_post_limit: 2
  });
  const [showExecutionHistory, setShowExecutionHistory] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  
  const hasNoConnectedAccount = !loadingInstagram && instagramAccounts.length === 0;

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'pt-BR';

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
          setInput(transcript);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Reconhecimento de voz não suportado neste navegador');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setInput('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Derive execution history from messages (actions only)
  const executionHistory = useMemo(() => {
    return messages
      .filter(m => m.role === 'user')
      .map((userMsg) => {
        const userMsgIndex = messages.indexOf(userMsg);
        const assistantMsg = messages.slice(userMsgIndex + 1).find(m => m.role === 'assistant');
        
        return {
          id: userMsg.id,
          timestamp: userMsg.timestamp,
          userRequest: userMsg.content,
          thinking: undefined,
          actions: assistantMsg?.actions || [],
          response: assistantMsg?.content || ''
        };
      })
      .filter(e => e.actions.length > 0)
      .reverse();
  }, [messages]);

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
        .select('agent_name, agent_avatar_url, auto_post_enabled, daily_post_limit')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();
      
      if (data) {
        setAgentConfig({
          agent_name: data.agent_name || 'Agente IA',
          agent_avatar_url: data.agent_avatar_url,
          auto_post_enabled: data.auto_post_enabled || false,
          daily_post_limit: data.daily_post_limit || 2
        });
      }
    } catch (error) {
      console.error('Error loading agent config:', error);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          actions: Array.isArray(m.actions) ? (m.actions as unknown as ExecutedAction[]) : []
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

  const clearHistory = async () => {
    if (!user || !currentWorkspace) return;
    
    try {
      await supabase
        .from('agent_chat_messages')
        .delete()
        .eq('workspace_id', currentWorkspace.id);
      
      setMessages([]);
    } catch (error) {
      console.error('Error clearing history:', error);
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
    setInput('');
    setIsLoading(true);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      let formatted = line;
      
      if (formatted.startsWith('# ')) {
        return <h1 key={i} className="text-xl font-bold mb-2 neural-gradient-text">{formatted.slice(2)}</h1>;
      }
      if (formatted.startsWith('## ')) {
        return <h2 key={i} className="text-lg font-semibold mt-3 mb-1">{formatted.slice(3)}</h2>;
      }
      if (formatted.startsWith('### ')) {
        return <h3 key={i} className="text-base font-medium mt-2 mb-1">{formatted.slice(4)}</h3>;
      }
      
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>');
      formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
      
      if (formatted.startsWith('• ') || formatted.startsWith('- ')) {
        return (
          <span key={i} className="flex gap-2 ml-2 py-0.5">
            <span className="text-primary">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatted.slice(2) }} />
          </span>
        );
      }
      
      if (formatted.trim() === '') {
        return <div key={i} className="h-1" />;
      }
      
      return (
        <span key={i} className="block" dangerouslySetInnerHTML={{ __html: formatted }} />
      );
    });
  };

  const hasMessages = messages.length > 0;

  if (isLoadingHistory) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl neural-gradient animate-pulse flex items-center justify-center mx-auto">
              <Bot className="h-8 w-8 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-background bg-emerald-500" />
          </div>
          <p className="text-muted-foreground">Conectando com o agente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Tech Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div 
          className="absolute inset-0 opacity-5 bg-cover bg-center"
          style={{ backgroundImage: `url(${agentHeroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
      </div>
      
      {/* Alert: No Instagram Account Connected */}
      {hasNoConnectedAccount && (
        <Alert 
          className="relative z-20 mx-4 mt-2 border-amber-500/50 bg-amber-500/10 cursor-pointer hover:bg-amber-500/20 transition-colors"
          onClick={() => navigate('/settings?tab=instagram')}
        >
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="flex items-center justify-between text-sm">
            <span className="text-amber-600 dark:text-amber-400">
              <strong>Nenhuma conta conectada.</strong> Clique para conectar Instagram.
            </span>
            <Instagram className="h-4 w-4 text-amber-500 ml-2 flex-shrink-0" />
          </AlertDescription>
        </Alert>
      )}
      
      {/* Minimal Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-2 border-b border-border/50 backdrop-blur-sm bg-background/80">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Avatar className="h-9 w-9 border border-primary/30">
              <AvatarImage src={agentConfig.agent_avatar_url || undefined} />
              <AvatarFallback className="neural-gradient text-white">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background bg-emerald-500" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">{agentConfig.agent_name}</h1>
            <p className="text-[10px] text-muted-foreground">Online • Pronto para ajudar</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {/* Status Pills */}
          <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0.5 hidden sm:flex">
            <span className={cn("w-1.5 h-1.5 rounded-full", agentConfig.auto_post_enabled ? "bg-emerald-500" : "bg-muted-foreground")} />
            {agentConfig.auto_post_enabled ? 'Auto' : 'Manual'}
          </Badge>
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 relative"
            onClick={() => setShowExecutionHistory(true)}
          >
            <History className="h-4 w-4" />
            {executionHistory.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] text-white rounded-full flex items-center justify-center bg-primary">
                {executionHistory.length > 9 ? '9+' : executionHistory.length}
              </span>
            )}
          </Button>
          
          <AgentConfigPanel 
            onConfigChange={(config) => {
              setAgentConfig(prev => ({
                ...prev,
                agent_name: config.agent_name,
                agent_avatar_url: config.agent_avatar_url,
                auto_post_enabled: config.auto_post_enabled,
                daily_post_limit: config.daily_post_limit
              }));
            }}
            onClearChat={clearHistory}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </header>

      {/* Chat Messages Area */}
      <ScrollArea className="flex-1 relative z-10" ref={scrollRef}>
        <div className="p-4 space-y-4 max-w-3xl mx-auto">
          {/* Welcome / Quick Actions when no messages */}
          {!hasMessages && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 py-8"
            >
              {/* Hero */}
              <div className="text-center space-y-3">
                <div className="relative inline-block">
                  <Avatar className="h-16 w-16 border-2 border-primary/30 shadow-lg shadow-primary/20">
                    <AvatarImage src={agentConfig.agent_avatar_url || undefined} />
                    <AvatarFallback className="neural-gradient text-white text-xl">
                      <Bot className="h-8 w-8" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-3 border-background bg-emerald-500" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold neural-gradient-text">{agentConfig.agent_name}</h1>
                  <p className="text-muted-foreground text-sm mt-1">Como posso te ajudar hoje?</p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                  <Zap className="h-3 w-3 text-yellow-500" />
                  Ações rápidas
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {QUICK_ACTIONS.map((action, i) => (
                    <motion.button
                      key={i}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => sendMessage(action.prompt)}
                      disabled={isLoading}
                      className={cn(
                        "relative overflow-hidden rounded-xl p-3 text-left transition-all",
                        "border border-border/50 bg-card/50 backdrop-blur-sm",
                        "hover:border-primary/30 hover:shadow-md",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <div className={cn("p-1.5 rounded-lg w-fit bg-gradient-to-br text-white", action.color)}>
                        <action.icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="block mt-1.5 font-medium text-xs">{action.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* Messages */}
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "flex gap-3",
                  message.role === 'user' ? 'flex-row-reverse' : ''
                )}
              >
                <Avatar className={cn(
                  "h-8 w-8 shrink-0",
                  message.role === 'assistant' ? "neural-gradient" : "bg-secondary"
                )}>
                  <AvatarFallback className="bg-transparent text-white">
                    {message.role === 'assistant' ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4 text-secondary-foreground" />
                    )}
                  </AvatarFallback>
                </Avatar>
                
                <div className={cn(
                  "max-w-[80%] space-y-1",
                  message.role === 'user' ? 'text-right' : ''
                )}>
                  <div className={cn(
                    "rounded-2xl px-4 py-3 inline-block text-left",
                    message.role === 'user' 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted/80 border border-border/50"
                  )}>
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(message.content)}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground px-1">
                    {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <Avatar className="h-8 w-8 neural-gradient">
                <AvatarFallback className="bg-transparent">
                  <Bot className="h-4 w-4 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted/80 border border-border/50 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce bg-primary/70" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce bg-primary/40" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>Digitando...</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Compact Input Bar */}
      <div className="relative z-10 p-3 border-t border-border/50 backdrop-blur-xl bg-background/90">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "🎙️ Ouvindo..." : "Digite sua mensagem..."}
                className={cn(
                  "h-11 pr-20 bg-muted/50 border-border/50 text-sm rounded-xl",
                  "placeholder:text-muted-foreground/70",
                  "focus:border-primary/50 focus:ring-primary/20",
                  isListening && "animate-pulse border-destructive/50"
                )}
                disabled={isLoading}
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleListening}
                  disabled={isLoading}
                  className={cn(
                    "h-8 w-8",
                    isListening 
                      ? "text-destructive bg-destructive/10 animate-pulse"
                      : "text-muted-foreground hover:text-primary"
                  )}
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <Button 
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  size="icon"
                  className="h-8 w-8 neural-gradient border-0 rounded-lg"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Execution History Panel */}
      <AgentExecutionHistory
        executions={executionHistory}
        isOpen={showExecutionHistory}
        onClose={() => setShowExecutionHistory(false)}
      />
    </div>
  );
}
