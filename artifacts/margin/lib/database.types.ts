// Hand-authored from migrations.
// Regenerate after schema changes: supabase gen types typescript --project-id <ref> > lib/database.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PendingCorrection = {
  original: string;
  suggested: string;
};

export interface Database {
  public: {
    Tables: {
      journals: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          cover_style: "solid" | "image";
          cover_color: string | null;
          cover_image_url: string | null;
          is_private: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          cover_style: "solid" | "image";
          cover_color?: string | null;
          cover_image_url?: string | null;
          is_private?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          cover_style?: "solid" | "image";
          cover_color?: string | null;
          cover_image_url?: string | null;
          is_private?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      pages: {
        Row: {
          id: string;
          journal_id: string;
          page_number: number;
          image_path: string;
          original_image_path: string | null;
          thumbnail_path: string | null;
          transcription_text: string | null;
          transcription_status: "pending" | "processing" | "done" | "failed";
          pending_corrections: Json;
          correction_count: number;
          resurfaced_at: string | null;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          journal_id: string;
          page_number: number;
          image_path: string;
          original_image_path?: string | null;
          thumbnail_path?: string | null;
          transcription_text?: string | null;
          transcription_status?: "pending" | "processing" | "done" | "failed";
          pending_corrections?: Json;
          correction_count?: number;
          resurfaced_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          journal_id?: string;
          page_number?: number;
          image_path?: string;
          original_image_path?: string | null;
          thumbnail_path?: string | null;
          transcription_text?: string | null;
          transcription_status?: "pending" | "processing" | "done" | "failed";
          pending_corrections?: Json;
          correction_count?: number;
          resurfaced_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pages_journal_id_fkey";
            columns: ["journal_id"];
            isOneToOne: false;
            referencedRelation: "journals";
            referencedColumns: ["id"];
          },
        ];
      };
      corrections: {
        Row: {
          id: string;
          page_id: string;
          original_word: string;
          corrected_word: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          page_id: string;
          original_word: string;
          corrected_word: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          page_id?: string;
          original_word?: string;
          corrected_word?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "corrections_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id"];
          },
        ];
      };
      glossary: {
        Row: {
          id: string;
          user_id: string;
          original_word: string;
          corrected_word: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          original_word: string;
          corrected_word: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          original_word?: string;
          corrected_word?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          on_this_day_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          on_this_day_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token?: string;
          on_this_day_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: "pending" | "accepted" | "declined";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: "pending" | "accepted" | "declined";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          addressee_id?: string;
          status?: "pending" | "accepted" | "declined";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          from_user_id: string | null;
          data: Json;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          from_user_id?: string | null;
          data?: Json;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          from_user_id?: string | null;
          data?: Json;
          read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      shared_entries: {
        Row: {
          id: string;
          user_id: string;
          page_id: string;
          excerpt_text: string;
          share_type: "page" | "snippet";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          page_id: string;
          excerpt_text: string;
          share_type?: "page" | "snippet";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          page_id?: string;
          excerpt_text?: string;
          share_type?: "page" | "snippet";
          created_at?: string;
        };
        Relationships: [];
      };
      feed_likes: {
        Row: {
          id: string;
          user_id: string;
          entry_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entry_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entry_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      feed_comments: {
        Row: {
          id: string;
          user_id: string;
          entry_id: string;
          comment_text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entry_id: string;
          comment_text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          entry_id?: string;
          comment_text?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_correction: {
        Args: {
          p_page_id: string;
          p_original: string;
          p_corrected: string;
        };
        Returns: undefined;
      };
      search_pages: {
        Args: { query: string };
        Returns: Array<{
          page_id: string;
          journal_id: string;
          journal_title: string;
          page_number: number;
          snippet: string;
        }>;
      };
      get_resurface_page: {
        Args: Record<string, never>;
        Returns: Array<{
          page_id: string;
          journal_id: string;
          journal_title: string;
          page_number: number;
          transcription_text: string;
          created_at: string;
        }>;
      };
      get_user_storage_bytes: {
        Args: Record<string, never>;
        Returns: number;
      };
      get_user_stats: {
        Args: Record<never, never>;
        Returns: {
          total_pages: number;
          total_words: number;
          total_journals: number;
          streak_days: number;
        };
      };
      journal_pending_counts: {
        Args: { p_journal_ids: string[] };
        Returns: Array<{
          journal_id: string;
          pending_count: number;
        }>;
      };
      reorder_pages: {
        Args: { p_journal_id: string; p_page_ids: string[] };
        Returns: undefined;
      };
      get_journals_with_counts: {
        Args: Record<string, never>;
        Returns: Array<{
          id: string;
          title: string;
          cover_style: string;
          cover_color: string | null;
          cover_image_url: string | null;
          is_private: boolean;
          created_at: string;
          page_count: number;
          pending_count: number;
        }>;
      };
      find_user_by_email: {
        Args: { p_email: string };
        Returns: Array<{ user_id: string; user_email: string }>;
      };
      get_friends: {
        Args: Record<string, never>;
        Returns: Array<{
          friend_id: string;
          friendship_id: string;
          friend_email: string;
          since: string;
        }>;
      };
      get_pending_friend_requests: {
        Args: Record<string, never>;
        Returns: Array<{
          friendship_id: string;
          from_user_id: string;
          from_user_email: string;
          created_at: string;
        }>;
      };
      get_feed: {
        Args: { p_limit?: number; p_offset?: number };
        Returns: Array<{
          entry_id: string;
          user_id: string;
          author_email: string;
          page_id: string;
          excerpt_text: string;
          share_type: string;
          created_at: string;
          like_count: number;
          comment_count: number;
          viewer_liked: boolean;
        }>;
      };
      get_comments: {
        Args: { p_entry_id: string };
        Returns: Array<{
          comment_id: string;
          user_id: string;
          author_email: string;
          comment_text: string;
          created_at: string;
        }>;
      };
    };
    Enums: Record<string, never>;
  };
}
