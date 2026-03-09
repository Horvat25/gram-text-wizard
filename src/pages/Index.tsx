import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  CalendarDays, 
  History, 
  Bot,
  ChevronLeft,
} from "lucide-react";
import PublicationQueueTab from "@/components/tabs/PublicationQueueTab";
import { PostHistoryTab } from "@/components/tabs/PostHistoryTab";

import AgentTab from "@/components/tabs/AgentTab";
import PlatformSelector, { Platform } from "@/components/PlatformSelector";
import TikTokContentCreation from "@/components/TikTokContentCreation";
import { usePosts } from "@/hooks/usePosts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VideoRenderingProvider } from "@/contexts/VideoRenderingContext";

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "queue");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("instagram");
  const [showDashboard, setShowDashboard] = useState(false);
  
  const {
    posts,
    isLoading,
    fetchPosts,
    createPost,
    updatePost,
    deletePost,
    publishPost,
    reschedulePost,
  } = usePosts();

  // Handle OAuth callback from Facebook
  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    
    if (error) {
      console.error("OAuth error:", error, errorDescription);
      localStorage.setItem('oauth_result', JSON.stringify({
        success: false,
        error: errorDescription || error
      }));
      setSearchParams({});
      if (window.opener) {
        window.close();
      }
      return;
    }
    
    if (code) {
      console.log("Processing OAuth code...");
      processOAuthCode(code);
    }
  }, []);

  const processOAuthCode = async (code: string) => {
    try {
      const redirectUri = `${window.location.origin}/`;
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('oauth-callback', {
        body: { code, redirectUri, userId: user?.id }
      });

      if (error) throw error;

      if (data.success) {
        localStorage.setItem('oauth_result', JSON.stringify({
          success: true,
          accounts: data.accounts
        }));
        toast.success(`${data.accounts?.length || 1} conta(s) do Instagram conectada(s)!`);
      } else {
        throw new Error(data.error || 'Falha ao processar autorização');
      }
    } catch (err: any) {
      console.error("OAuth callback error:", err);
      localStorage.setItem('oauth_result', JSON.stringify({
        success: false,
        error: err.message
      }));
      toast.error(err.message || 'Erro ao conectar Instagram');
    } finally {
      setSearchParams({});
      if (window.opener) {
        window.close();
      }
    }
  };

  // Sync tab with URL when in dashboard mode
  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
      if (tabFromUrl !== "agent") {
        setShowDashboard(true);
      }
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

  const handleNavigateFromAgent = (tab: string) => {
    setActiveTab(tab);
    setShowDashboard(true);
    setSearchParams({ tab });
  };

  const getPlatformBackground = () => {
    if (selectedPlatform === "instagram") {
      return "bg-gradient-to-br from-pink-500/5 via-purple-500/5 to-orange-500/5";
    }
    return "bg-gradient-to-br from-black/5 via-cyan-500/5 to-pink-500/5";
  };

  return (
    <VideoRenderingProvider>
    <div className={cn("min-h-screen bg-background transition-colors duration-500", getPlatformBackground())}>
      <AnimatePresence mode="wait">
        {!showDashboard ? (
          /* AGENT HERO VIEW - Main interface */
          <motion.div
            key="agent-hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -50 }}
            className="h-screen flex flex-col"
          >
            <div className="flex-1 overflow-hidden">
              <AgentTab onNavigate={handleNavigateFromAgent} />
            </div>
          </motion.div>
        ) : (
          /* DASHBOARD VIEW - Queue & History */
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
          >
            <Header />
            <main className="container mx-auto px-4 py-6 space-y-6">
              {/* Back to Agent Button */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDashboard(false);
                    setSearchParams({});
                  }}
                  className="gap-2 neural-gradient-text border-primary/30 hover:border-primary/50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <Bot className="h-4 w-4" />
                  <span className="hidden sm:inline">Voltar ao Agente</span>
                </Button>
                
                {/* Platform Selector */}
                <PlatformSelector 
                  selected={selectedPlatform} 
                  onSelect={setSelectedPlatform} 
                />
              </div>

              {/* Platform-specific content */}
              <AnimatePresence mode="wait">
                {selectedPlatform === "tiktok" ? (
                  <motion.div
                    key="tiktok"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <TikTokContentCreation />
                  </motion.div>
                ) : (
                  <motion.div
                    key="instagram"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                      <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
                        <TabsTrigger value="queue" className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4" />
                          <span className="hidden sm:inline">Fila</span>
                        </TabsTrigger>
                        <TabsTrigger value="history" className="flex items-center gap-2">
                          <History className="h-4 w-4" />
                          <span className="hidden sm:inline">Histórico</span>
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="queue" className="space-y-6">
                        <PublicationQueueTab
                          posts={posts}
                          onPublish={publishPost}
                          onReschedule={reschedulePost}
                          onDelete={deletePost}
                          onUpdate={updatePost}
                        />
                      </TabsContent>

                      <TabsContent value="history" className="space-y-6">
                        <PostHistoryTab />
                      </TabsContent>
                    </Tabs>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </VideoRenderingProvider>
  );
};

export default Index;
