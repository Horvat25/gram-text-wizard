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
  Zap,
  TrendingUp,
  Calendar,
  Target
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: {
    type: 'analyze' | 'suggest' | 'create' | 'schedule';
    data?: any;
  };
}

const QUICK_ACTIONS = [
  { icon: TrendingUp, label: 'Analisar performance', prompt: 'Analise minha performance recente e me dê insights' },
  { icon: Sparkles, label: 'Gerar ideias', prompt: 'Sugira 5 ideias de posts para a próxima semana' },
  { icon: Calendar, label: 'Planejar semana', prompt: 'Crie um plano de conteúdo para os próximos 7 dias' },
  { icon: Target, label: 'Melhorar engajamento', prompt: 'O que posso fazer para melhorar meu engajamento?' },
];

export default function AgentChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Olá! 👋 Sou seu agente autônomo de mídias sociais. 

Posso ajudar você com:
• **Análise de performance** - Entender o que está funcionando
• **Geração de ideias** - Criar conteúdo estratégico
• **Planejamento** - Organizar sua semana de posts
• **Otimização** - Melhorar seus resultados

O que gostaria de fazer hoje?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
      // Get agent context for additional info
      const { data: context } = await supabase
        .from('agent_context')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Get recent posts for context
      const { data: recentPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(10);

      // Get recent decisions
      const { data: recentDecisions } = await supabase
        .from('agent_decisions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      // Build context for AI
      const avgEngagement = recentPosts && recentPosts.length > 0
        ? recentPosts.reduce((acc, p) => {
            const total = (p.likes_count || 0) + (p.comments_count || 0) + (p.saves_count || 0);
            const reach = p.reach || 1;
            return acc + (total / reach * 100);
          }, 0) / recentPosts.length
        : 0;

      const systemPrompt = `Você é um agente estrategista de mídias sociais especializado. Responda de forma clara, prática e acionável.

CONTEXTO DO USUÁRIO:
- Posts recentes: ${recentPosts?.length || 0}
- Engajamento médio: ${avgEngagement.toFixed(2)}%
- Formatos que mais funcionam: ${context?.top_topics?.join(', ') || 'ainda aprendendo'}
- Melhores hashtags: ${context?.best_hashtags?.slice(0, 5).join(', ') || 'coletando dados'}
- Padrões de sucesso: ${context?.success_patterns?.slice(0, 3).join('; ') || 'ainda aprendendo'}
- Decisões recentes do agente: ${recentDecisions?.map(d => `${d.decision}: ${d.decision_reason}`).join('; ') || 'nenhuma'}

REGRAS:
- Seja específico com números e dados quando possível
- Sugira ações concretas, não genéricas
- Use emojis moderadamente para tornar a conversa agradável
- Formate respostas longas com markdown (listas, negrito)
- Se não souber algo específico, seja honesto`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.filter(m => m.role !== 'assistant' || m.id !== '1').map(m => ({
              role: m.role,
              content: m.content
            })),
            { role: 'user', content: content.trim() }
          ]
        })
      });

      if (!response.ok) {
        throw new Error('Erro na API');
      }

      const data = await response.json();
      const assistantContent = data.choices?.[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.',
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
                  
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === 'user' 
                      ? 'bg-primary text-primary-foreground ml-auto' 
                      : 'bg-muted'
                  }`}>
                    <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                      {message.content.split('\n').map((line, i) => {
                        // Simple markdown parsing
                        let formatted = line;
                        // Bold
                        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                        // Lists
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
