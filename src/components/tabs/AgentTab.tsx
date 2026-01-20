import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, 
  Play, 
  RefreshCw, 
  Loader2,
  MessageSquare,
  BarChart3,
  Settings,
  History,
  Sparkles,
  Calendar
} from 'lucide-react';
import { useAgentContext } from '@/hooks/useAgentContext';
import { motion } from 'framer-motion';

// Import agent components
import AgentStatusCard from '@/components/agent/AgentStatusCard';
import AgentStats from '@/components/agent/AgentStats';
import AgentLearnings from '@/components/agent/AgentLearnings';
import AgentDecisionHistory from '@/components/agent/AgentDecisionHistory';
import AgentConfigPanel from '@/components/agent/AgentConfigPanel';
import AgentChat from '@/components/agent/AgentChat';
import AgentRoutineScheduler from '@/components/agent/AgentRoutineScheduler';

export default function AgentTab() {
  const { 
    context, 
    decisions, 
    isLoading, 
    isRunning,
    stats,
    updateContext, 
    runAgent, 
    runFeedbackLoop 
  } = useAgentContext();

  const [activeTab, setActiveTab] = useState('overview');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando agente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl neural-gradient glow-sm">
            <Bot className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              <span className="neural-gradient-text">Agente Autônomo</span>
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              O cérebro que analisa, decide e aprende com cada post
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={runFeedbackLoop}
            disabled={isRunning}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Processar Feedback</span>
          </Button>
          <Button 
            onClick={runAgent}
            disabled={isRunning}
            className="gap-2 neural-gradient border-0"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span>Executar Agente</span>
          </Button>
        </div>
      </motion.div>

      {/* Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <AgentStatusCard 
          context={context}
          isRunning={isRunning}
          onToggleAutoPost={(enabled) => updateContext({ auto_post_enabled: enabled })}
        />
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <AgentStats stats={stats} />
      </motion.div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid bg-muted/50">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Visão Geral</span>
          </TabsTrigger>
          <TabsTrigger value="routine" className="gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Rotina</span>
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Chat</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Histórico</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Config</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <AgentLearnings context={context} />
            <AgentDecisionHistory decisions={decisions.slice(0, 5)} />
          </div>
        </TabsContent>

        <TabsContent value="routine" className="mt-4">
          <AgentRoutineScheduler 
            context={context}
            onUpdate={updateContext}
            onRunAgent={runAgent}
            isRunning={isRunning}
          />
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <div className="max-w-3xl mx-auto">
            <AgentChat />
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <AgentDecisionHistory decisions={decisions} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <div className="max-w-xl mx-auto">
            <AgentConfigPanel 
              onConfigChange={() => {}}
              onClearChat={() => {}}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Capabilities Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5 rounded-2xl p-6 border border-primary/10"
      >
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-2">O que o Agente pode fazer?</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Analisar métricas (72h)
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Buscar notícias atuais
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Gerar legendas e imagens
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Publicar automaticamente
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Decidir quando postar
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Aprender com resultados
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Validar hipóteses
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Adicionar watermark
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
