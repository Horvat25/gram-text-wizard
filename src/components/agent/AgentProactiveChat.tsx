import { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, TrendingUp, Megaphone, AlertCircle, FileText, X, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProactiveMessage {
  id: string;
  content: string;
  message_type: string;
  metadata: any;
  created_at: string;
}

interface AgentProactiveChatProps {
  isOpen: boolean;
  onClose: () => void;
  agentName: string;
  agentAvatar?: string | null;
}

const TYPE_ICONS: Record<string, typeof TrendingUp> = {
  report: TrendingUp,
  decision: FileText,
  strategy: Megaphone,
  alert: AlertCircle,
};

const TYPE_LABELS: Record<string, string> = {
  report: 'Relatório',
  decision: 'Decisão',
  strategy: 'Estratégia',
  alert: 'Alerta',
};

export default function AgentProactiveChat({ isOpen, onClose, agentName, agentAvatar }: AgentProactiveChatProps) {
  const { currentWorkspace } = useWorkspace();
  const [messages, setMessages] = useState<ProactiveMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && currentWorkspace) {
      loadMessages();
    }
  }, [isOpen, currentWorkspace]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (scrollRef.current) {
          const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
          if (viewport) viewport.scrollTop = viewport.scrollHeight;
        }
      }, 100);
    }
  }, [isOpen, messages]);

  const loadMessages = async () => {
    if (!currentWorkspace) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_proactive_messages')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;
      setMessages((data as ProactiveMessage[]) || []);
    } catch (err) {
      console.error('Error loading proactive messages:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      let formatted = line;
      if (formatted.startsWith('# ')) return <h1 key={i} className="text-lg font-bold mb-2">{formatted.slice(2)}</h1>;
      if (formatted.startsWith('## ')) return <h2 key={i} className="text-base font-semibold mt-2 mb-1">{formatted.slice(3)}</h2>;
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
      if (formatted.startsWith('• ') || formatted.startsWith('- ')) {
        return <span key={i} className="flex gap-2 ml-2 py-0.5"><span className="text-primary">•</span><span dangerouslySetInnerHTML={{ __html: formatted.slice(2) }} /></span>;
      }
      if (formatted.trim() === '') return <div key={i} className="h-1" />;
      return <span key={i} className="block" dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffH < 1) return 'Agora';
    if (diffH < 24) return `${diffH}h atrás`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'Ontem';
    return `${diffD} dias atrás`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: -300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed left-4 top-4 bottom-24 w-[380px] max-w-[calc(100vw-2rem)] z-30 flex flex-col bg-card/95 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 border border-primary/30">
                <AvatarImage src={agentAvatar || undefined} />
                <AvatarFallback className="neural-gradient text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold text-sm">{agentName}</h2>
                <p className="text-xs text-muted-foreground">Relatórios & Decisões</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={loadMessages} className="h-8 w-8">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea ref={scrollRef} className="flex-1 p-4">
            <div className="space-y-4">
              {isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  <p className="text-xs text-muted-foreground mt-2">Carregando...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum relatório ainda.</p>
                  <p className="text-xs mt-1">O agente vai reportar aqui automaticamente.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const Icon = TYPE_ICONS[msg.message_type] || FileText;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={agentAvatar || undefined} />
                        <AvatarFallback className="neural-gradient text-primary-foreground text-xs">
                          <Bot className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                            <Icon className="h-2.5 w-2.5" />
                            {TYPE_LABELS[msg.message_type] || msg.message_type}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                        </div>
                        <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm">
                          {renderMarkdown(msg.content)}
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
