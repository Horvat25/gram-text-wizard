import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

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

const QUICK_ACTIONS = [
  { icon: TrendingUp, label: 'Analisar performance', prompt: 'Analise minha performance recente e me dê insights' },
  { icon: Sparkles, label: 'Criar 5 posts', prompt: 'Crie 5 posts para a próxima semana e salve como rascunhos' },
  { icon: Calendar, label: 'Planejar 7 dias', prompt: 'Crie um plano de conteúdo para os próximos 7 dias e salve todos os posts' },
  { icon: Target, label: 'Rodar agente', prompt: 'Execute o agente autônomo agora' },
];

export default function AgentChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Olá! 👋 Sou seu agente autônomo de mídias sociais com poder de **EXECUTAR ações reais**.

🛠️ **O que eu posso FAZER por você:**
• **Criar posts** - Gerar e salvar posts no banco de dados
• **Gerar imagens** - Criar visuais com IA para seus posts
• **Agendar publicações** - Definir datas para publicar
• **Analisar métricas** - Buscar dados de performance
• **Rodar o agente** - Executar ciclo autônomo completo

💡 Basta me pedir e eu executo! Por exemplo:
_"Crie 5 posts para a próxima semana"_
_"Analise minha performance dos últimos 30 dias"_

O que gostaria que eu faça?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on mount and when messages change
  const scrollToBottom = () => {
    if (scrollRef.current) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    }
  };

  // Scroll on initial mount
  useEffect(() => {
    scrollToBottom();
  }, []);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build messages array for the API (exclude welcome message)
      const chatMessages = messages
        .filter(m => m.id !== '1')
        .map(m => ({ role: m.role, content: m.content }));
      
      chatMessages.push({ role: 'user', content: content.trim() });

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: { 
          messages: chatMessages,
          userId: user.id
        }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      const assistantContent = data.content || 'Desculpe, não consegui processar sua mensagem.';
      const executedActions = data.actions || [];

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        actions: executedActions
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ ${errorMessage}`,
        timestamp: new Date()
      }]);
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

  return (
    <Card className="h-[600px] flex flex-col overflow-hidden border-primary/20">
      <CardHeader className="pb-3 border-b border-border/50 bg-gradient-to-r from-primary/5 to-accent/5">
        <CardTitle className="flex items-center gap-3">
          <div className="relative">
            <div className="p-2 rounded-xl neural-gradient">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div>
            <span className="neural-gradient-text font-bold">Chat com o Agente</span>
            <p className="text-xs text-muted-foreground font-normal">Converse e planeje sua estratégia</p>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            <AnimatePresence>
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <Avatar className={`h-8 w-8 shrink-0 ${message.role === 'assistant' ? 'neural-gradient' : 'bg-secondary'}`}>
                    <AvatarFallback className="bg-transparent">
                      {message.role === 'assistant' ? (
                        <Bot className="h-4 w-4 text-white" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className={`max-w-[85%] space-y-2 ${message.role === 'user' ? 'ml-auto' : ''}`}>
                    <div className={`rounded-2xl px-4 py-3 ${
                      message.role === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted'
                    }`}>
                      <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                        {message.content.split('\n').map((line, i) => {
                          let formatted = line;
                          formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                          formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
                          if (formatted.startsWith('• ') || formatted.startsWith('- ')) {
                            formatted = `<span class="flex gap-2"><span>•</span><span>${formatted.slice(2)}</span></span>`;
                          }
                          return (
                            <span 
                              key={i} 
                              className="block"
                              dangerouslySetInnerHTML={{ __html: formatted }}
                            />
                          );
                        })}
                      </div>
                      <span className="text-[10px] opacity-60 mt-1 block">
                        {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    {/* Show executed actions */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="space-y-1.5 pl-2">
                        {message.actions.map((action, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`flex items-center gap-2 text-xs p-2 rounded-lg border ${
                              action.success 
                                ? 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400' 
                                : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400'
                            }`}
                          >
                            {action.success ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="flex-1">{action.message}</span>
                            <Badge variant="outline" className="text-[10px] h-5">
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
                className="flex gap-3"
              >
                <Avatar className="h-8 w-8 neural-gradient">
                  <AvatarFallback className="bg-transparent">
                    <Bot className="h-4 w-4 text-white" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Pensando...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </ScrollArea>

        {/* Quick Actions */}
        {messages.length <= 2 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 hover:bg-primary/10 hover:border-primary/30"
                  onClick={() => sendMessage(action.prompt)}
                  disabled={isLoading}
                >
                  <action.icon className="h-3 w-3" />
                  {action.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border/50 bg-muted/30">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem..."
              className="min-h-[44px] max-h-[120px] resize-none bg-background"
              disabled={isLoading}
            />
            <Button 
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="shrink-0 neural-gradient border-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Pressione Enter para enviar • Shift+Enter para nova linha
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
