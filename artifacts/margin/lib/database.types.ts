// Hand-authored from 001_init_schema.sql.
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
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          cover_style: "solid" | "image";
          cover_color?: string | null;
          cover_image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          cover_style?: "solid" | "image";
          cover_color?: string | null;
          cover_image_url?: string | null;
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
          thumbnail_path: string | null;
          transcription_text: string | null;
          transcription_status: "pending" | "processing" | "done" | "failed";
          pending_corrections: Json;
          correction_count: number;
          resurfaced_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          journal_id: string;
          page_number: number;
          image_path: string;
          thumbnail_path?: string | null;
          transcription_text?: string | null;
          transcription_status?: "pending" | "processing" | "done" | "failed";
          pending_corrections?: Json;
          correction_count?: number;
          resurfaced_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          journal_id?: string;
          page_number?: number;
          image_path?: string;
          thumbnail_path?: string | null;
          transcription_text?: string | null;
          transcription_status?: "pending" | "processing" | "done" | "failed";
          pending_corrections?: Json;
          correction_count?: number;
          resurfaced_at?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
      save_correction: {
        Args: {
          p_page_id: string;
          p_original: string;
          p_corrected: string;
          p_user_id: string;
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
    };
    Enums: Record<string, never>;
  };
}
