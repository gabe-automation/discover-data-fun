import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Download, Lock, Monitor, Smartphone, Tablet, Trash2, ArrowUpToLine, ArrowDownToLine, Plus, FileText, PenTool, MessagesSquare,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, Pin, PinOff, Unlock, Grid3x3, MessageSquarePlus, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Canvas } from "@/components/editor/Canvas";
import { CollabField } from "@/components/editor/CollabField";
import { Whiteboard } from "@/components/editor/Whiteboard";
import { ChatPanel, useChat, type Member } from "@/components/editor/Chat";
import { ActivityPreview } from "@/components/editor/ActivityPreview";
import { BLOCKS, BREAKPOINTS, DEFAULT_THEME, type BlockType, type Breakpoint, type Theme } from "@/lib/blocks";
import { generateExport, toView, type Geo, type NodeView } from "@/lib/model";
import { keyBetween, val } from "@/lib/crdt";
import { useRoom, type Activity, type Me } from "@/lib/useRoom";
import { useTexts, type TextStore } from "@/lib/useTexts";

export const Route = createFileRoute("/_authenticated/p/$projectId")({
  head: () => ({
    meta: [
      { title: "Editor — WebCraft" },
      { name: "description", content: "Edit your website live with your team in WebCraft." },
      { property: "og:title", content: "Editor — WebCraft" },
      { property: "og:description", content: "Edit your website live with your team in WebCraft." },
    ],
  }),
  component: EditorPage,
});

type PageRow = { id: string; kind: "canvas" | "whiteboard"; title: string; sort: string };

function EditorPage() {
  const { projectId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();

  const { data: info } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const [p, m, prof] = await Promise.all([
        supabase.from("projects").select("id, name, theme, owner_id").eq("id", projectId).maybeSingle(),
        supabase.from("project_members").select("user_id, role").eq("project_id", projectId),
        supabase.from("profiles").select("id, display_name, color"),
      ]);
      return { project: p.data, members: m.data ?? [], profiles: prof.data ?? [] };
    },
  });

  const myProfile = info?.profiles.find((x) => x.id === user.id);
  const me = useMemo<Me | null>(
    () => (myProfile ? { id: user.id, name: myProfile.display_name, color: myProfile.color } : null),
    [user.id, myProfile],
  );
  const myRole = info?.members.find((m) => m.user_id === user.id)?.role;
  const readOnly = myRole === "viewer";
  const isOwner = myRole === "owner";
  const room = useRoom(projectId, me);
  const texts = useTexts(projectId, !!myRole && !readOnly, !!me);
  const chat = useChat(projectId, user.id);
  const members: Member[] = useMemo(
    () => (info?.members ?? []).map((m) => {
      const pr = info?.profiles.find((p) => p.id === m.user_id);
      return { user_id: m.user_id, name: pr?.display_name ?? "Member", color: pr?.color ?? "#78716c" };
    }),
    [info],
  );

  // pages
  const [pages, setPages] = useState<PageRow[]>([]);
  useEffect(() => {
    supabase.from("pages").select("id, kind, title, sort").eq("project_id", projectId).then(({ data }) => setPages((data ?? []) as PageRow[]));
    const ch = supabase
      .channel(`pages:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pages", filter: `project_id=eq.${projectId}` }, (p) => {
        if (p.eventType === "DELETE") setPages((x) => x.filter((y) => y.id !== (p.old as PageRow).id));
        else setPages((x) => [...x.filter((y) => y.id !== (p.new as PageRow).id), p.new as PageRow]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId]);
  const allPages: PageRow[] = useMemo(() => {
    const sorted = [...pages].sort((a, b) => (a.sort < b.sort ? -1 : 1));
    return [
      { id: "main", kind: "canvas", title: "Home", sort: "" },
      ...sorted.filter((p) => p.kind === "canvas"),
      { id: "board", kind: "whiteboard", title: "Whiteboard", sort: "" },
      ...sorted.filter((p) => p.kind === "whiteboard"),
    ];
  }, [pages]);
  const [pageId, setPageId] = useState<string>("main");
  const page = pageId === "chat" ? null : allPages.find((p) => p.id === pageId) ?? allPages[0]!;

  async function addPage(kind: "canvas" | "whiteboard") {
    const last = pages.reduce<string | null>((m, p) => (!m || p.sort > m ? p.sort : m), null);
    const title = kind === "canvas" ? `Page ${allPages.filter((p) => p.kind === "canvas").length + 1}` : `Board ${allPages.filter((p) => p.kind === "whiteboard").length + 1}`;
    const { data, error } = await supabase.from("pages").insert({ project_id: projectId, kind, title, sort: keyBetween(last, null) }).select("id, kind, title, sort").single();
    if (error || !data) { toast.error("Couldn't add page"); return; }
    setPages((x) => [...x.filter((y) => y.id !== data.id), data as PageRow]);
    setPageId(data.id);
  }
  async function renamePage(p: PageRow) {
    if (readOnly || p.id === "main" || p.id === "board") return;
    const t = window.prompt("Rename page", p.title)?.trim();
    if (t) await supabase.from("pages").update({ title: t }).eq("id", p.id);
  }
  async function deletePage(p: PageRow) {
    if (!window.confirm(`Delete “${p.title}”? Its content will be hidden.`)) return;
    await supabase.from("pages").delete().eq("id", p.id);
    setPageId("main");
  }

  const [bp, setBp] = useState<Breakpoint>("desktop");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [grid, setGrid] = useState(0);
  const held = useRef(new Map<string, string>());
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  useEffect(() => {
    if (info?.project?.theme) setTheme({ ...DEFAULT_THEME, ...(info.project.theme as Partial<Theme>) });
  }, [info?.project?.theme]);

  const allViews = useMemo(() => {
    const out: NodeView[] = [];
    for (const [id, p] of Object.entries(room.nodes)) {
      const v = toView(id, p, texts.plain);
      if (v) out.push(v);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.nodes, texts.version]);
  const canvasPage = page?.kind === "canvas" ? page.id : "main";
  const views = useMemo(() => allViews.filter((v) => v.page === canvasPage), [allViews, canvasPage]);
  const selViews = views.filter((v) => selected.includes(v.id));
  const sel = selViews.length === 1 ? selViews[0]! : null;
  const labelOf = (v: NodeView) => `${BLOCKS[v.type].name}${v.text ? ` “${v.text.slice(0, 24)}”` : ""}`;
  const lockedByOther = (id: string) => { const l = room.leases[id]; return !!l && l.holder_session !== room.session; };

  // lease heartbeat + release on leave
  useEffect(() => {
    const t = setInterval(() => { for (const [id, label] of held.current) room.acquire(id, label, true); }, 5000);
    const onLeave = () => { for (const [id, label] of held.current) room.release(id, label); };
    window.addEventListener("beforeunload", onLeave);
    return () => { clearInterval(t); window.removeEventListener("beforeunload", onLeave); onLeave(); };
  }, [room.acquire, room.release]);

  // idle: release locks after 60s without interaction
  useEffect(() => {
    let last = Date.now();
    const poke = () => { last = Date.now(); };
    window.addEventListener("pointermove", poke);
    window.addEventListener("keydown", poke);
    const t = setInterval(() => { if (Date.now() - last > 60000 && held.current.size) { select([]); room.setStatus("idle"); } }, 5000);
    return () => { window.removeEventListener("pointermove", poke); window.removeEventListener("keydown", poke); clearInterval(t); };
  });

  async function select(ids: string[]) {
    setSelected(ids);
    if (editing && !ids.includes(editing)) setEditing(null);
    room.setStatus(ids.length ? "editing" : "watching");
    for (const [id, label] of Array.from(held.current)) {
      if (!ids.includes(id)) { held.current.delete(id); room.release(id, label); }
    }
    if (readOnly) return;
    const blocked: string[] = [];
    await Promise.all(ids.filter((id) => !held.current.has(id)).map(async (id) => {
      const v = allViews.find((x) => x.id === id);
      if (!v) return;
      const label = labelOf(v);
      if (await room.acquire(id, label)) held.current.set(id, label);
      else blocked.push(room.leases[id]?.holder_name ?? "a teammate");
    }));
    if (blocked.length) toast.info(`Locked by ${Array.from(new Set(blocked)).join(", ")} — you can view it but not move it.`);
  }

  async function addBlock(type: BlockType, at?: { x: number; y: number }) {
    const def = BLOCKS[type];
    const id = crypto.randomUUID();
    const maxOrder = views.reduce<string | null>((m, v) => (!m || v.order > m ? v.order : m), null);
    const pageW = BREAKPOINTS.desktop.width;
    const w = Math.min(def.w, pageW);
    const lowest = views.reduce((m, v) => Math.max(m, v.geo.desktop.y + v.geo.desktop.h), 0);
    const x = at && bp === "desktop" ? Math.round(at.x - w / 2) : Math.round((pageW - w) / 2);
    const y = at && bp === "desktop" ? Math.round(at.y - def.h / 2) : lowest + 32;
    await room.op(id, {
      type, parent: null, page: canvasPage, order: keyBetween(maxOrder, null), deleted: false,
      "x@desktop": Math.max(0, Math.min(pageW - w, x)), "y@desktop": Math.max(0, y), "w@desktop": w, "h@desktop": def.h,
    }, "created", def.name);
  }

  function commitMany(items: { id: string; g: Geo }[], kind: "moved" | "resized") {
    for (const { id, g } of items) {
      const v = allViews.find((x) => x.id === id);
      if (v) room.op(id, { [`x@${bp}`]: g.x, [`y@${bp}`]: g.y, [`w@${bp}`]: g.w, [`h@${bp}`]: g.h }, kind, labelOf(v));
    }
  }

  function align(mode: "l" | "c" | "r" | "t" | "m" | "b" | "dh" | "dv") {
    const list = selViews.filter((v) => !v.pinned && !lockedByOther(v.id));
    if (list.length < 2) return;
    const gs = list.map((v) => ({ v, g: v.geo[bp] }));
    const minX = Math.min(...gs.map((x) => x.g.x)), maxX = Math.max(...gs.map((x) => x.g.x + x.g.w));
    const minY = Math.min(...gs.map((x) => x.g.y)), maxY = Math.max(...gs.map((x) => x.g.y + x.g.h));
    const out: { id: string; g: Geo }[] = [];
    if (mode === "dh" || mode === "dv") {
      const h = mode === "dh";
      const s = [...gs].sort((a, b) => (h ? a.g.x - b.g.x : a.g.y - b.g.y));
      const total = s.reduce((t, x) => t + (h ? x.g.w : x.g.h), 0);
      const gap = ((h ? maxX - minX : maxY - minY) - total) / (s.length - 1);
      let cur = h ? minX : minY;
      for (const x of s) { out.push({ id: x.v.id, g: h ? { ...x.g, x: Math.round(cur) } : { ...x.g, y: Math.round(cur) } }); cur += (h ? x.g.w : x.g.h) + gap; }
    } else {
      for (const { v, g } of gs) {
        const n = { ...g };
        if (mode === "l") n.x = minX; if (mode === "r") n.x = maxX - g.w; if (mode === "c") n.x = Math.round((minX + maxX) / 2 - g.w / 2);
        if (mode === "t") n.y = minY; if (mode === "b") n.y = maxY - g.h; if (mode === "m") n.y = Math.round((minY + maxY) / 2 - g.h / 2);
        out.push({ id: v.id, g: n });
      }
    }
    commitMany(out, "moved");
  }

  function reorder(dir: "front" | "back" | "forward" | "backward") {
    const sorted = [...views].sort((a, b) => (a.order < b.order ? -1 : 1));
    for (const v of selViews) {
      if (lockedByOther(v.id)) continue;
      const i = sorted.findIndex((x) => x.id === v.id);
      let key: string;
      if (dir === "front") key = keyBetween(sorted[sorted.length - 1]!.order, null);
      else if (dir === "back") key = keyBetween(null, sorted[0]!.order);
      else if (dir === "forward") { if (i >= sorted.length - 1) continue; key = keyBetween(sorted[i + 1]!.order, sorted[i + 2]?.order ?? null); }
      else { if (i <= 0) continue; key = keyBetween(sorted[i - 2]?.order ?? null, sorted[i - 1]!.order); }
      room.op(v.id, { order: key }, "reordered", labelOf(v));
    }
  }

  async function duplicate() {
    const ids: string[] = [];
    for (const v of selViews) {
      const src = room.nodes[v.id];
      if (!src) continue;
      const id = crypto.randomUUID();
      const vals: Record<string, unknown> = {};
      for (const [k, r] of Object.entries(src)) vals[k] = r.v;
      for (const b of ["desktop", "tablet", "mobile"] as Breakpoint[]) {
        if (`x@${b}` in vals) vals[`x@${b}`] = (vals[`x@${b}`] as number) + 24;
        if (`y@${b}` in vals) vals[`y@${b}`] = (vals[`y@${b}`] as number) + 24;
      }
      Object.assign(vals, { text: v.text, sub: v.sub, label: v.label, pinned: false, order: keyBetween(v.order, null) });
      await room.op(id, vals, "duplicated", labelOf(v));
      ids.push(id);
    }
    select(ids);
  }

  async function removeSelected() {
    for (const v of selViews) if (!lockedByOther(v.id)) await room.op(v.id, { deleted: true }, "deleted", labelOf(v));
    select([]);
  }

  function togglePin() {
    const pin = !selViews.every((v) => v.pinned);
    for (const v of selViews) room.op(v.id, { pinned: pin }, pin ? "pinned" : "unpinned", labelOf(v));
  }

  // keyboard shortcuts on canvas pages
  useEffect(() => {
    if (page?.kind !== "canvas") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") { select([]); return; }
      if (readOnly || !selViews.length) return;
      const step = e.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        commitMany(selViews.filter((v) => !v.pinned && !lockedByOther(v.id)).map((v) => ({ id: v.id, g: { ...v.geo[bp], x: v.geo[bp].x + d[0]!, y: Math.max(0, v.geo[bp].y + d[1]!) } })), "moved");
      } else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "]") { e.preventDefault(); reorder(e.shiftKey ? "front" : "forward"); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "[") { e.preventDefault(); reorder(e.shiftKey ? "back" : "backward"); }
      else if (e.key === "Enter" && sel) { e.preventDefault(); setEditing(sel.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function saveTheme(t: Theme) {
    setTheme(t);
    const { error } = await supabase.from("projects").update({ theme: t }).eq("id", projectId);
    if (error) toast.error("Couldn't save theme");
  }

  const exp = useMemo(() => generateExport(views, theme, info?.project?.name ?? "Site"), [views, theme, info?.project?.name]);

  // canvas scale
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = useState(1000);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [page?.kind]);
  const scale = Math.min(1, (areaW - 64) / BREAKPOINTS[bp].width);

  const [openAct, setOpenAct] = useState<number | null>(null);
  const [attachInit, setAttachInit] = useState<Activity | null>(null);
  const clearAttach = useCallback(() => setAttachInit(null), []);
  function jumpTo(a: Activity) {
    if (!a.node_id) return;
    const node = room.nodes[a.node_id];
    const pg = node ? val(node, "page", "main") : a.detail?.page ?? "main";
    const isBoard = (node ? val(node, "type", "") : a.detail?.type) === "wb";
    setPageId(pg as string);
    if (!isBoard) setTimeout(() => select([a.node_id!]), 50);
  }

  const editField = sel ? (BLOCKS[sel.type].text ? "text" : BLOCKS[sel.type].label ? "label" : null) : null;

  if (info && !info.project) {
    return (
      <div className="grid min-h-screen place-items-center text-center">
        <div>
          <h1 className="text-3xl">Project not found</h1>
          <p className="mt-2 text-muted-foreground">It may have been deleted, or you're not a member.</p>
          <Button asChild className="mt-6"><Link to="/projects">Back to projects</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Button variant="ghost" size="icon" asChild><Link to="/projects" aria-label="Back to projects"><ArrowLeft /></Link></Button>
        <span className="font-display text-lg">{info?.project?.name ?? "…"}</span>
        {readOnly && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">View only</span>}
        <div className="mx-auto flex rounded-lg border bg-background p-0.5">
          {page?.kind === "canvas" && (["desktop", "tablet", "mobile"] as Breakpoint[]).map((b) => {
            const Icon = b === "desktop" ? Monitor : b === "tablet" ? Tablet : Smartphone;
            return (
              <button key={b} onClick={() => setBp(b)} className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs ${bp === b ? "bg-secondary font-medium" : "text-muted-foreground"}`}>
                <Icon className="size-3.5" /> {BREAKPOINTS[b].label}
              </button>
            );
          })}
        </div>
        <div className="flex -space-x-2">
          {room.peers.map((p) => (
            <span
              key={p.session}
              title={`${p.name}${p.session === room.session ? " (you)" : ""} · ${p.status}`}
              className="relative grid size-8 place-items-center rounded-full border-2 border-card text-[11px] font-semibold text-primary-foreground"
              style={{ background: p.color }}
            >
              {initials(p.name)}
              <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card ${p.status === "editing" ? "bg-success" : p.status === "idle" ? "bg-muted-foreground" : "bg-warning"}`} />
            </span>
          ))}
        </div>
      </header>

      {/* Page tabs */}
      <nav className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b bg-sidebar px-2" aria-label="Pages">
        {allPages.map((p) => {
          const Icon = p.kind === "canvas" ? FileText : PenTool;
          const active = pageId === p.id;
          const custom = p.id !== "main" && p.id !== "board";
          return (
            <div key={p.id} className={`group flex shrink-0 items-center rounded-md text-sm ${active ? "bg-card shadow-sm" : "hover:bg-secondary"}`}>
              <button onClick={() => { setPageId(p.id); select([]); }} onDoubleClick={() => renamePage(p)} className="flex items-center gap-1.5 px-2.5 py-1" title={custom && !readOnly ? "Double-click to rename" : undefined}>
                <Icon className="size-3.5" /> {p.title}
              </button>
              {custom && !readOnly && (
                <button aria-label={`Delete ${p.title}`} onClick={() => deletePage(p)} className="mr-1 hidden rounded p-0.5 hover:bg-destructive/10 group-hover:block"><X className="size-3" /></button>
              )}
            </div>
          );
        })}
        <button onClick={() => { setPageId("chat"); chat.markRead(); }} className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm ${pageId === "chat" ? "bg-card shadow-sm" : "hover:bg-secondary"}`}>
          <MessagesSquare className="size-3.5" /> Team chat
          {pageId !== "chat" && chat.unread > 0 && (
            <span className={`grid min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-primary-foreground ${chat.mentions ? "bg-destructive" : "bg-primary"}`}>{chat.mentions ? `@${chat.mentions}` : chat.unread}</span>
          )}
        </button>
        {!readOnly && (
          <div className="ml-auto flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => addPage("canvas")}><Plus className="size-3.5" /> Blank page</Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => addPage("whiteboard")}><Plus className="size-3.5" /> Whiteboard</Button>
          </div>
        )}
      </nav>

      {pageId === "chat" ? (
        <div className="min-h-0 flex-1">
          <ChatPanel projectId={projectId} userId={user.id} members={members} activity={room.activity} chat={chat} attachInit={attachInit} onClearAttachInit={clearAttach} onJump={jumpTo} />
        </div>
      ) : page?.kind === "whiteboard" ? (
        <div className="min-h-0 flex-1">
          <Whiteboard
            key={page.id}
            pageId={page.id}
            userId={user.id}
            nodes={room.nodes}
            texts={texts}
            readOnly={readOnly}
            cursors={room.cursors}
            mySession={room.session}
            op={room.op}
            onCursor={(x, y) => room.sendCursor(x, y, page.id)}
            onTyping={room.sendCaret}
          />
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        {/* Block library */}
        <aside className="w-52 shrink-0 overflow-y-auto border-r bg-sidebar p-3">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Blocks</p>
          <div className="grid grid-cols-1 gap-1">
            {(Object.keys(BLOCKS) as BlockType[]).map((t) => (
              <button
                key={t}
                disabled={readOnly}
                draggable={!readOnly}
                onDragStart={(e) => e.dataTransfer.setData("application/x-webcraft-block", t)}
                onClick={() => addBlock(t)}
                className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary disabled:opacity-50"
              >
                {BLOCKS[t].name}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-1 px-1 text-[11px] leading-relaxed text-muted-foreground">
            <p>Click to add, or drag onto the page.</p>
            <p><b>Shift-click</b> or drag a box to select several. <b>Double-click</b> to type on the page. <b>Arrows</b> nudge (Shift = 10px), <b>Alt</b> while dragging turns snapping off.</p>
          </div>
        </aside>

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-card px-2 text-xs">
            <button onClick={() => setGrid(grid ? 0 : 20)} className={`flex items-center gap-1 rounded px-2 py-1 ${grid ? "bg-secondary font-medium" : "hover:bg-secondary"}`}><Grid3x3 className="size-3.5" /> Grid snap</button>
            {grid > 0 && (
              <select value={grid} onChange={(e) => setGrid(Number(e.target.value))} className="h-7 rounded border bg-background px-1" aria-label="Grid size">
                {[8, 10, 20, 40].map((g) => <option key={g} value={g}>{g}px</option>)}
              </select>
            )}
            {!readOnly && selViews.length > 0 && (
              <>
                <span className="mx-1 h-5 w-px bg-border" />
                <span className="px-1 text-muted-foreground">{selViews.length} selected</span>
                <ToolBtn label="Duplicate (Ctrl+D)" onClick={duplicate}><Copy /></ToolBtn>
                <ToolBtn label="Bring to front" onClick={() => reorder("front")}><ArrowUpToLine /></ToolBtn>
                <ToolBtn label="Send to back" onClick={() => reorder("back")}><ArrowDownToLine /></ToolBtn>
                <ToolBtn label={selViews.every((v) => v.pinned) ? "Unpin position" : "Pin position"} onClick={togglePin}>{selViews.every((v) => v.pinned) ? <PinOff /> : <Pin />}</ToolBtn>
                {selViews.length >= 2 && (
                  <>
                    <span className="mx-1 h-5 w-px bg-border" />
                    <ToolBtn label="Align left" onClick={() => align("l")}><AlignStartVertical /></ToolBtn>
                    <ToolBtn label="Align centers" onClick={() => align("c")}><AlignCenterVertical /></ToolBtn>
                    <ToolBtn label="Align right" onClick={() => align("r")}><AlignEndVertical /></ToolBtn>
                    <ToolBtn label="Align top" onClick={() => align("t")}><AlignStartHorizontal /></ToolBtn>
                    <ToolBtn label="Align middle" onClick={() => align("m")}><AlignCenterHorizontal /></ToolBtn>
                    <ToolBtn label="Align bottom" onClick={() => align("b")}><AlignEndHorizontal /></ToolBtn>
                    {selViews.length >= 3 && <>
                      <button className="rounded px-2 py-1 hover:bg-secondary" onClick={() => align("dh")}>Distribute ↔</button>
                      <button className="rounded px-2 py-1 hover:bg-secondary" onClick={() => align("dv")}>Distribute ↕</button>
                    </>}
                  </>
                )}
                <ToolBtn label="Delete" onClick={removeSelected}><Trash2 /></ToolBtn>
              </>
            )}
          </div>
          <div ref={areaRef} className="min-h-0 flex-1 overflow-auto bg-dotgrid p-8" onMouseLeave={() => room.setStatus(selected.length ? "editing" : "idle")}>
            {!room.loaded ? (
              <p className="text-center text-muted-foreground">Loading page…</p>
            ) : (
              <>
                {views.length === 0 && (
                  <p className="mb-4 text-center text-muted-foreground">Blank page — add a Navbar and a Hero from the left to get going.</p>
                )}
                <Canvas
                  nodes={views}
                  bp={bp}
                  theme={theme}
                  scale={scale}
                  selected={selected}
                  mySession={room.session}
                  leases={room.leases}
                  cursors={Object.fromEntries(Object.entries(room.cursors).filter(([, c]) => (c.page ?? "main") === canvasPage))}
                  carets={room.carets}
                  drags={room.drags}
                  readOnly={readOnly}
                  grid={grid}
                  showGrid={grid > 0}
                  editing={editing}
                  inlineEditor={editing && sel && editField ? (
                    <CollabField
                      doc={texts.getDoc(sel.id)}
                      field={editField}
                      initial={sel[editField]}
                      autoFocus
                      className="h-full w-full resize-none rounded bg-card/95 p-3 font-sans text-base text-foreground shadow-lift outline-2 outline-primary"
                      onTyping={() => room.sendCaret(sel.id)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
                    />
                  ) : null}
                  onSelect={select}
                  onEdit={(id) => { if (!selected.includes(id)) select([id]); setEditing(id); }}
                  onCommit={commitMany}
                  onLiveDrag={(id, g, done) => room.sendDrag({ id, bp, ...g, done })}
                  onCursor={(x, y) => room.sendCursor(x, y, canvasPage)}
                  onDropBlock={(t, x, y) => addBlock(t, { x, y })}
                />
              </>
            )}
          </div>
        </main>

        {/* Right panel */}
        <aside className="flex w-80 shrink-0 flex-col border-l bg-card">
          <Tabs defaultValue="inspect" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-2 grid grid-cols-4">
              <TabsTrigger value="inspect">Edit</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
            </TabsList>

            <TabsContent value="inspect" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {sel ? (
                <Inspector
                  key={sel.id}
                  node={sel}
                  bp={bp}
                  texts={texts}
                  lockedBy={lockedByOther(sel.id) ? room.leases[sel.id]?.holder_name : undefined}
                  isOwner={isOwner}
                  readOnly={readOnly}
                  onTyping={() => room.sendCaret(sel.id)}
                  onTextCommit={(f, before, after) => { if (!lockedByOther(sel.id)) room.op(sel.id, { [f]: after }, "edited", labelOf({ ...sel, text: before })); }}
                  onGeo={(g) => commitMany([{ id: sel.id, g }], "resized")}
                  onForceUnlock={async () => { if (await room.forceRelease(sel.id, labelOf(sel))) toast.success("Lock released"); }}
                />
              ) : selViews.length > 1 ? (
                <p className="pt-4 text-sm text-muted-foreground">{selViews.length} blocks selected. Use the toolbar above the page to align, distribute, duplicate or delete them.</p>
              ) : (
                <ThemePanel theme={theme} readOnly={readOnly} onChange={saveTheme} />
              )}
            </TabsContent>

            <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
              <p className="px-3 pb-2 text-xs text-muted-foreground">Click a change to preview it.</p>
              <ul className="space-y-1" aria-live="polite">
                {room.activity.map((a) => {
                  const blocked = a.outcome.startsWith("blocked");
                  const open = openAct === a.id;
                  return (
                    <li key={a.id} className={`rounded-md text-sm ${blocked ? "bg-destructive/10" : open ? "bg-secondary/60" : "hover:bg-secondary/40"}`}>
                      <button className="w-full px-3 py-2 text-left" onClick={() => setOpenAct(open ? null : a.id)} aria-expanded={open}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span>
                            <strong className="font-medium">{a.actor_name}</strong>{" "}
                            <span className="text-muted-foreground">{blocked ? `tried to ${a.action.replace(/ed$/, "")}` : a.action}</span>{" "}
                            {a.target}
                          </span>
                          <time className="shrink-0 text-[10px] text-muted-foreground">
                            {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </time>
                        </div>
                        {blocked && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                            <Lock className="size-3" /> Blocked{a.detail?.holder ? ` — ${a.detail.holder} is editing it` : " — view-only access"}
                          </p>
                        )}
                      </button>
                      {open && (
                        <div className="space-y-2 px-3 pb-3">
                          <ActivityPreview a={a} />
                          <div className="flex gap-2">
                            {a.node_id && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => jumpTo(a)}>Show on page</Button>}
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAttachInit(a); setPageId("chat"); }}>
                              <MessageSquarePlus className="size-3.5" /> Discuss in chat
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
                {room.activity.length === 0 && <p className="p-3 text-sm text-muted-foreground">No activity yet.</p>}
              </ul>
            </TabsContent>

            <TabsContent value="code" className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
              <CodeView exp={exp} name={`${info?.project?.name ?? "site"}${page && page.id !== "main" ? `-${page.title}` : ""}`} />
            </TabsContent>

            <TabsContent value="team" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              <TeamPanel
                projectId={projectId}
                isOwner={isOwner}
                members={(info?.members ?? []).map((m) => ({ ...m, profile: info?.profiles.find((p) => p.id === m.user_id) }))}
                onChanged={() => qc.invalidateQueries({ queryKey: ["project", projectId] })}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      )}
    </div>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} className="grid size-7 place-items-center rounded hover:bg-secondary [&_svg]:size-3.5">
      {children}
    </button>
  );
}

function initials(n: string) {
  return n.split(/\s+/).map((x) => x[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function Inspector(props: {
  node: NodeView;
  bp: Breakpoint;
  texts: TextStore;
  lockedBy?: string | undefined;
  isOwner: boolean;
  readOnly: boolean;
  onTyping: () => void;
  onTextCommit: (f: "text" | "sub" | "label", before: string, after: string) => void;
  onGeo: (g: Geo) => void;
  onForceUnlock: () => void;
}) {
  const { node } = props;
  const def = BLOCKS[node.type];
  const g = node.geo[props.bp];
  const layoutDisabled = props.readOnly || !!props.lockedBy || node.pinned;
  const startVal = useRef<Record<string, string>>({});
  const fields: { f: "text" | "sub" | "label"; label: string }[] = [];
  if (def.text) fields.push({ f: "text", label: node.type === "image" ? "Alt text / caption" : node.type === "cards" || node.type === "pricing" ? "Titles (separate with |)" : "Text" });
  if (def.sub) fields.push({ f: "sub", label: node.type === "pricing" ? "Prices (separate with |)" : node.type === "cards" ? "Descriptions (separate with |)" : "Secondary text" });
  if (def.label) fields.push({ f: "label", label: "Button label" });
  const doc = props.texts.getDoc(node.id);

  return (
    <div className="space-y-5">
      <h2 className="text-xl">{def.name}</h2>
      {props.lockedBy && (
        <div className="space-y-2 rounded-md bg-warning/15 px-3 py-2 text-sm">
          <p className="flex items-center gap-2"><Lock className="size-4" /> {props.lockedBy} has this block locked. You can type in its text together, but not move or resize it.</p>
          {props.isOwner && <Button size="sm" variant="outline" className="h-7" onClick={props.onForceUnlock}><Unlock className="size-3.5" /> Force unlock</Button>}
        </div>
      )}
      {fields.map(({ f, label }) => (
        <div key={f} className="space-y-1.5">
          <Label>{label}</Label>
          <CollabField
            doc={doc}
            field={f}
            initial={node[f]}
            disabled={props.readOnly}
            rows={f === "label" ? 1 : 3}
            onTyping={() => { if (startVal.current[f] === undefined) startVal.current[f] = node[f]; props.onTyping(); }}
            onBlur={() => {
              const before = startVal.current[f];
              delete startVal.current[f];
              const after = doc.getText(f).toString();
              if (before !== undefined && before !== after) props.onTextCommit(f, before, after);
            }}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Text merges live as teammates type, like a shared doc.</p>
      <div>
        <Label className="mb-1.5 block">Position & size · {BREAKPOINTS[props.bp].label}{node.pinned ? " · pinned" : ""}</Label>
        <div className="grid grid-cols-4 gap-2">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k} className="text-[11px] uppercase text-muted-foreground">
              {k}
              <Input
                key={g[k]}
                type="number"
                defaultValue={g[k]}
                disabled={layoutDisabled}
                className="mt-1 h-8 px-2 text-xs"
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n) && n !== g[k]) props.onGeo({ ...g, [k]: n });
                }}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Each screen size keeps its own layout.</p>
      </div>
    </div>
  );
}

function ThemePanel({ theme, readOnly, onChange }: { theme: Theme; readOnly: boolean; onChange: (t: Theme) => void }) {
  const [t, setT] = useState(theme);
  useEffect(() => setT(theme), [theme]);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl">Site theme</h2>
        <p className="text-sm text-muted-foreground">Select a block to edit it. These colors style the exported site.</p>
      </div>
      {(["primary", "accent", "surface", "ink"] as const).map((k) => (
        <label key={k} className="flex items-center justify-between gap-3 text-sm capitalize">
          {k}
          <input
            type="color"
            value={t[k]}
            disabled={readOnly}
            onChange={(e) => setT({ ...t, [k]: e.target.value })}
            onBlur={() => onChange(t)}
            className="h-8 w-14 cursor-pointer rounded border bg-transparent"
          />
        </label>
      ))}
    </div>
  );
}

function CodeView({ exp, name }: { exp: { html: string; css: string; js: string }; name: string }) {
  const files = [
    { k: "index.html", v: exp.html },
    { k: "styles.css", v: exp.css },
    { k: "script.js", v: exp.js },
  ];
  async function zip() {
    const JSZip = (await import("jszip")).default;
    const z = new JSZip();
    for (const f of files) z.file(f.k, f.v);
    const blob = await z.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "site"}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <Tabs defaultValue="index.html" className="flex h-full flex-col">
      <div className="flex items-center gap-2">
        <TabsList className="h-8">
          {files.map((f) => <TabsTrigger key={f.k} value={f.k} className="text-xs">{f.k}</TabsTrigger>)}
        </TabsList>
        <Button size="icon" variant="ghost" className="ml-auto size-8" onClick={zip} aria-label="Export as ZIP"><Download /></Button>
      </div>
      {files.map((f) => (
        <TabsContent key={f.k} value={f.k} className="relative mt-2 min-h-0 flex-1">
          <Button
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 size-7"
            onClick={() => navigator.clipboard.writeText(f.v).then(() => toast.success(`${f.k} copied`))}
            aria-label={`Copy ${f.k}`}
          >
            <Copy className="size-3.5" />
          </Button>
          <pre className="h-full overflow-auto rounded-md bg-ink p-3 font-mono text-[11px] leading-relaxed text-paper">{f.v}</pre>
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TeamPanel(props: {
  projectId: string;
  isOwner: boolean;
  members: { user_id: string; role: string; profile?: { display_name: string; color: string } | undefined }[];
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.rpc("add_member_by_email", { _project: props.projectId, _email: email, _role: role });
    if (error) toast.error(error.message);
    else if (data === "not_found") toast.error("No WebCraft account with that email yet — ask them to sign up first.");
    else {
      toast.success("Added to the project");
      setEmail("");
      props.onChanged();
    }
  }
  return (
    <div className="space-y-5">
      <h2 className="text-xl">Team</h2>
      <ul className="space-y-2">
        {props.members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 text-sm">
            <span className="grid size-7 place-items-center rounded-full text-[10px] font-semibold text-primary-foreground" style={{ background: m.profile?.color ?? "gray" }}>
              {initials(m.profile?.display_name ?? "?")}
            </span>
            <span className="flex-1">{m.profile?.display_name ?? "Member"}</span>
            <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
          </li>
        ))}
      </ul>
      {props.isOwner && (
        <form onSubmit={invite} className="space-y-2 border-t pt-4">
          <Label>Invite by email</Label>
          <Input type="email" required placeholder="teammate@studio.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="flex gap-2">
            <select value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")} className="h-9 flex-1 rounded-md border bg-background px-2 text-sm">
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button type="submit">Invite</Button>
          </div>
        </form>
      )}
    </div>
  );
}
