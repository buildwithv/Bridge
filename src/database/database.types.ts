export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export interface Database {
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string;
          user_id: string;
          status: 'active' | 'archived';
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: 'active' | 'archived';
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: 'active' | 'archived';
          title?: string | null;
          updated_at?: string;
        };
        Relationships: Relationship[];
      };
      conversation_messages: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          role: 'user' | 'assistant';
          content: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          role: 'user' | 'assistant';
          content: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          content?: string;
          metadata?: Json;
        };
        Relationships: Relationship[];
      };
      message_embeddings: {
        Row: {
          id: string;
          message_id: string | null;
          user_id: string;
          content: string;
          embedding: number[] | null;
          source: 'message' | 'document' | 'memory';
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id?: string | null;
          user_id: string;
          content: string;
          embedding?: number[] | null;
          source?: 'message' | 'document' | 'memory';
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          embedding?: number[] | null;
          metadata?: Json;
        };
        Relationships: Relationship[];
      };
      people: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          relationship: string | null;
          facts: Json;
          first_mentioned_at: string;
          last_mentioned_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          relationship?: string | null;
          facts?: Json;
          first_mentioned_at?: string;
          last_mentioned_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          relationship?: string | null;
          facts?: Json;
          last_mentioned_at?: string;
          updated_at?: string;
        };
        Relationships: Relationship[];
      };
      memory_entries: {
        Row: {
          id: string;
          user_id: string;
          content: string;
          category: 'fact' | 'preference' | 'relationship' | 'emotion';
          entity_id: string | null;
          embedding_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          category: 'fact' | 'preference' | 'relationship' | 'emotion';
          entity_id?: string | null;
          embedding_id?: string | null;
          created_at?: string;
        };
        Update: {
          content?: string;
          category?: 'fact' | 'preference' | 'relationship' | 'emotion';
          entity_id?: string | null;
          embedding_id?: string | null;
        };
        Relationships: Relationship[];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
