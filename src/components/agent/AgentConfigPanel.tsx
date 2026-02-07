import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { 
  Settings, 
  Calendar,
  Bot,
  Loader2,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';

// Import the modular components
import AgentRoutineConfig from './AgentRoutineConfig';
import AgentPersonalityConfig from './AgentPersonalityConfig';
import { AgentContext } from '@/hooks/useAgentContext';

interface AgentConfigPanelProps {
  trigger?: React.ReactNode;
  onConfigChange?: (config: any) => void;
  onClearChat?: () => void;
}

export default function AgentConfigPanel({ trigger, onConfigChange, onClearChat }: AgentConfigPanelProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [context, setContext] = useState<AgentContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (user && currentWorkspace && isOpen) {
      loadContext();
    }
  }, [user, currentWorkspace, isOpen]);

  const loadContext = async () => {
    if (!user || !currentWorkspace) return;
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('agent_context')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setContext(data as AgentContext);
      }
    } catch (error) {
      console.error('Error loading context:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (updates: Partial<AgentContext>) => {
    if (!user || !currentWorkspace) return;

    try {
      const { data: existing } = await supabase
        .from('agent_context')
        .select('id')
        .eq('workspace_id', currentWorkspace.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('agent_context')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('workspace_id', currentWorkspace.id);
      } else {
        await supabase
          .from('agent_context')
          .insert({ user_id: user.id, workspace_id: currentWorkspace.id, ...updates });
      }

      // Update local state
      setContext(prev => prev ? { ...prev, ...updates } : null);
      
      // Notify parent
      if (onConfigChange && context) {
        onConfigChange({ ...context, ...updates });
      }
    } catch (error) {
      console.error('Error updating context:', error);
      toast.error('Erro ao salvar configurações');
    }
  };

  const handleRunAgent = async () => {
    if (!user || !currentWorkspace) {
      toast.error('Selecione um workspace primeiro');
      return;
    }
    setIsRunning(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-core', {
        body: { 
          userId: user.id, 
          workspaceId: currentWorkspace.id,
          trigger: 'manual' 
        }
      });

      if (error) throw error;

      toast.success(`Agente executado! Decisão: ${data.decision}`);
    } catch (error) {
      console.error('Error running agent:', error);
      toast.error('Erro ao executar agente');
    } finally {
      setIsRunning(false);
    }
  };

  const handleClearChat = async () => {
    if (!user || !currentWorkspace) return;

    try {
      await supabase
        .from('agent_chat_messages')
        .delete()
        .eq('workspace_id', currentWorkspace.id);
      
      toast.success('Histórico do chat limpo!');
      onClearChat?.();
    } catch (error) {
      console.error('Error clearing chat:', error);
      toast.error('Erro ao limpar histórico');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Settings className="h-5 w-5" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="p-6 pb-0">
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Configurações do Agente
          </SheetTitle>
          <SheetDescription>
            Configure a rotina automática e personalidade
          </SheetDescription>
        </SheetHeader>
        
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6">
            <Tabs defaultValue="routine" className="pb-6">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="routine" className="gap-1 text-xs">
                  <Calendar className="h-3 w-3" />
                  Rotina
                </TabsTrigger>
                <TabsTrigger value="personality" className="gap-1 text-xs">
                  <Bot className="h-3 w-3" />
                  Persona
                </TabsTrigger>
              </TabsList>

              <TabsContent value="routine" className="mt-0 space-y-4">
                <AgentRoutineConfig 
                  context={context}
                  onUpdate={handleUpdate}
                  onRunAgent={handleRunAgent}
                  isRunning={isRunning}
                />
              </TabsContent>

              <TabsContent value="personality" className="mt-0 space-y-4">
                <AgentPersonalityConfig 
                  context={context}
                  onUpdate={handleUpdate}
                />
              </TabsContent>
            </Tabs>

            {/* Clear Chat Button */}
            <div className="border-t pt-4 pb-6">
              <Button 
                variant="outline" 
                className="w-full gap-2 text-muted-foreground hover:text-destructive hover:border-destructive"
                onClick={handleClearChat}
              >
                <Trash2 className="h-4 w-4" />
                Limpar Histórico do Chat
              </Button>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
