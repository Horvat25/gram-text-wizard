import { useState, useRef } from "react";
import Header from "@/components/Header";
import PostGenerator from "@/components/PostGenerator";
import PostHistory from "@/components/PostHistory";
import InstagramPreview from "@/components/InstagramPreview";
import PostScore from "@/components/PostScore";
import MetricsDashboard from "@/components/MetricsDashboard";
import DownloadActions from "@/components/DownloadActions";

const Index = () => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [previewCaption, setPreviewCaption] = useState("");
  const [previewHashtags, setPreviewHashtags] = useState<string[]>([]);
  const [previewImageUrl, setPreviewImageUrl] = useState("");

  const handlePostCreated = () => {
    setRefreshTrigger((prev) => prev + 1);
    // Clear preview after saving
    setPreviewCaption("");
    setPreviewHashtags([]);
    setPreviewImageUrl("");
  };

  const handleCaptionGenerated = (caption: string, hashtags: string[], imageUrl?: string) => {
    setPreviewCaption(caption);
    setPreviewHashtags(hashtags);
    if (imageUrl) {
      setPreviewImageUrl(imageUrl);
    }
  };

  const handleEditPost = (post: any) => {
    setPreviewCaption(post.caption);
    setPreviewHashtags(post.hashtags);
    setPreviewImageUrl(post.image_url || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleViewPost = (post: any) => {
    setPreviewCaption(post.caption);
    setPreviewHashtags(post.hashtags);
    setPreviewImageUrl(post.image_url || "");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Metrics Dashboard */}
        <MetricsDashboard />

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Generator */}
          <div className="lg:col-span-1">
            <PostGenerator
              onPostCreated={handlePostCreated}
              onCaptionGenerated={handleCaptionGenerated}
            />
          </div>

          {/* Preview & Score */}
          <div className="lg:col-span-1 space-y-6">
            <div ref={previewRef}>
              <InstagramPreview
                caption={previewCaption}
                hashtags={previewHashtags}
                imageUrl={previewImageUrl}
              />
            </div>
            <DownloadActions
              caption={previewCaption}
              hashtags={previewHashtags}
              imageUrl={previewImageUrl}
              previewRef={previewRef}
            />
            <PostScore caption={previewCaption} hashtags={previewHashtags} />
          </div>

          {/* History */}
          <div className="lg:col-span-1">
            <PostHistory 
              refreshTrigger={refreshTrigger}
              onEditPost={handleEditPost}
              onViewPost={handleViewPost}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;