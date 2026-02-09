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
  BarChart3,
  Image as ImageIcon,
  Layers,
  TrendingUp,
  Zap,
  Clock,
  Play
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

interface ContentItem {
  type: 'welcome' | 'stats' | 'chart' | 'posts' | 'message' | 'actions';
  data?: any;
  content?: string;
  timestamp?: Date;
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
  const [displayContent, setDisplayContent] = useState<ContentItem[]>([{ type: 'welcome' }]);
  const contentRef = useRef<HTMLDivElement>(null);
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
        
        // Show last messages as content
        const lastAssistant = data.filter((m: any) => m.role === 'assistant').slice(-1)[0];
        if (lastAssistant) {
          const actions = Array.isArray(lastAssistant.actions) ? (lastAssistant.actions as unknown as ExecutedAction[]) : null;
          setDisplayContent([
            { type: 'message', content: lastAssistant.content, timestamp: new Date(lastAssistant.created_at) },
            ...(actions && actions.length > 0 ? [{ type: 'actions' as const, data: actions }] : [])
          ]);
        }
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const saveMessage = async (message: Message) => {
    if (!user || !currentWorkspace || message.id === 'welcome') return;
    
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
      setDisplayContent([{ type: 'welcome' }]);
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

    // Show loading state in content area
    setDisplayContent([{ type: 'message', content: `Processando: "${content.trim()}"...` }]);

    try {
      const chatMessages = messages
        .filter(m => m.id !== 'welcome')
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

      // Update display content with response
      const newContent: ContentItem[] = [
        { type: 'message', content: assistantContent, timestamp: new Date() }
      ];
      
      if (executedActions.length > 0) {
        newContent.push({ type: 'actions', data: executedActions });
      }
      
      setDisplayContent(newContent);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      setDisplayContent([{ type: 'message', content: `❌ ${errorMsg}` }]);
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
        return <h1 key={i} className="text-2xl font-bold mb-3 neural-gradient-text">{formatted.slice(2)}</h1>;
      }
      if (formatted.startsWith('## ')) {
        return <h2 key={i} className="text-xl font-semibold mt-4 mb-2">{formatted.slice(3)}</h2>;
      }
      if (formatted.startsWith('### ')) {
        return <h3 key={i} className="text-lg font-medium mt-3 mb-1">{formatted.slice(4)}</h3>;
      }
      
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>');
      formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
      
      if (formatted.startsWith('• ') || formatted.startsWith('- ')) {
        return (
          <span key={i} className="flex gap-3 ml-2 py-0.5">
            <span className="text-primary">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatted.slice(2) }} />
          </span>
        );
      }
      
      if (formatted.trim() === '') {
        return <div key={i} className="h-2" />;
      }
      
      return (
        <span key={i} className="block leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />
      );
    });
  };

  const renderContent = () => {
    if (isLoadingHistory) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl neural-gradient animate-pulse flex items-center justify-center mx-auto">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-background" />
            </div>
            <p className="text-muted-foreground">Conectando com o agente...</p>
          </div>
        </div>
      );
    }

    return (
      <ScrollArea className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <AnimatePresence mode="wait">
            {displayContent.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {item.type === 'welcome' && (
                  <div className="space-y-8">
                    {/* Hero Section */}
                    <div className="text-center space-y-4">
                      <div className="relative inline-block">
                        <Avatar className="h-20 w-20 border-2 border-primary/30 shadow-xl shadow-primary/20">
                          <AvatarImage src={agentConfig.agent_avatar_url || undefined} />
                          <AvatarFallback className="neural-gradient text-white text-2xl">
                            <Bot className="h-10 w-10" />
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-4 border-background bg-green-500" />
                      </div>
                      <div>
                        <h1 className="text-3xl font-bold neural-gradient-text">{agentConfig.agent_name}</h1>
                        <p className="text-muted-foreground mt-1">Seu assistente de conteúdo autônomo</p>
                      </div>
                      
                      {/* Status Pills */}
                      <div className="flex items-center justify-center gap-3 flex-wrap">
                        <Badge variant="outline" className="gap-1.5 px-3 py-1">
                          <span className={cn("w-2 h-2 rounded-full", agentConfig.auto_post_enabled ? "bg-green-500" : "bg-muted-foreground")} />
                          {agentConfig.auto_post_enabled ? 'Piloto Automático' : 'Manual'}
                        </Badge>
                        <Badge variant="outline" className="gap-1.5 px-3 py-1">
                          <Clock className="h-3 w-3" />
                          {agentConfig.daily_post_limit} posts/dia
                        </Badge>
                        <Badge variant="outline" className="gap-1.5 px-3 py-1">
                          <Instagram className="h-3 w-3" />
                          Todas plataformas
                        </Badge>
                      </div>
                    </div>

                    {/* Quick Actions Grid */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        Ações Rápidas
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {QUICK_ACTIONS.map((action, i) => (
                          <motion.button
                            key={i}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => sendMessage(action.prompt)}
                            disabled={isLoading}
                            className={cn(
                              "relative overflow-hidden rounded-xl p-4 text-left transition-all",
                              "border border-border/50 bg-card/50 backdrop-blur-sm",
                              "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10",
                              "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                          >
                            <div className={cn("p-2 rounded-lg w-fit bg-gradient-to-br text-white", action.color)}>
                              <action.icon className="h-4 w-4" />
                            </div>
                            <span className="block mt-2 font-medium text-sm">{action.label}</span>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Tips */}
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                      <p className="text-sm text-muted-foreground">
                        💡 <strong className="text-foreground">Dica:</strong> Você pode me pedir qualquer coisa! 
                        Crie posts, busque imagens, gere vídeos narrados, analise métricas ou planeje sua semana.
                      </p>
                    </div>
                  </div>
                )}

                {item.type === 'message' && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {renderMarkdown(item.content || '')}
                  </div>
                )}

                {item.type === 'actions' && item.data && (
                  <div className="space-y-2 mt-4">
                    <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      Ações Executadas
                    </h4>
                    <div className="grid gap-2">
                      {item.data.map((action: ExecutedAction, idx: number) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border",
                            action.success 
                              ? "bg-green-500/10 border-green-500/30" 
                              : "bg-red-500/10 border-red-500/30"
                          )}
                        >
                          {action.success ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                          )}
                          <span className={cn(
                            "flex-1 text-sm font-medium",
                            action.success ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"
                          )}>
                            {action.message}
                          </span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {action.tool.replace(/_/g, ' ')}
                          </Badge>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-primary/5 border border-primary/20"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-xl neural-gradient flex items-center justify-center">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <Loader2 className="absolute -bottom-1 -right-1 h-5 w-5 text-primary animate-spin" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Processando sua solicitação...</p>
                <div className="flex gap-1 mt-1">
                  <span className="w-2 h-2 rounded-full animate-bounce bg-primary" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full animate-bounce bg-primary/70" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full animate-bounce bg-primary/40" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Tech Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div 
          className="absolute inset-0 opacity-5 bg-cover bg-center"
          style={{ backgroundImage: `url(${agentHeroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
        {/* Grid pattern */}
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
            <div className="w-8 h-8 rounded-lg neural-gradient flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background bg-green-500" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">{agentConfig.agent_name}</h1>
            <p className="text-[10px] text-muted-foreground">Online • Pronto para ajudar</p>
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

      {/* Main Content Area */}
      {renderContent()}

      {/* Compact Input Bar */}
      <div className="relative z-10 p-4 border-t border-border/50 backdrop-blur-xl bg-background/90">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "🎙️ Ouvindo..." : "O que você gostaria que eu faça?"}
                className={cn(
                  "h-12 pr-20 bg-muted/50 border-border/50 text-base rounded-xl",
                  "placeholder:text-muted-foreground/70",
                  "focus:border-primary/50 focus:ring-primary/20",
                  isListening && "animate-pulse border-red-500/50"
                )}
                disabled={isLoading}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleListening}
                  disabled={isLoading}
                  className={cn(
                    "h-8 w-8",
                    isListening 
                      ? "text-red-500 bg-red-500/10 animate-pulse"
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
