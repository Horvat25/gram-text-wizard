import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MessageCircle, FileText, Instagram } from 'lucide-react';
import AgentHeroChat from '@/components/agent/AgentHeroChat';
import AgentReportsTab from '@/components/agent/AgentReportsTab';
import { cn } from '@/lib/utils';

// TikTok Icon Component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
  >
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
  </svg>
);

export type AgentPlatform = 'tiktok' | 'instagram';

export default function AgentTab() {
  const [activeTab, setActiveTab] = useState('chat');
  const [platform, setPlatform] = useState<AgentPlatform>('tiktok');

  return (
    <div className="h-full flex flex-col">
      {/* Platform Selector */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Button
          variant={platform === 'tiktok' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPlatform('tiktok')}
          className={cn(
            "flex-1 gap-2 transition-all",
            platform === 'tiktok' && "tiktok-gradient text-white border-0 tiktok-glow"
          )}
        >
          <TikTokIcon className="h-4 w-4" />
          TikTok
        </Button>
        <Button
          variant={platform === 'instagram' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPlatform('instagram')}
          className={cn(
            "flex-1 gap-2 transition-all",
            platform === 'instagram' && "instagram-gradient text-white border-0 instagram-glow"
          )}
        >
          <Instagram className="h-4 w-4" />
          Instagram
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <TabsList className={cn(
          "grid w-full grid-cols-2 shrink-0 h-9",
          platform === 'tiktok' ? "bg-black/20" : "bg-pink-500/10"
        )}>
          <TabsTrigger value="chat" className="gap-1.5 text-sm">
            <MessageCircle className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="respostas" className="gap-1.5 text-sm">
            <FileText className="h-4 w-4" />
            Respostas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 mt-2 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
          <div className="h-full">
            <AgentHeroChat platform={platform} />
          </div>
        </TabsContent>

        <TabsContent value="respostas" className="flex-1 mt-2 overflow-auto">
          <AgentReportsTab platform={platform} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
