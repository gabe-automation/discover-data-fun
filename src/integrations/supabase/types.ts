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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          after: Json | null
          before: Json | null
          created_at: string
          detail: Json | null
          id: number
          node_id: string | null
          outcome: string
          project_id: string
          target: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          detail?: Json | null
          id?: number
          node_id?: string | null
          outcome?: string
          project_id: string
          target: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          detail?: Json | null
          id?: number
          node_id?: string | null
          outcome?: string
          project_id?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          expires_at: string
          holder_color: string
          holder_id: string
          holder_name: string
          holder_session: string
          node_id: string
          project_id: string
        }
        Insert: {
          expires_at: string
          holder_color: string
          holder_id: string
          holder_name: string
          holder_session: string
          node_id: string
          project_id: string
        }
        Update: {
          expires_at?: string
          holder_color?: string
          holder_id?: string
          holder_name?: string
          holder_session?: string
          node_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          activity_id: number | null
          body: string
          created_at: string
          id: string
          mentions: string[]
          project_id: string
          user_id: string
        }
        Insert: {
          activity_id?: number | null
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          project_id: string
          user_id?: string
        }
        Update: {
          activity_id?: number | null
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      node_locks: {
        Row: {
          allowed: string[]
          created_at: string
          locked_by: string
          locked_by_name: string
          mode: string
          node_id: string
          project_id: string
        }
        Insert: {
          allowed?: string[]
          created_at?: string
          locked_by: string
          locked_by_name?: string
          mode?: string
          node_id: string
          project_id: string
        }
        Update: {
          allowed?: string[]
          created_at?: string
          locked_by?: string
          locked_by_name?: string
          mode?: string
          node_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "node_locks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      nodes: {
        Row: {
          id: string
          project_id: string
          props: Json
          updated_at: string
        }
        Insert: {
          id: string
          project_id: string
          props?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          props?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          created_at: string
          id: string
          kind: string
          project_id: string
          sort: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          project_id: string
          sort?: string
          title?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          project_id?: string
          sort?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          color: string
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          color?: string
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          role: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          theme: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: []
      }
      published_sites: {
        Row: {
          html: string
          project_id: string
          published_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          html: string
          project_id: string
          published_by?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          html?: string
          project_id?: string
          published_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_sites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      seen_ops: {
        Row: {
          created_at: string
          op_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          op_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          op_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seen_ops_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      text_updates: {
        Row: {
          created_at: string
          id: number
          node_id: string
          project_id: string
          update: string
        }
        Insert: {
          created_at?: string
          id?: number
          node_id: string
          project_id: string
          update: string
        }
        Update: {
          created_at?: string
          id?: number
          node_id?: string
          project_id?: string
          update?: string
        }
        Relationships: [
          {
            foreignKeyName: "text_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _actor_name: { Args: never; Returns: string }
      _lock_blocks: {
        Args: { _node: string; _project: string; _props: Json; _user: string }
        Returns: string
      }
      acquire_lease: {
        Args: {
          _heartbeat: boolean
          _label: string
          _node: string
          _project: string
          _session: string
          _ttl: number
        }
        Returns: boolean
      }
      add_member_by_email: {
        Args: {
          _email: string
          _project: string
          _role: Database["public"]["Enums"]["project_role"]
        }
        Returns: string
      }
      apply_node_op: {
        Args: {
          _action: string
          _actor: string
          _clock: number
          _label: string
          _node: string
          _op_id: string
          _project: string
          _props: Json
          _session: string
        }
        Returns: string
      }
      can_edit: { Args: { _project: string; _user: string }; Returns: boolean }
      create_project: { Args: { _name: string }; Returns: string }
      force_release_lease: {
        Args: { _label: string; _node: string; _project: string }
        Returns: boolean
      }
      is_member: { Args: { _project: string; _user: string }; Returns: boolean }
      project_role_of: {
        Args: { _project: string; _user: string }
        Returns: Database["public"]["Enums"]["project_role"]
      }
      release_lease: {
        Args: {
          _label: string
          _node: string
          _project: string
          _session: string
        }
        Returns: undefined
      }
      set_node_lock: {
        Args: {
          _allowed: string[]
          _label: string
          _mode: string
          _node: string
          _project: string
        }
        Returns: string
      }
    }
    Enums: {
      project_role: "owner" | "editor" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      project_role: ["owner", "editor", "viewer"],
    },
  },
} as const
