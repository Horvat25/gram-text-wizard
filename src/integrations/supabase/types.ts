export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agent_chat_messages: {
        Row: {
          actions: Json | null
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          actions?: Json | null
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          actions?: Json | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_context: {
        Row: {
          agent_avatar_url: string | null
          agent_name: string | null
          audience_preferences: string[] | null
          auto_post_enabled: boolean | null
          avoid_topics: string[] | null
          best_hashtags: string[] | null
          best_posting_times: string[] | null
          brand_voice: string | null
          content_focus: string[] | null
          daily_post_limit: number | null
          emoji_usage: string | null
          hashtag_strategy: string | null
          id: string
          industry_niche: string | null
          language_formality: string | null
          min_hours_between_posts: number | null
          performance_history: number[] | null
          personality_traits: string[] | null
          posting_style: string | null
          preferred_platforms: string[] | null
          response_style: string | null
          success_patterns: string[] | null
          system_prompt_template: string | null
          target_audience: string | null
          top_topics: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_avatar_url?: string | null
          agent_name?: string | null
          audience_preferences?: string[] | null
          auto_post_enabled?: boolean | null
          avoid_topics?: string[] | null
          best_hashtags?: string[] | null
          best_posting_times?: string[] | null
          brand_voice?: string | null
          content_focus?: string[] | null
          daily_post_limit?: number | null
          emoji_usage?: string | null
          hashtag_strategy?: string | null
          id?: string
          industry_niche?: string | null
          language_formality?: string | null
          min_hours_between_posts?: number | null
          performance_history?: number[] | null
          personality_traits?: string[] | null
          posting_style?: string | null
          preferred_platforms?: string[] | null
          response_style?: string | null
          success_patterns?: string[] | null
          system_prompt_template?: string | null
          target_audience?: string | null
          top_topics?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_avatar_url?: string | null
          agent_name?: string | null
          audience_preferences?: string[] | null
          auto_post_enabled?: boolean | null
          avoid_topics?: string[] | null
          best_hashtags?: string[] | null
          best_posting_times?: string[] | null
          brand_voice?: string | null
          content_focus?: string[] | null
          daily_post_limit?: number | null
          emoji_usage?: string | null
          hashtag_strategy?: string | null
          id?: string
          industry_niche?: string | null
          language_formality?: string | null
          min_hours_between_posts?: number | null
          performance_history?: number[] | null
          personality_traits?: string[] | null
          posting_style?: string | null
          preferred_platforms?: string[] | null
          response_style?: string | null
          success_patterns?: string[] | null
          system_prompt_template?: string | null
          target_audience?: string | null
          top_topics?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_decisions: {
        Row: {
          actual_engagement: number | null
          content_plan: Json | null
          created_at: string | null
          decision: string
          decision_reason: string | null
          expected_engagement: number | null
          hypothesis: string | null
          hypothesis_confirmed: boolean | null
          id: string
          learning: string | null
          metrics_snapshot: Json | null
          post_id: string | null
          user_id: string
        }
        Insert: {
          actual_engagement?: number | null
          content_plan?: Json | null
          created_at?: string | null
          decision: string
          decision_reason?: string | null
          expected_engagement?: number | null
          hypothesis?: string | null
          hypothesis_confirmed?: boolean | null
          id?: string
          learning?: string | null
          metrics_snapshot?: Json | null
          post_id?: string | null
          user_id: string
        }
        Update: {
          actual_engagement?: number | null
          content_plan?: Json | null
          created_at?: string | null
          decision?: string
          decision_reason?: string | null
          expected_engagement?: number | null
          hypothesis?: string | null
          hypothesis_confirmed?: boolean | null
          id?: string
          learning?: string | null
          metrics_snapshot?: Json | null
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_decisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      backups: {
        Row: {
          backup_type: string
          created_at: string | null
          download_url: string | null
          file_size: number | null
          id: string
          metadata: Json | null
          project_id: string
        }
        Insert: {
          backup_type: string
          created_at?: string | null
          download_url?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          project_id: string
        }
        Update: {
          backup_type?: string
          created_at?: string | null
          download_url?: string | null
          file_size?: number | null
          id?: string
          metadata?: Json | null
          project_id?: string
        }
        Relationships: []
      }
      instagram_accounts: {
        Row: {
          access_token: string
          connected_at: string | null
          expires_at: string | null
          id: string
          instagram_user_id: string
          page_id: string | null
          profile_picture_url: string | null
          updated_at: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          access_token: string
          connected_at?: string | null
          expires_at?: string | null
          id?: string
          instagram_user_id: string
          page_id?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          access_token?: string
          connected_at?: string | null
          expires_at?: string | null
          id?: string
          instagram_user_id?: string
          page_id?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      instagram_credentials: {
        Row: {
          access_token: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          instagram_user_id: string | null
          is_connected: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          instagram_user_id?: string | null
          is_connected?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          instagram_user_id?: string | null
          is_connected?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          ai_model_used: string | null
          caption: string
          carousel_images: string[] | null
          comments_count: number | null
          cost_estimate: number | null
          created_at: string | null
          error_message: string | null
          external_job_id: string | null
          hashtags: string[] | null
          id: string
          image_url: string | null
          instagram_post_id: string | null
          likes_count: number | null
          media_type: string | null
          overlay_metadata: Json | null
          platforms: string[] | null
          post_type: string | null
          published_at: string | null
          reach: number | null
          saves_count: number | null
          scheduled_for: string | null
          status: string
          tiktok_post_id: string | null
          updated_at: string | null
          user_id: string | null
          video_url: string | null
        }
        Insert: {
          ai_model_used?: string | null
          caption: string
          carousel_images?: string[] | null
          comments_count?: number | null
          cost_estimate?: number | null
          created_at?: string | null
          error_message?: string | null
          external_job_id?: string | null
          hashtags?: string[] | null
          id?: string
          image_url?: string | null
          instagram_post_id?: string | null
          likes_count?: number | null
          media_type?: string | null
          overlay_metadata?: Json | null
          platforms?: string[] | null
          post_type?: string | null
          published_at?: string | null
          reach?: number | null
          saves_count?: number | null
          scheduled_for?: string | null
          status?: string
          tiktok_post_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          video_url?: string | null
        }
        Update: {
          ai_model_used?: string | null
          caption?: string
          carousel_images?: string[] | null
          comments_count?: number | null
          cost_estimate?: number | null
          created_at?: string | null
          error_message?: string | null
          external_job_id?: string | null
          hashtags?: string[] | null
          id?: string
          image_url?: string | null
          instagram_post_id?: string | null
          likes_count?: number | null
          media_type?: string | null
          overlay_metadata?: Json | null
          platforms?: string[] | null
          post_type?: string | null
          published_at?: string | null
          reach?: number | null
          saves_count?: number | null
          scheduled_for?: string | null
          status?: string
          tiktok_post_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          instagram_username: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          instagram_username?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          instagram_username?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          brand_logo_url: string | null
          brand_name: string | null
          created_at: string | null
          id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          brand_logo_url?: string | null
          brand_name?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tiktok_accounts: {
        Row: {
          access_token: string
          avatar_url: string | null
          connected_at: string | null
          display_name: string | null
          expires_at: string | null
          id: string
          open_id: string
          refresh_token: string | null
          updated_at: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          connected_at?: string | null
          display_name?: string | null
          expires_at?: string | null
          id?: string
          open_id: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          connected_at?: string | null
          display_name?: string | null
          expires_at?: string | null
          id?: string
          open_id?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      publish_scheduled_posts: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
