// Local Storage Manager - 100% remixable, no backend required

export interface Post {
  id: string;
  caption: string;
  hashtags: string[];
  status: "draft" | "scheduled" | "published" | "failed";
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  post_type: string;
  image_url: string | null;
}

export interface PostMetrics {
  post_id: string;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  reach: number;
  engagement_rate: number;
  updated_at: string;
}

export interface AgentContext {
  brandVoice: string;
  successPatterns: string[];
  topTopics: string[];
  bestHashtags: string[];
  audiencePreferences: string[];
  performanceHistory: number[];
  lastUpdated: string;
}

export interface UserSettings {
  brandName: string;
  brandLogoUrl: string | null;
  preferredPostTimes: string[];
  preferredVoice: string;
}

interface LocalData {
  posts: Post[];
  metrics: PostMetrics[];
  agentContext: AgentContext;
  settings: UserSettings;
}

const STORAGE_KEY = "instagram_manager_data";

// Initialize default data
const getDefaultData = (): LocalData => ({
  posts: [],
  metrics: [],
  agentContext: {
    brandVoice: "professional and engaging",
    successPatterns: [],
    topTopics: [],
    bestHashtags: [],
    audiencePreferences: [],
    performanceHistory: [],
    lastUpdated: new Date().toISOString(),
  },
  settings: {
    brandName: "NeuralUpdate",
    brandLogoUrl: null,
    preferredPostTimes: [],
    preferredVoice: "camila",
  },
});

// Get all data
export const loadData = (): LocalData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...getDefaultData(), ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
  return getDefaultData();
};

// Save all data
const saveData = (data: LocalData) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Error saving data:", error);
  }
};

// Posts
export const savePosts = (posts: Post[]) => {
  const data = loadData();
  data.posts = posts;
  saveData(data);
};

export const addPost = (post: Omit<Post, "id" | "created_at">): Post => {
  const data = loadData();
  const newPost: Post = {
    ...post,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  data.posts.unshift(newPost);
  saveData(data);
  return newPost;
};

export const updatePost = (id: string, updates: Partial<Post>) => {
  const data = loadData();
  const index = data.posts.findIndex((p) => p.id === id);
  if (index !== -1) {
    data.posts[index] = { ...data.posts[index], ...updates };
    saveData(data);
  }
};

export const deletePost = (id: string) => {
  const data = loadData();
  data.posts = data.posts.filter((p) => p.id !== id);
  saveData(data);
};

export const loadPosts = (): Post[] => {
  return loadData().posts;
};

// Metrics
export const saveMetrics = (postId: string, metrics: Omit<PostMetrics, "post_id" | "updated_at">) => {
  const data = loadData();
  const existingIndex = data.metrics.findIndex((m) => m.post_id === postId);
  
  const engagementRate = metrics.reach > 0 
    ? ((metrics.likes_count + metrics.comments_count + metrics.saves_count) / metrics.reach) * 100
    : 0;

  const newMetrics: PostMetrics = {
    ...metrics,
    post_id: postId,
    engagement_rate: engagementRate,
    updated_at: new Date().toISOString(),
  };

  if (existingIndex !== -1) {
    data.metrics[existingIndex] = newMetrics;
  } else {
    data.metrics.push(newMetrics);
  }
  
  saveData(data);
  return newMetrics;
};

export const getMetricsForPost = (postId: string): PostMetrics | null => {
  const data = loadData();
  return data.metrics.find((m) => m.post_id === postId) || null;
};

export const loadAllMetrics = (): PostMetrics[] => {
  return loadData().metrics;
};

// Agent Context
export const saveAgentContext = (context: Partial<AgentContext>) => {
  const data = loadData();
  data.agentContext = {
    ...data.agentContext,
    ...context,
    lastUpdated: new Date().toISOString(),
  };
  saveData(data);
};

export const loadAgentContext = (): AgentContext => {
  return loadData().agentContext;
};

// Settings
export const saveSettings = (settings: Partial<UserSettings>) => {
  const data = loadData();
  data.settings = { ...data.settings, ...settings };
  saveData(data);
};

export const loadSettings = (): UserSettings => {
  return loadData().settings;
};

// Export/Import
export const exportData = (): string => {
  const data = loadData();
  return JSON.stringify({
    ...data,
    exportDate: new Date().toISOString(),
    version: "1.0",
  }, null, 2);
};

export const importData = (jsonString: string): boolean => {
  try {
    const imported = JSON.parse(jsonString);
    if (imported.posts && imported.metrics && imported.agentContext && imported.settings) {
      saveData(imported);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error importing data:", error);
    return false;
  }
};

// Clear all data
export const clearAllData = () => {
  localStorage.removeItem(STORAGE_KEY);
};
