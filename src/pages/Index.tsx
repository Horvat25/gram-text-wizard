import AgentTab from "@/components/tabs/AgentTab";
import { VideoRenderingProvider } from "@/contexts/VideoRenderingContext";

const Index = () => {
  return (
    <VideoRenderingProvider>
      <div className="h-screen bg-background">
        <AgentTab />
      </div>
    </VideoRenderingProvider>
  );
};

export default Index;
