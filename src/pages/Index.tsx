import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, CalendarDays, BarChart3, History, Lightbulb } from "lucide-react";
import ContentCreationTab from "@/components/tabs/ContentCreationTab";
import PublicationQueueTab from "@/components/tabs/PublicationQueueTab";
import AnalyticsTab from "@/components/tabs/AnalyticsTab";
import { PostHistoryTab } from "@/components/tabs/PostHistoryTab";
import { SuggestionsTab } from "@/components/tabs/SuggestionsTab";
import PlatformSelector, { Platform } from "@/components/PlatformSelector";
import TikTokContentCreation from "@/components/TikTokContentCreation";
import { usePosts } from "@/hooks/usePosts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "create");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>("instagram");
  
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
      // Clear URL params
      setSearchParams({});
      // Close popup if we're in one
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
      
      // Get current user
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
      // Clear URL params
      setSearchParams({});
      // Close popup if we're in one
      if (window.opener) {
        window.close();
      }
    }
  };

  // Sync tab with URL
  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

  // Platform-specific background styles
  const getPlatformBackground = () => {
    if (selectedPlatform === "instagram") {
      return "bg-gradient-to-br from-pink-500/5 via-purple-500/5 to-orange-500/5";
    }
    return "bg-gradient-to-br from-black/5 via-cyan-500/5 to-pink-500/5";
  };

  return (
    <div className={cn("min-h-screen bg-background transition-colors duration-500", getPlatformBackground())}>
      <Header />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Platform Selector */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <PlatformSelector 
            selected={selectedPlatform} 
            onSelect={setSelectedPlatform} 
          />
        </motion.div>

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
                <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
                  <TabsTrigger value="create" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">Criação</span>
                  </TabsTrigger>
                  <TabsTrigger value="suggestions" className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    <span className="hidden sm:inline">Sugestões</span>
                  </TabsTrigger>
                  <TabsTrigger value="queue" className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    <span className="hidden sm:inline">Fila</span>
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    <span className="hidden sm:inline">Histórico</span>
                  </TabsTrigger>
                  <TabsTrigger value="analytics" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden sm:inline">Analytics</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="create" className="space-y-6">
                  <ContentCreationTab onPostCreated={createPost} />
                </TabsContent>

                <TabsContent value="suggestions" className="space-y-6">
                  <SuggestionsTab />
                </TabsContent>

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

                <TabsContent value="analytics" className="space-y-6">
                  <AnalyticsTab posts={posts} onRefresh={fetchPosts} />
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default Index;