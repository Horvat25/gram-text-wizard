import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Post {
  id: string;
  caption: string;
  hashtags: string[] | null;
  post_type: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string | null;
  image_url: string | null;
  video_url: string | null;
  media_type: string | null;
  ai_model_used: string | null;
  instagram_post_id: string | null;
  likes_count: number | null;
  comments_count: number | null;
  saves_count: number | null;
  reach: number | null;
  user_id: string | null;
  carousel_images: string[] | null;
}

export interface CreatePostData {
  caption: string;
  hashtags?: string[];
  post_type?: string;
  status?: string;
  scheduled_for?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  media_type?: string;
  ai_model_used?: string;
  overlay_metadata?: any;
  carousel_images?: string[] | null;
}

export const usePosts = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPosts([]);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setPosts(data || []);
    } catch (err: any) {
      console.error("Error fetching posts:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createPost = async (postData: CreatePostData): Promise<Post | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Você precisa estar logado para criar posts");
        return null;
      }

      const { data, error } = await supabase
        .from("posts")
        .insert({
          caption: postData.caption,
          hashtags: postData.hashtags || [],
          post_type: postData.post_type || "engajamento",
          status: postData.status || "draft",
          scheduled_for: postData.scheduled_for || null,
          image_url: postData.image_url || null,
          video_url: postData.video_url || null,
          media_type: postData.media_type || "image",
          ai_model_used: postData.ai_model_used || null,
          overlay_metadata: postData.overlay_metadata || null,
          carousel_images: postData.carousel_images || null,
          user_id: user.id,
        } as any)
        .select()
        .single();

      if (error) throw error;

      setPosts((prev) => [data, ...prev]);
      
      // Only show toast for draft/scheduled, not for publish flow
      if (postData.status === "scheduled") {
        toast.success("Post agendado com sucesso!");
      } else if (postData.status === "draft") {
        toast.success("Rascunho salvo!");
      }
      
      return data;
    } catch (err: any) {
      console.error("Error creating post:", err);
      toast.error("Erro ao salvar post");
      return null;
    }
  };

  const updatePost = async (
    id: string,
    updates: Partial<CreatePostData>
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("posts")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      setPosts((prev) =>
        prev.map((post) => (post.id === id ? { ...post, ...updates } : post))
      );
      toast.success("Post atualizado!");
      return true;
    } catch (err: any) {
      console.error("Error updating post:", err);
      toast.error("Erro ao atualizar post");
      return false;
    }
  };

  const deletePost = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from("posts").delete().eq("id", id);

      if (error) throw error;

      setPosts((prev) => prev.filter((post) => post.id !== id));
      toast.success("Post excluído!");
      return true;
    } catch (err: any) {
      console.error("Error deleting post:", err);
      toast.error("Erro ao excluir post");
      return false;
    }
  };

  const publishPost = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.functions.invoke("publish-post", {
        body: { postId: id },
      });

      if (error) throw error;

      await fetchPosts();
      toast.success("Post publicado com sucesso!");
      return true;
    } catch (err: any) {
      console.error("Error publishing post:", err);
      toast.error("Erro ao publicar post");
      return false;
    }
  };

  const reschedulePost = async (
    id: string,
    newDate: string
  ): Promise<boolean> => {
    return updatePost(id, { scheduled_for: newDate, status: "scheduled" });
  };

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Subscribe to realtime changes
  useEffect(() => {
    const channel = supabase
      .channel("posts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        (payload) => {
          console.log("Realtime update:", payload);
          fetchPosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPosts]);

  return {
    posts,
    isLoading,
    error,
    fetchPosts,
    createPost,
    updatePost,
    deletePost,
    publishPost,
    reschedulePost,
  };
};

// Filtered hooks for specific views
export const useScheduledPosts = () => {
  const { posts, ...rest } = usePosts();
  const scheduledPosts = posts.filter((p) => p.status === "scheduled");
  return { posts: scheduledPosts, allPosts: posts, ...rest };
};

export const usePublishedPosts = () => {
  const { posts, ...rest } = usePosts();
  const publishedPosts = posts.filter((p) => p.status === "published");
  return { posts: publishedPosts, allPosts: posts, ...rest };
};

export const useDraftPosts = () => {
  const { posts, ...rest } = usePosts();
  const draftPosts = posts.filter((p) => p.status === "draft");
  return { posts: draftPosts, allPosts: posts, ...rest };
};
