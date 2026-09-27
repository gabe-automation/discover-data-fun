import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type Message = { id: string; user_id: string; body: string; mentions: string[]; activity_id: number | null; created_at: string };

export function useChat(projectId: string, myId: string, isOpen: boolean, nameOf: (id: string) => string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => { if (isOpen) setUnread(0); }, [isOpen]);

  useEffect(() => {
    let cancelled = false;
    supabase.from("messages").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(200).then(({ data }) => {
      if (!cancelled && data) setMessages((data as Message[]).reverse());
    });
    const ch = supabase
      .channel(`chat:${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `project_id=eq.${projectId}` }, (p) => {
        const m = p.new as Message;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.user_id !== myId) {
          setUnread((u) => u + 1);
          if (m.mentions.includes(myId)) toast(`${nameOf(m.user_id)} mentioned you`, { description: m.body.slice(0, 120) });
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) setMessages((prev) => prev.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [projectId, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (body: string, mentions: string[], activityId: number | null) => {
    const { data, error } = await supabase.from("messages").insert({ project_id: projectId, body, mentions, activity_id: activityId }).select().single();
    if (error) { toast.error("Message not sent"); return false; }
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message]));
    return true;
  }, [projectId]);

  const remove = useCallback(async (id: string) => {
    setMessages((prev) => prev.filter((x) => x.id !== id));
    await supabase.from("messages").delete().eq("id", id);
  }, []);

  return { messages, unread, send, remove };
}
