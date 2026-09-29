import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, GitCommitHorizontal, Send, Trash2, X, Crosshair, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Message } from "@/lib/useChat";
import type { Activity } from "@/lib/useRoom";
import type { Props } from "@/lib/crdt";
import type { Theme } from "@/lib/blocks";
import { ActivityPreview } from "./ActivityPreview";

type Member = { id: string; name: string; color: string };

export function ChatPage(p: {
  myId: string;
  members: Member[];
  messages: Message[];
  activity: Activity[];
  nodes: Record<string, Props>;
  theme: Theme;
  attach: Activity | null;
  setAttach: (a: Activity | null) => void;
  send: (body: string, mentions: string[], activityId: number | null) => Promise<boolean>;
  remove: (id: string) => void;
  onJump: (a: Activity) => void;
  draft: string;
  clearDraft: () => void;
  wbItems: { id: string; text: string }[];
  onOpenWb: () => void;
}) {
  const [text, setText] = useState("");
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const [pickIdx, setPickIdx] = useState(0);
  const [filter, setFilter] = useState<"all" | "mentions" | "changes">("all");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => Object.fromEntries(p.members.map((m) => [m.id, m])), [p.members]);
  const actById = useMemo(() => Object.fromEntries(p.activity.map((a) => [a.id, a])), [p.activity]);
  const myChanges = p.activity.filter((a) => a.outcome === "applied" && a.node_id).slice(0, 25);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [p.messages.length]);
  useEffect(() => {
    if (!p.draft) return;
    setText(p.draft);
    p.clearDraft();
    requestAnimationFrame(() => { const el = taRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  }, [p.draft]); // eslint-disable-line react-hooks/exhaustive-deps
  function insert(s: string) {
    const next = text + (text && !text.endsWith(" ") ? " " : "") + s;
    setText(next);
    requestAnimationFrame(() => { const el = taRef.current; if (el) { el.focus(); el.setSelectionRange(next.length, next.length); } });
  }

  const candidates = mentionQ === null ? [] : p.members.filter((m) => m.id !== p.myId && m.name.toLowerCase().includes(mentionQ.toLowerCase())).slice(0, 6);

  function onChange(v: string) {
    setText(v);
    const el = taRef.current!;
    const upto = v.slice(0, el.selectionStart);
    const m = upto.match(/@([\w.-]*)$/);
    setMentionQ(m ? m[1]! : null);
    setPickIdx(0);
  }
  function pick(m: Member) {
    const el = taRef.current!;
    const pos = el.selectionStart;
    const before = text.slice(0, pos).replace(/@([\w.-]*)$/, `@${m.name.replace(/\s+/g, "_")} `);
    const next = before + text.slice(pos);
    setText(next);
    setMentionQ(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  }
  async function submit() {
    const body = text.trim();
    if (!body && !p.attach) return;
    const mentions = p.members.filter((m) => body.includes(`@${m.name.replace(/\s+/g, "_")}`)).map((m) => m.id);
    if (await p.send(body || "Shared a change", mentions, p.attach?.id ?? null)) { setText(""); p.setAttach(null); }
  }

  const shown = p.messages.filter((m) => filter === "all" || (filter === "mentions" ? m.mentions.includes(p.myId) : m.activity_id !== null));

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div>
          <h1 className="text-2xl">Team chat</h1>
          <p className="text-sm text-muted-foreground">Everyone on this project. Type @ to mention someone, or attach a change to explain it.</p>
        </div>
        <div className="ml-auto flex rounded-lg border p-0.5 text-xs">
          {(["all", "mentions", "changes"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-2.5 py-1 capitalize ${filter === f ? "bg-secondary font-medium" : "text-muted-foreground"}`}>{f}</button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {shown.length === 0 && <p className="py-16 text-center text-muted-foreground">No messages yet. Say hello to the team.</p>}
        {shown.map((m) => {
          const u = byId[m.user_id];
          const mine = m.user_id === p.myId;
          const mentionsMe = m.mentions.includes(p.myId);
          const act = m.activity_id ? actById[m.activity_id] : undefined;
          return (
            <div key={m.id} className={`group flex gap-3 rounded-lg p-2 ${mentionsMe ? "bg-warning/15 ring-1 ring-warning/40" : ""}`}>
              <span className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-primary-foreground" style={{ background: u?.color ?? "#78716c" }}>
                {(u?.name ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <strong className="text-sm font-semibold">{u?.name ?? "Former member"}</strong>
                  <time className="text-[11px] text-muted-foreground">{new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                  {mine && (
                    <button onClick={() => p.remove(m.id)} className="ml-auto opacity-0 group-hover:opacity-100" aria-label="Delete message"><Trash2 className="size-3.5 text-muted-foreground" /></button>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {m.body.split(/(\[task: [^\]]+\])/g).map((seg, i) => {
                    const t = seg.match(/^\[task: ([^\]]+)\]$/);
                    return t ? (
                      <button key={i} onClick={p.onOpenWb} className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-1.5 text-accent-foreground hover:bg-accent/20">
                        <PenTool className="size-3" /> {t[1]}
                      </button>
                    ) : <span key={i}>{renderBody(seg, p.members, p.myId)}</span>;
                  })}
                </p>
                {m.activity_id && (
                  act ? <ChangeCard a={act} nodes={p.nodes} theme={p.theme} onJump={() => p.onJump(act)} />
                    : <p className="mt-1 text-xs text-muted-foreground">Attached change is older than the loaded history.</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t px-6 py-4">
        {p.attach && (
          <div className="mb-2 flex items-center gap-2 rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm">
            <GitCommitHorizontal className="size-4 text-primary" />
            <span className="min-w-0 flex-1 truncate"><strong>{p.attach.actor_name}</strong> {p.attach.action} {p.attach.target}</span>
            <button onClick={() => p.setAttach(null)} aria-label="Remove attached change"><X className="size-4" /></button>
          </div>
        )}
        <div className="relative rounded-xl border bg-card focus-within:ring-1 focus-within:ring-ring">
          {candidates.length > 0 && (
            <ul className="absolute bottom-full left-2 mb-1 w-56 overflow-hidden rounded-md border bg-popover shadow-lift">
              {candidates.map((m, i) => (
                <li key={m.id}>
                  <button onMouseDown={(e) => { e.preventDefault(); pick(m); }} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === pickIdx ? "bg-secondary" : ""}`}>
                    <span className="size-3 rounded-full" style={{ background: m.color }} /> {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={taRef}
            value={text}
            rows={2}
            placeholder="Write a message… (@ to mention, Enter to send)"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (candidates.length) {
                if (e.key === "ArrowDown") { e.preventDefault(); setPickIdx((i) => (i + 1) % candidates.length); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setPickIdx((i) => (i - 1 + candidates.length) % candidates.length); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(candidates[pickIdx]!); return; }
                if (e.key === "Escape") { setMentionQ(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            className="block w-full resize-none bg-transparent px-4 pt-3 text-sm outline-none"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <Button size="sm" variant="ghost" onClick={() => { onChange(text + (text.endsWith(" ") || !text ? "@" : " @")); taRef.current?.focus(); }}><AtSign className="size-4" /> Mention</Button>
            <Popover>
              <PopoverTrigger asChild><Button size="sm" variant="ghost"><GitCommitHorizontal className="size-4" /> Attach change</Button></PopoverTrigger>
              <PopoverContent className="max-h-80 w-80 overflow-y-auto p-1" align="start">
                {myChanges.length === 0 && <p className="p-3 text-sm text-muted-foreground">No changes yet.</p>}
                {myChanges.map((a) => (
                  <button key={a.id} onClick={() => p.setAttach(a)} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-secondary">
                    <strong className="font-medium">{a.actor_name}</strong> <span className="text-muted-foreground">{a.action}</span> {a.target}
                    <span className="block text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleTimeString()}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild><Button size="sm" variant="ghost"><PenTool className="size-4" /> Whiteboard task</Button></PopoverTrigger>
              <PopoverContent className="max-h-80 w-80 overflow-y-auto p-1" align="start">
                <p className="px-2 py-1 text-[11px] text-muted-foreground">Point the team at a task from the whiteboard plan.</p>
                {p.wbItems.length === 0 && <p className="p-3 text-sm text-muted-foreground">No whiteboard notes with text yet.</p>}
                {p.wbItems.map((w) => (
                  <button key={w.id} onClick={() => insert(`[task: ${w.text.replace(/[\[\]\n]/g, " ").slice(0, 80)}]`)} className="block w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-secondary">{w.text}</button>
                ))}
              </PopoverContent>
            </Popover>
            <Button size="sm" className="ml-auto" onClick={submit} disabled={!text.trim() && !p.attach}><Send className="size-4" /> Send</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangeCard({ a, nodes, theme, onJump }: { a: Activity; nodes: Record<string, Props>; theme: Theme; onJump: () => void }) {
  return (
    <details className="mt-2 rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <GitCommitHorizontal className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate"><strong>{a.actor_name}</strong> {a.action} {a.target}</span>
        <button onClick={(e) => { e.preventDefault(); onJump(); }} className="flex items-center gap-1 text-xs text-primary hover:underline"><Crosshair className="size-3" /> Show</button>
      </summary>
      <div className="mt-2"><ActivityPreview a={a} props={a.node_id ? nodes[a.node_id] : undefined} theme={theme} /></div>
    </details>
  );
}

function renderBody(body: string, members: Member[], myId: string) {
  const names = members.map((m) => ({ tag: `@${m.name.replace(/\s+/g, "_")}`, me: m.id === myId }));
  if (!names.length) return body;
  const re = new RegExp(`(${names.map((n) => n.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return body.split(re).map((part, i) => {
    const n = names.find((x) => x.tag === part);
    return n ? <span key={i} className={`rounded px-1 font-medium ${n.me ? "bg-warning/40" : "bg-primary/15 text-primary"}`}>{part}</span> : part;
  });
}
