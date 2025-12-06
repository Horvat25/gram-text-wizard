import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, CalendarDays, BarChart3, Link2, History, Wand2, Lightbulb } from "lucide-react";
import ContentCreationTab from "@/components/tabs/ContentCreationTab";
import PublicationQueueTab from "@/components/tabs/PublicationQueueTab";
import AnalyticsTab from "@/components/tabs/AnalyticsTab";
import { ConnectAccountTab } from "@/components/tabs/ConnectAccountTab";
import { PostHistoryTab } from "@/components/tabs/PostHistoryTab";
import { AISettingsTab } from "@/components/tabs/AISettingsTab";
import { SuggestionsTab } from "@/components/tabs/SuggestionsTab";
import { usePosts } from "@/hooks/usePosts";

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
          <TabsList className="grid w-full grid-cols-7 lg:w-auto lg:inline-grid">
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
            <TabsTrigger value="ai-settings" className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              <span className="hidden sm:inline">IA</span>
            </TabsTrigger>
            <TabsTrigger value="connect" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Conectar</span>
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

          <TabsContent value="ai-settings" className="space-y-6">
            <AISettingsTab />
          </TabsContent>

          <TabsContent value="connect" className="space-y-6">
            <ConnectAccountTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
