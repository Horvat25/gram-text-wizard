import { useState } from "react";
import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, CalendarDays, BarChart3, Link2 } from "lucide-react";
import ContentCreationTab from "@/components/tabs/ContentCreationTab";
import PublicationQueueTab from "@/components/tabs/PublicationQueueTab";
import AnalyticsTab from "@/components/tabs/AnalyticsTab";
import { ConnectAccountTab } from "@/components/tabs/ConnectAccountTab";
import { usePosts } from "@/hooks/usePosts";

const Index = () => {
  const [activeTab, setActiveTab] = useState("create");
  const {
    posts,
    isLoading,
    createPost,
    updatePost,
    deletePost,
    publishPost,
    reschedulePost,
  } = usePosts();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Criação</span>
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Fila</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="connect" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Conectar</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-6">
            <ContentCreationTab onPostCreated={createPost} />
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

          <TabsContent value="analytics" className="space-y-6">
            <AnalyticsTab posts={posts} />
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
