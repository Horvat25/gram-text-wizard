import { useState, useRef, useEffect, useMemo } from 'react';
import type { AgentPlatform } from '@/components/tabs/AgentTab';

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
  TrendingUp,
  Calendar,
  Target,
  CheckCircle2,
  XCircle,
  Trash2,
  BarChart3,
  Settings,
  History,
  Mic,
  MicOff,
  Instagram,
  Video,
  Image as ImageIcon,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';
import agentHeroBg from '@/assets/agent-hero-bg.jpg';
import AgentConfigPanel from './AgentConfigPanel';
import AgentExecutionHistory from './AgentExecutionHistory';
import { cn } from '@/lib/utils';

// TikTok Icon Component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
  >
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
  </svg>
);

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
  platform: AgentPlatform;
}

// Platform-specific quick actions
const TIKTOK_ACTIONS = [
  { icon: Video, label: 'Criar Reels', prompt: 'Crie um vídeo viral sobre IA para TikTok', color: 'from-[#25F4EE] to-[#FE2C55]' },
  { icon: TrendingUp, label: 'Tendências', prompt: 'Quais são as tendências do TikTok hoje?', color: 'from-[#FE2C55] to-[#FF0050]' },
  { icon: Target, label: 'Rodar Agente', prompt: 'Execute o agente focado em TikTok', color: 'from-[#25F4EE] to-cyan-500' },
  { icon: Zap, label: 'Viral Tips', prompt: 'Me dê dicas para viralizar no TikTok', color: 'from-purple-500 to-[#FE2C55]' },
];

const INSTAGRAM_ACTIONS = [
  { icon: Sparkles, label: 'Criar 5 posts', prompt: 'Crie 5 posts criativos para Instagram e salve como rascunhos', color: 'from-pink-500 to-rose-500' },
  { icon: ImageIcon, label: 'Carrossel', prompt: 'Crie um carrossel educativo para Instagram', color: 'from-violet-500 to-purple-500' },
  { icon: BarChart3, label: 'Ver Analytics', prompt: 'Analise minha performance dos últimos 30 dias no Instagram', color: 'from-cyan-500 to-blue-500' },
  { icon: Calendar, label: 'Plano 7 dias', prompt: 'Crie um plano de conteúdo para os próximos 7 dias no Instagram', color: 'from-emerald-500 to-green-500' },
];

const TIKTOK_WELCOME = `# 🎵 Olá! Sou seu Agente TikTok

Sou especializado em criar **conteúdo viral** para o TikTok.

## 🚀 O que posso fazer:
• **Criar vídeos** → Com trends e música
• **Analisar tendências** → O que está bombando
• **Gerar roteiros** → Scripts virais
• **Enviar para Inbox** → Direto pros seus rascunhos

## 💡 Dica:
_"Crie um vídeo sobre IA com uma trend atual"_

**O que você quer criar hoje?**`;

const INSTAGRAM_WELCOME = `# 📸 Olá! Sou seu Agente Instagram

Sou uma **IA autônoma** focada no seu crescimento no Instagram.

## 🛠️ O que posso fazer:
• **Criar posts** → Imagens, carrosséis, reels
• **Agendar publicações** → Horários otimizados
• **Analisar métricas** → Insights de performance
• **Auto-publicar** → Postar automaticamente

## 💡 Exemplos:
_"Crie 5 posts para a próxima semana"_
_"Mostre meus analytics dos últimos 30 dias"_

**O que você gostaria que eu faça?**`;

export default function AgentHeroChat({ onNavigate, platform }: AgentHeroChatProps) {
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

  // Get platform-specific content
  const quickActions = platform === 'tiktok' ? TIKTOK_ACTIONS : INSTAGRAM_ACTIONS;
  const welcomeMessage = platform === 'tiktok' ? TIKTOK_WELCOME : INSTAGRAM_WELCOME;
  const platformName = platform === 'tiktok' ? 'TikTok' : 'Instagram';
  const platformBadge = platform === 'tiktok' ? 'Drafts/Inbox' : 'Auto-post';

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
      .map((userMsg, idx) => {
        // Find the next assistant message
        const userMsgIndex = messages.indexOf(userMsg);
        const assistantMsg = messages.slice(userMsgIndex + 1).find(m => m.role === 'assistant');
        
        return {
          id: userMsg.id,
          timestamp: userMsg.timestamp,
          userRequest: userMsg.content,
          thinking: undefined, // Could be populated from agent response in future
          actions: assistantMsg?.actions || [],
          response: assistantMsg?.content || ''
        };
      })
      .filter(e => e.actions.length > 0 || e.response) // Only show executions with activity
      .reverse(); // Most recent first
  }, [messages]);

  // Load chat history and config on mount or platform change
  useEffect(() => {
    if (user) {
      loadChatHistory();
      loadAgentConfig();
    }
  }, [user, platform]);

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

  // Scroll to bottom helper
  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);
  };

  // Scroll to bottom on new messages and after loading history
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
        // Show welcome message for new users
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: welcomeMessage,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: welcomeMessage,
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
        content: welcomeMessage,
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
        .slice(-20) // Keep last 20 messages for context
        .map(m => ({ role: m.role, content: m.content }));
      
      chatMessages.push({ role: 'user', content: content.trim() });

      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: { 
          messages: chatMessages,
          userId: user.id,
          platform // Pass platform to backend
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
      
      // Headers
      if (formatted.startsWith('# ')) {
        return <h1 key={i} className="text-xl font-bold mb-2">{formatted.slice(2)}</h1>;
      }
      if (formatted.startsWith('## ')) {
        return <h2 key={i} className="text-lg font-semibold mt-3 mb-1">{formatted.slice(3)}</h2>;
      }
      
      // Bold and italic
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
      
      // Lists
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
      {/* Background with platform theme */}
      <div 
        className={cn(
          "absolute inset-0 opacity-10 bg-cover bg-center pointer-events-none",
          platform === 'tiktok' && "opacity-5"
        )}
        style={{ backgroundImage: `url(${agentHeroBg})` }}
      />
      <div className={cn(
        "absolute inset-0 pointer-events-none",
        platform === 'tiktok' 
          ? "bg-gradient-to-b from-black/50 via-background/95 to-background"
          : "bg-gradient-to-b from-background/80 via-background/95 to-background"
      )} />
      
      {/* Compact Header with Platform Theme */}
      <div className={cn(
        "relative z-10 flex items-center justify-between px-4 py-2 border-b backdrop-blur-sm",
        platform === 'tiktok'
          ? "border-[#25F4EE]/30 bg-black/30"
          : "border-pink-500/30 bg-pink-500/5"
      )}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className={cn(
              "h-9 w-9 border shadow-md",
              platform === 'tiktok'
                ? "border-[#25F4EE]/50 shadow-[#25F4EE]/20"
                : "border-pink-500/50 shadow-pink-500/20"
            )}>
              <AvatarImage src={agentConfig.agent_avatar_url || undefined} />
              <AvatarFallback className={cn(
                "text-white",
                platform === 'tiktok' ? "tiktok-gradient" : "instagram-gradient"
              )}>
                {platform === 'tiktok' ? (
                  <TikTokIcon className="h-4 w-4" />
                ) : (
                  <Instagram className="h-4 w-4" />
                )}
              </AvatarFallback>
            </Avatar>
            <span className={cn(
              "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background",
              platform === 'tiktok' ? "bg-[#25F4EE]" : "bg-green-500"
            )} />
          </div>
          <div>
            <h1 className={cn(
              "text-base font-semibold",
              platform === 'tiktok' 
                ? "bg-gradient-to-r from-[#25F4EE] to-[#FE2C55] bg-clip-text text-transparent"
                : "bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] bg-clip-text text-transparent"
            )}>
              Agente {platformName}
            </h1>
            <Badge variant="outline" className={cn(
              "text-[10px] px-1.5 py-0",
              platform === 'tiktok'
                ? "border-[#25F4EE]/30 text-[#25F4EE]"
                : "border-pink-500/30 text-pink-500"
            )}>
              {platformBadge}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {/* Execution History Button */}
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 relative"
            onClick={() => setShowExecutionHistory(true)}
          >
            <History className="h-4 w-4" />
            {executionHistory.length > 0 && (
              <span className={cn(
                "absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] text-white rounded-full flex items-center justify-center",
                platform === 'tiktok' ? "bg-[#FE2C55]" : "bg-pink-500"
              )}>
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
                    ? platform === 'tiktok'
                      ? "tiktok-gradient shadow-[#25F4EE]/20"
                      : "instagram-gradient shadow-pink-500/20"
                    : "bg-secondary"
                )}>
                  <AvatarFallback className="bg-transparent">
                    {message.role === 'assistant' ? (
                      platform === 'tiktok' ? (
                        <TikTokIcon className="h-5 w-5 text-white" />
                      ) : (
                        <Instagram className="h-5 w-5 text-white" />
                      )
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </AvatarFallback>
                </Avatar>
                
                <div className={`max-w-[85%] space-y-2 ${message.role === 'user' ? 'ml-auto' : ''}`}>
                  <div className={cn(
                    "rounded-2xl px-5 py-4",
                    message.role === 'user' 
                      ? platform === 'tiktok'
                        ? "tiktok-gradient text-white"
                        : "instagram-gradient text-white"
                      : "bg-card/80 backdrop-blur-sm border border-border/50 shadow-sm"
                  )}>
                    <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                      {renderMarkdown(message.content)}
                    </div>
                    <span className="text-[10px] opacity-50 mt-2 block">
                      {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  {/* Executed Actions */}
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
              <Avatar className={cn(
                "h-10 w-10 shadow-lg",
                platform === 'tiktok'
                  ? "tiktok-gradient shadow-[#25F4EE]/20"
                  : "instagram-gradient shadow-pink-500/20"
              )}>
                <AvatarFallback className="bg-transparent">
                  {platform === 'tiktok' ? (
                    <TikTokIcon className="h-5 w-5 text-white" />
                  ) : (
                    <Instagram className="h-5 w-5 text-white" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className={cn(
                      "w-2 h-2 rounded-full animate-bounce",
                      platform === 'tiktok' ? "bg-[#25F4EE]" : "bg-pink-500"
                    )} style={{ animationDelay: '0ms' }} />
                    <span className={cn(
                      "w-2 h-2 rounded-full animate-bounce",
                      platform === 'tiktok' ? "bg-[#FE2C55]" : "bg-purple-500"
                    )} style={{ animationDelay: '150ms' }} />
                    <span className={cn(
                      "w-2 h-2 rounded-full animate-bounce",
                      platform === 'tiktok' ? "bg-[#25F4EE]" : "bg-orange-500"
                    )} style={{ animationDelay: '300ms' }} />
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
              {quickActions.map((action, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className={cn(
                    "h-auto py-3 px-4 flex flex-col items-start gap-1.5 text-left transition-all group",
                    platform === 'tiktok'
                      ? "hover:border-[#25F4EE]/50"
                      : "hover:border-pink-500/50"
                  )}
                  onClick={() => sendMessage(action.prompt)}
                  disabled={isLoading}
                >
                  <div className={`p-1.5 rounded-lg bg-gradient-to-br ${action.color} text-white`}>
                    <action.icon className="h-3.5 w-3.5" />
                  </div>
                  <span className={cn(
                    "text-xs font-medium transition-colors",
                    platform === 'tiktok'
                      ? "group-hover:text-[#25F4EE]"
                      : "group-hover:text-pink-500"
                  )}>
                    {action.label}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className={cn(
        "relative z-10 p-6 border-t backdrop-blur-sm",
        platform === 'tiktok'
          ? "border-[#25F4EE]/20 bg-black/20"
          : "border-pink-500/20 bg-pink-500/5"
      )}>
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "🎙️ Ouvindo..." : `Fale com o Agente ${platformName}...`}
                className={cn(
                  "min-h-[56px] max-h-[120px] resize-none bg-card/50 text-base pr-12",
                  isListening && "animate-pulse",
                  platform === 'tiktok'
                    ? "border-[#25F4EE]/30 focus:border-[#25F4EE]/50"
                    : "border-pink-500/30 focus:border-pink-500/50"
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
              className={cn(
                "shrink-0 border-0 shadow-lg px-6",
                platform === 'tiktok'
                  ? "tiktok-gradient tiktok-glow"
                  : "instagram-gradient instagram-glow"
              )}
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
