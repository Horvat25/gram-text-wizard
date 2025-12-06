import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, CalendarDays, BarChart3, History, Lightbulb } from "lucide-react";
import ContentCreationTab from "@/components/tabs/ContentCreationTab";
import PublicationQueueTab from "@/components/tabs/PublicationQueueTab";
import AnalyticsTab from "@/components/tabs/AnalyticsTab";
import { PostHistoryTab } from "@/components/tabs/PostHistoryTab";
import { SuggestionsTab } from "@/components/tabs/SuggestionsTab";
import { usePosts } from "@/hooks/usePosts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "create");
  
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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6">
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
      </main>
    </div>
  );
};

export default Index;