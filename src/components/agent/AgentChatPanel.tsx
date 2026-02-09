import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Bot, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AgentChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  agentName: string;
  agentAvatar?: string | null;
}

export default function AgentChatPanel({ 
  isOpen, 
  onClose, 
  messages,
  agentName,
  agentAvatar
}: AgentChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
      let formatted = line;
      
      if (formatted.startsWith('# ')) {
        return <h1 key={i} className="text-lg font-bold mb-2">{formatted.slice(2)}</h1>;
      }
      if (formatted.startsWith('## ')) {
        return <h2 key={i} className="text-base font-semibold mt-2 mb-1">{formatted.slice(3)}</h2>;
      }
      
      formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
      
      if (formatted.startsWith('• ') || formatted.startsWith('- ')) {
        return (
          <span key={i} className="flex gap-2 ml-2 py-0.5">
            <span className="text-primary">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatted.slice(2) }} />
          </span>
        );
      }
      
      if (formatted.trim() === '') return <div key={i} className="h-1" />;
      
      return <span key={i} className="block" dangerouslySetInnerHTML={{ __html: formatted }} />;
    });
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
                <p className="text-xs text-muted-foreground">Conversa</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Messages */}
          <ScrollArea ref={scrollRef} className="flex-1 p-4">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Comece uma conversa!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-3",
                      msg.role === 'user' ? "flex-row-reverse" : ""
                    )}
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      {msg.role === 'assistant' ? (
                        <>
                          <AvatarImage src={agentAvatar || undefined} />
                          <AvatarFallback className="neural-gradient text-primary-foreground text-xs">
                            <Bot className="h-3 w-3" />
                          </AvatarFallback>
                        </>
                      ) : (
                        <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.role === 'user' 
                        ? "bg-primary text-primary-foreground rounded-br-sm" 
                        : "bg-muted rounded-bl-sm"
                    )}>
                      {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
