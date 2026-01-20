import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, 
  Play, 
  RefreshCw, 
  Loader2,
  Calendar,
  Settings,
  FileText,
  History
} from 'lucide-react';
import { useAgentContext } from '@/hooks/useAgentContext';
import { motion } from 'framer-motion';

// Import agent components
import AgentStatusCard from '@/components/agent/AgentStatusCard';
import AgentStats from '@/components/agent/AgentStats';
import AgentRoutineConfig from '@/components/agent/AgentRoutineConfig';
import AgentPersonalityConfig from '@/components/agent/AgentPersonalityConfig';
import AgentReportsTab from '@/components/agent/AgentReportsTab';
import AgentDecisionHistory from '@/components/agent/AgentDecisionHistory';

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

  const [activeTab, setActiveTab] = useState('routine');

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
              Configure a rotina automática e personalidade do agente
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
            <span className="hidden sm:inline">Feedback Loop</span>
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
            <span>Executar</span>
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

      {/* Tabs Navigation - 4 tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid bg-muted/50">
          <TabsTrigger value="routine" className="gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Rotina</span>
          </TabsTrigger>
          <TabsTrigger value="personality" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Personalidade</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Relatórios</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Decisões</span>
          </TabsTrigger>
        </TabsList>

        {/* ROUTINE TAB - Automation settings */}
        <TabsContent value="routine" className="mt-4">
          <div className="max-w-2xl mx-auto">
            <AgentRoutineConfig 
              context={context}
              onUpdate={updateContext}
              onRunAgent={runAgent}
              isRunning={isRunning}
            />
          </div>
        </TabsContent>

        {/* PERSONALITY TAB - Agent identity */}
        <TabsContent value="personality" className="mt-4">
          <div className="max-w-2xl mx-auto">
            <AgentPersonalityConfig 
              context={context}
              onUpdate={updateContext}
            />
          </div>
        </TabsContent>

        {/* REPORTS TAB - Execution reports from CRON */}
        <TabsContent value="reports" className="mt-4">
          <AgentReportsTab />
        </TabsContent>

        {/* HISTORY TAB - Decision history */}
        <TabsContent value="history" className="mt-4">
          <AgentDecisionHistory decisions={decisions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
