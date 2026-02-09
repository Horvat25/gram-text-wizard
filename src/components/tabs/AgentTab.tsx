import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageCircle, FileText, ImageIcon } from 'lucide-react';
import AgentDashboard from '@/components/agent/AgentDashboard';
import AgentReportsTab from '@/components/agent/AgentReportsTab';
import AgentImageLibrary from '@/components/agent/AgentImageLibrary';

export default function AgentTab() {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-3 shrink-0 h-9 bg-gradient-to-r from-primary/10 via-amber-500/10 to-violet-500/10">
          <TabsTrigger value="chat" className="gap-1.5 text-sm">
            <MessageCircle className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="biblioteca" className="gap-1.5 text-sm">
            <ImageIcon className="h-4 w-4" />
            Biblioteca
          </TabsTrigger>
          <TabsTrigger value="respostas" className="gap-1.5 text-sm">
            <FileText className="h-4 w-4" />
            Respostas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 mt-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
          <div className="h-full">
            <AgentDashboard />
          </div>
        </TabsContent>

        <TabsContent value="biblioteca" className="flex-1 mt-2 overflow-hidden">
          <AgentImageLibrary />
        </TabsContent>

        <TabsContent value="respostas" className="flex-1 mt-2 overflow-auto">
          <AgentReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
