import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AtSign, GitCommitHorizontal, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { Activity } from "@/lib/useRoom";
import { ActivityPreview } from "./ActivityPreview";

export type Member = { user_id: string; name: string; color: string };
export type Message = {
  id: string; user_id: string; body: string; mentions: string[]; activity_id: number | null; created_at: string;
  activity: Activity | null;
};

export function useChat(projectId: string, userId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastRead, setLastRead] = useState(0);
  const key = `wc-chat-read:${projectId}`;
  useEffect(() => { setLastRead(Number(localStorage.getItem(key) ?? 0)); }, [key]);

  useEffect(() => {
    let cancelled = false;
    supabase.from("messages").select("*, activity(*)").eq("project_id", projectId).order("created_at").limit(300).then(({ data }) => {
      if (!cancelled && data) setMessages(data as unknown as Message[]);
    });
    const ch = supabase
      .channel(`chat:${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `project_id=eq.${projectId}` }, async (p) => {
        const m = p.new as Message;
        let activity: Activity | null = null;
        if (m.activity_id) activity = ((await supabase.from("activity").select("*").eq("id", m.activity_id).maybeSingle()).data as unknown as Activity) ?? null;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, activity }]));
        if (m.user_id !== userId && m.mentions.includes(userId)) toast.info("You were mentioned in team chat");
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        const id = (p.old as { id?: string }).id;
        setMessages((prev) => prev.filter((x) => x.id !== id));
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [projectId, userId]);

  const unread = messages.filter((m) => m.user_id !== userId && new Date(m.created_at).getTime() > lastRead);
  const mentions = unread.filter((m) => m.mentions.includes(userId)).length;
  const markRead = useCallback(() => {
    const t = Date.now();
    localStorage.setItem(key, String(t));
    setLastRead(t);
  }, [key]);
  return { messages, unread: unread.length, mentions, markRead };
}

type Props = {
  projectId: string;
  userId: string;
  members: Member[];
  activity: Activity[];
  chat: ReturnType<typeof useChat>;
  attachInit: Activity | null;
  onClearAttachInit: () => void;
  onJump: (a: Activity) => void;
};

export function ChatPanel(p: Props) {
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState<Activity | null>(null);
  const [picking, setPicking] = useState(false);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => Object.fromEntries(p.members.map((m) => [m.user_id, m])), [p.members]);

  useEffect(() => { if (p.attachInit) { setAttach(p.attachInit); p.onClearAttachInit(); taRef.current?.focus(); } }, [p.attachInit, p.onClearAttachInit]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); p.chat.markRead(); }, [p.chat.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const changes = p.activity.filter((a) => a.outcome === "applied" && a.node_id).slice(0, 40);

  function onChange(v: string) {
    setBody(v);
    const el = taRef.current!;
    const before = v.slice(0, el.selectionStart);
    const m = /@([\w.-]*)$/.exec(before);
    setMentionQ(m ? m[1]!.toLowerCase() : null);
  }
  function insertMention(m: Member) {
    const el = taRef.current!;
    const pos = el.selectionStart;
    const before = body.slice(0, pos).replace(/@[\w.-]*$/, `@${m.name} `);
    setBody(before + body.slice(pos));
    setMentionQ(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text && !attach) return;
    const mentions = p.members.filter((m) => text.includes(`@${m.name}`)).map((m) => m.user_id);
    const { error } = await supabase.from("messages").insert({
      project_id: p.projectId, body: text || "Highlighted a change", mentions, activity_id: attach?.id ?? null,
    });
    if (error) { toast.error("Couldn't send message"); return; }
    setBody(""); setAttach(null);
  }

  const suggestions = mentionQ === null ? [] : p.members.filter((m) => m.name.toLowerCase().includes(mentionQ)).slice(0, 6);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <div className="border-b px-6 py-4">
        <h2 className="text-2xl">Team chat</h2>
        <p className="text-sm text-muted-foreground">Talk with everyone on this project. Type @ to mention someone, or attach a change to explain why you made it.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {p.chat.messages.length === 0 && <p className="py-10 text-center text-muted-foreground">No messages yet — say hello.</p>}
        {p.chat.messages.map((m) => {
          const who = byId[m.user_id];
          const mine = m.user_id === p.userId;
          const mentionsMe = m.mentions.includes(p.userId) && !mine;
          return (
            <div key={m.id} className={`group flex gap-3 ${mentionsMe ? "-mx-2 rounded-lg bg-warning/15 px-2 py-1" : ""}`}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-primary-foreground" style={{ background: who?.color ?? "gray" }}>
                {(who?.name ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <strong className="text-sm font-medium">{who?.name ?? "Member"}</strong>
                  <time className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</time>
                  {mine && (
                    <button aria-label="Delete message" className="ml-auto opacity-0 group-hover:opacity-100" onClick={() => supabase.from("messages").delete().eq("id", m.id)}>
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{renderBody(m.body, p.members)}</p>
                {m.activity && (
                  <div className="mt-1.5 max-w-md rounded-lg border-l-4 border-primary bg-secondary/60 p-2">
                    <button className="flex w-full items-center gap-2 text-left text-sm" onClick={() => setOpen(open === m.id ? null : m.id)}>
                      <GitCommitHorizontal className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate"><strong className="font-medium">{m.activity.actor_name}</strong> {m.activity.action} {m.activity.target}</span>
                      <span className="text-[10px] text-muted-foreground">{open === m.id ? "Hide" : "Preview"}</span>
                    </button>
                    {open === m.id && (
                      <div className="mt-2 space-y-2">
                        <ActivityPreview a={m.activity} />
                        <Button size="sm" variant="outline" onClick={() => p.onJump(m.activity!)}>Show on page</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="relative border-t px-6 py-3">
        {suggestions.length > 0 && (
          <ul className="absolute bottom-full left-6 mb-1 w-64 overflow-hidden rounded-md border bg-popover shadow-lift">
            {suggestions.map((m) => (
              <li key={m.user_id}>
                <button type="button" onClick={() => insertMention(m)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary">
                  <span className="size-3 rounded-full" style={{ background: m.color }} /> {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {picking && (
          <div className="absolute bottom-full left-6 right-6 mb-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-lift">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pick a change to highlight</p>
            {changes.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">No changes yet.</p>}
            {changes.map((a) => (
              <button key={a.id} type="button" onClick={() => { setAttach(a); setPicking(false); taRef.current?.focus(); }} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-secondary">
                <strong className="font-medium">{a.actor_name}</strong> <span className="text-muted-foreground">{a.action}</span> {a.target}
                <span className="ml-2 text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </button>
            ))}
          </div>
        )}
        {attach && (
          <div className="mb-2 flex items-center gap-2 rounded-md border-l-4 border-primary bg-secondary/60 px-2 py-1.5 text-sm">
            <GitCommitHorizontal className="size-4 text-primary" />
            <span className="min-w-0 flex-1 truncate">Highlighting: <strong className="font-medium">{attach.actor_name}</strong> {attach.action} {attach.target}</span>
            <button type="button" aria-label="Remove highlighted change" onClick={() => setAttach(null)}><X className="size-4" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={taRef}
            value={body}
            rows={2}
            placeholder={attach ? "Explain why you made this change…" : "Message the team… (@ to mention)"}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                if (suggestions[0] && mentionQ !== null) { e.preventDefault(); insertMention(suggestions[0]); return; }
                e.preventDefault(); send();
              }
              if (e.key === "Escape") { setMentionQ(null); setPicking(false); }
            }}
            className="min-h-[44px] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button type="button" size="icon" variant="ghost" aria-label="Mention someone" onClick={() => { setBody((b) => b + "@"); setMentionQ(""); taRef.current?.focus(); }}><AtSign /></Button>
          <Button type="button" size="icon" variant={picking ? "secondary" : "ghost"} aria-label="Highlight a change" title="Highlight a change" onClick={() => setPicking((x) => !x)}><GitCommitHorizontal /></Button>
          <Button type="submit" size="icon" aria-label="Send"><Send /></Button>
        </div>
      </form>
    </div>
  );
}

function renderBody(body: string, members: Member[]) {
  if (!members.length) return body;
  const names = members.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(@(?:${names.join("|")}))`, "g");
  return body.split(re).map((part, i) =>
    re.test(part) || part.startsWith("@") && members.some((m) => part === `@${m.name}`)
      ? <span key={i} className="rounded bg-primary/15 px-1 font-medium text-primary">{part}</span>
      : <span key={i}>{part}</span>,
  );
}
