import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageCircle, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import AgentHeroChat from '@/components/agent/AgentHeroChat';
import AgentReportsTab from '@/components/agent/AgentReportsTab';

export default function AgentTab() {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <div className="h-full flex flex-col">
      {/* Compact Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid bg-muted/50 shrink-0">
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
        <TabsContent value="chat" className="flex-1 mt-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="h-full"
          >
            <AgentHeroChat />
          </motion.div>
        </TabsContent>

        {/* RESPOSTAS TAB - Agent reports and automatic messages */}
        <TabsContent value="respostas" className="flex-1 mt-4 overflow-auto">
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
