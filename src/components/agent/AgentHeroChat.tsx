import { useState, useRef, useEffect, useMemo } from 'react';

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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  Bot, 
  User, 
  Loader2,
  Sparkles,
  Calendar,
  CheckCircle2,
  XCircle,
  Settings,
  History,
  Mic,
  Video,
  Newspaper,
  Bell,
  Play
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import agentHeroBg from '@/assets/agent-hero-bg.jpg';
import AgentConfigPanel from './AgentConfigPanel';
import AgentExecutionHistory from './AgentExecutionHistory';
import { cn } from '@/lib/utils';
import { usePendingVideos } from '@/hooks/usePendingVideos';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface AgentConfig {
  agent_name: string;
  agent_avatar_url: string | null;
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

interface AgentHeroChatProps {
  onNavigate?: (tab: string) => void;
}

// Unified quick actions
const QUICK_ACTIONS = [
  { icon: Sparkles, label: 'Criar 5 posts', prompt: 'Crie 5 posts criativos e salve como rascunhos', color: 'from-violet-500 to-purple-500' },
  { icon: Video, label: 'Criar Vídeo', prompt: 'Crie um vídeo viral sobre IA', color: 'from-cyan-500 to-blue-500' },
  { icon: Newspaper, label: 'Post de Notícia', prompt: 'Crie um post de notícia sobre tecnologia com headline na imagem', color: 'from-amber-500 to-orange-500' },
  { icon: Calendar, label: 'Plano 7 dias', prompt: 'Crie um plano de conteúdo para os próximos 7 dias', color: 'from-emerald-500 to-green-500' },
];

const WELCOME_MESSAGE = `# 🤖 Olá! Sou seu Agente de Conteúdo

Sou uma **IA autônoma** focada em criar conteúdo para suas redes sociais.

## 🛠️ O que posso fazer:
• **Criar posts** → Imagens, carrosséis, vídeos narrados
• **Posts de notícia** → Com headline na imagem (estilo @davision.eth)
• **Agendar publicações** → Horários otimizados
• **Analisar métricas** → Insights de performance

## 💡 Exemplos:
_"Crie um post de notícia sobre IA"_
_"Crie 5 posts para a próxima semana"_
_"Mostre meus analytics dos últimos 30 dias"_

**O que você gostaria que eu faça?**`;

export default function AgentHeroChat({ onNavigate }: AgentHeroChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({ agent_name: 'Agente IA', agent_avatar_url: null });
  const [showExecutionHistory, setShowExecutionHistory] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  
  // Pending videos and notifications
  const { pendingVideos, count: pendingCount } = usePendingVideos();
  const { isSupported: notifSupported, permission: notifPermission, requestPermission } = usePushNotifications();

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

  // Derive execution history from messages
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
      .filter(e => e.actions.length > 0 || e.response)
      .reverse();
  }, [messages]);

  useEffect(() => {
    if (user) {
      loadChatHistory();
      loadAgentConfig();
    }
  }, [user]);

  const loadAgentConfig = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('agent_context')
        .select('agent_name, agent_avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (data) {
        setAgentConfig({
          agent_name: data.agent_name || 'Agente IA',
          agent_avatar_url: data.agent_avatar_url
        });
      }
    } catch (error) {
      console.error('Error loading agent config:', error);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoadingHistory]);

  const loadChatHistory = async () => {
    if (!user) return;
    
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('agent_chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        setMessages(data.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at),
          actions: m.actions || []
        })));
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: WELCOME_MESSAGE,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: WELCOME_MESSAGE,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const saveMessage = async (message: Message) => {
    if (!user || message.id === 'welcome') return;
    
    try {
      const { error } = await supabase
        .from('agent_chat_messages')
        .insert({
          user_id: user.id,
          role: message.role,
          content: message.content,
          actions: message.actions ? JSON.parse(JSON.stringify(message.actions)) : null
        } as any);
        
      if (error) throw error;
    } catch (error) {
      console.error('Error saving message:', error);
    }
  };

  const clearHistory = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('agent_chat_messages')
        .delete()
        .eq('user_id', user.id);
      
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: WELCOME_MESSAGE,
        timestamp: new Date()
      }]);
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
        .filter(m => m.id !== 'welcome')
        .slice(-20)
        .map(m => ({ role: m.role, content: m.content }));
      
      chatMessages.push({ role: 'user', content: content.trim() });

      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: { 
          messages: chatMessages,
          userId: user.id
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
        return <h1 key={i} className="text-xl font-bold mb-2">{formatted.slice(2)}</h1>;
      }
      if (formatted.startsWith('## ')) {
        return <h2 key={i} className="text-lg font-semibold mt-3 mb-1">{formatted.slice(3)}</h2>;
      }
      
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
      
      if (formatted.startsWith('• ') || formatted.startsWith('- ')) {
        return (
          <span key={i} className="flex gap-2 ml-2">
            <span className="text-primary">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatted.slice(2) }} />
          </span>
        );
      }
      
      return (
        <span key={i} className="block" dangerouslySetInnerHTML={{ __html: formatted }} />
      );
    });
  };

  if (isLoadingHistory) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando conversa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Background */}
      <div 
        className="absolute inset-0 opacity-10 bg-cover bg-center pointer-events-none"
        style={{ backgroundImage: `url(${agentHeroBg})` }}
      />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-background/80 via-background/95 to-background" />
      
      {/* Compact Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 border-b backdrop-blur-sm border-primary/30 bg-gradient-to-r from-primary/5 to-violet-500/5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-9 w-9 border border-primary/50 shadow-md shadow-primary/20">
              <AvatarImage src={agentConfig.agent_avatar_url || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-violet-500 text-white">
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background bg-green-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold bg-gradient-to-r from-primary to-violet-500 bg-clip-text text-transparent">
              {agentConfig.agent_name}
            </h1>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
              Todas as plataformas
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
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
              setAgentConfig({
                agent_name: config.agent_name,
                agent_avatar_url: config.agent_avatar_url
              });
            }}
            onClearChat={clearHistory}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
            }
          />
        </div>
      </div>

      {/* Pending Videos Notification */}
      {pendingCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mx-4 mt-2 p-3 rounded-xl border bg-amber-500/10 border-amber-500/30"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20">
                <Video className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                  🎬 {pendingCount} vídeo{pendingCount > 1 ? 's' : ''} aguardando renderização
                </p>
                <p className="text-xs text-muted-foreground">
                  Criados pelo agente • Precisa renderizar no navegador
                </p>
              </div>
            </div>
            <Button 
              size="sm" 
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => onNavigate?.('queue')}
            >
              <Play className="h-3.5 w-3.5" />
              Renderizar
            </Button>
          </div>
        </motion.div>
      )}

      {/* Notification Permission Request */}
      {notifSupported && notifPermission === 'default' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 mx-4 mt-2 p-3 rounded-xl border bg-primary/5 border-primary/20"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Ativar Notificações</p>
                <p className="text-xs text-muted-foreground">
                  Receba avisos quando o agente criar conteúdo
                </p>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline"
              className="gap-1.5"
              onClick={requestPermission}
            >
              <Bell className="h-3.5 w-3.5" />
              Ativar
            </Button>
          </div>
        </motion.div>
      )}

      {/* Messages Area */}
      <ScrollArea className="flex-1 relative z-10" ref={scrollRef}>
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <Avatar className={cn(
                  "h-10 w-10 shrink-0 shadow-lg",
                  message.role === 'assistant' 
                    ? "bg-gradient-to-br from-primary to-violet-500 shadow-primary/20"
                    : "bg-secondary"
                )}>
                  <AvatarFallback className="bg-transparent">
                    {message.role === 'assistant' ? (
                      <Bot className="h-5 w-5 text-white" />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </AvatarFallback>
                </Avatar>
                
                <div className={`max-w-[85%] space-y-2 ${message.role === 'user' ? 'ml-auto' : ''}`}>
                  <div className={cn(
                    "rounded-2xl px-5 py-4",
                    message.role === 'user' 
                      ? "bg-gradient-to-r from-primary to-violet-500 text-white"
                      : "bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm"
                  )}>
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(message.content)}
                    </div>
                    <span className="text-[10px] opacity-50 mt-2 block">
                      {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  {message.actions && message.actions.length > 0 && (
                    <div className="space-y-2 pl-2">
                      {message.actions.map((action, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className={`flex items-center gap-2 text-xs p-3 rounded-xl border ${
                            action.success 
                              ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400' 
                              : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {action.success ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 shrink-0" />
                          )}
                          <span className="flex-1 font-medium">{action.message}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {action.tool.replace(/_/g, ' ')}
                          </Badge>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4"
            >
              <Avatar className="h-10 w-10 shadow-lg bg-gradient-to-br from-primary to-violet-500 shadow-primary/20">
                <AvatarFallback className="bg-transparent">
                  <Bot className="h-5 w-5 text-white" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce bg-violet-500" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>Processando sua solicitação...</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Quick Actions */}
      {messages.length <= 2 && (
        <div className="relative z-10 px-6 pb-4">
          <div className="max-w-4xl mx-auto">
            <p className="text-xs text-muted-foreground mb-3">⚡ Ações rápidas:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {QUICK_ACTIONS.map((action, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="h-auto py-3 px-4 flex flex-col items-start gap-1.5 text-left transition-all group hover:border-primary/50"
                  onClick={() => sendMessage(action.prompt)}
                  disabled={isLoading}
                >
                  <div className={`p-1.5 rounded-lg bg-gradient-to-br ${action.color} text-white`}>
                    <action.icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-xs font-medium transition-colors group-hover:text-primary">
                    {action.label}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="relative z-10 p-6 border-t backdrop-blur-sm border-primary/20 bg-gradient-to-r from-primary/5 to-violet-500/5">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "🎙️ Ouvindo..." : "Fale com o Agente..."}
                className={cn(
                  "min-h-[56px] max-h-[120px] resize-none bg-card/50 text-base pr-12 border-primary/30 focus:border-primary/50",
                  isListening && "animate-pulse"
                )}
                disabled={isLoading}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleListening}
                disabled={isLoading}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9",
                  isListening 
                    ? "text-red-500 bg-red-500/10 animate-pulse"
                    : "text-muted-foreground hover:text-primary"
                )}
              >
                <Mic className="h-5 w-5" />
              </Button>
            </div>
            <Button 
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              size="lg"
              className="shrink-0 border-0 shadow-lg px-6 bg-gradient-to-r from-primary to-violet-500 hover:opacity-90"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            Enter para enviar • Shift+Enter para nova linha • 🎤 Clique no microfone para falar
          </p>
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
