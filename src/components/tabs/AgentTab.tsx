import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, 
  MessageCircle,
  FileText
} from 'lucide-react';
import { motion } from 'framer-motion';

// Import agent components
import AgentHeroChat from '@/components/agent/AgentHeroChat';
import AgentReportsTab from '@/components/agent/AgentReportsTab';

export default function AgentTab() {
  const [activeTab, setActiveTab] = useState('chat');

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
              Converse com o agente e veja os relatórios automáticos
            </p>
          </div>
        </div>
      </motion.div>

      {/* Two Main Tabs: Chat and Responses */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid bg-muted/50">
          <TabsTrigger value="chat" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            <span>Chat</span>
          </TabsTrigger>
          <TabsTrigger value="respostas" className="gap-2">
            <FileText className="h-4 w-4" />
            <span>Respostas</span>
          </TabsTrigger>
        </TabsList>

        {/* CHAT TAB - User talks to agent */}
        <TabsContent value="chat" className="mt-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="h-[calc(100vh-280px)] min-h-[500px]"
          >
            <AgentHeroChat />
          </motion.div>
        </TabsContent>

        {/* RESPOSTAS TAB - Agent reports and automatic messages */}
        <TabsContent value="respostas" className="mt-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <AgentReportsTab />
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
