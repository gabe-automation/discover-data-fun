import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Download, Lock, Monitor, Smartphone, Tablet, Trash2, ArrowUpToLine, Plus, FileText, PenTool, MessagesSquare, MoreHorizontal, MessageSquarePlus, Crosshair, Layers,
  Eye, Globe, LayoutTemplate, HelpCircle, Pin, Unlock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Canvas } from "@/components/editor/Canvas";
import { Whiteboard } from "@/components/editor/Whiteboard";
import { ChatPage } from "@/components/editor/ChatPage";
import { ActivityPreview } from "@/components/editor/ActivityPreview";
import { CollabTextarea } from "@/components/editor/CollabTextarea";
import { BLOCKS, BREAKPOINTS, DEFAULT_THEME, type BlockStyle, type BlockType, type Breakpoint, type Theme } from "@/lib/blocks";
import { generateExport, toView, type Geo, type NodeView } from "@/lib/model";
import { keyBetween, val } from "@/lib/crdt";
import { useRoom, type Activity, type Me } from "@/lib/useRoom";
import { useSharedText, type SharedText } from "@/lib/sharedText";
import { useChat } from "@/lib/useChat";
import { useDragPrefs } from "@/lib/dragPrefs";
import { DragSettings } from "@/components/editor/DragSettings";
import { LockControl } from "@/components/editor/LockControl";
import type { NodeLock } from "@/lib/useRoom";
import { SITE_TEMPLATES, type SiteTemplate } from "@/lib/siteTemplates";

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

type Page = { id: string; kind: string; title: string; sort: string };
const PAGE_ICON = { canvas: FileText, whiteboard: PenTool, chat: MessagesSquare } as Record<string, typeof FileText>;

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
  const room = useRoom(projectId, me);
  const shared = useSharedText(projectId, !!myRole && !readOnly);
  const members = useMemo(
    () => (info?.members ?? []).map((m) => {
      const pr = info?.profiles.find((x) => x.id === m.user_id);
      return { id: m.user_id, name: pr?.display_name ?? "Member", color: pr?.color ?? "#78716c" };
    }),
    [info],
  );
  const isOwner = myRole === "owner";
  const [prefs, setPrefs] = useDragPrefs(projectId);
  const canOverride = (l: NodeLock) => l.locked_by === user.id || isOwner || l.allowed.includes(user.id);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Someone";

  // ---------- pages ----------
  const { data: pages = [], isFetched: pagesFetched } = useQuery({
    queryKey: ["pages", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("pages").select("id, kind, title, sort").eq("project_id", projectId).order("sort").order("created_at");
      return (data ?? []) as Page[];
    },
  });
  useEffect(() => {
    const ch = supabase.channel(`pages:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pages", filter: `project_id=eq.${projectId}` }, () => qc.invalidateQueries({ queryKey: ["pages", projectId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId, qc]);
  const seeded = useRef(false);
  useEffect(() => {
    if (!pagesFetched || pages.length || readOnly || !myRole || seeded.current) return;
    seeded.current = true;
    supabase.from("pages").insert({ project_id: projectId, kind: "canvas", title: "Home", sort: "m" }).then(() => qc.invalidateQueries({ queryKey: ["pages", projectId] }));
  }, [pagesFetched, pages.length, readOnly, myRole, projectId, qc]);
  const [pageId, setPageId] = useState<string | null>(null);
  const page = pages.find((x) => x.id === pageId) ?? pages[0] ?? null;
  const firstCanvas = pages.find((x) => x.kind === "canvas")?.id ?? null;

  async function addPage(kind: "canvas" | "whiteboard" | "chat") {
    if (kind === "chat") {
      const existing = pages.find((x) => x.kind === "chat");
      if (existing) { setPageId(existing.id); return; }
    }
    const last = pages[pages.length - 1]?.sort ?? null;
    const title = kind === "canvas" ? `Page ${pages.filter((x) => x.kind === "canvas").length + 1}` : kind === "whiteboard" ? "Whiteboard" : "Team chat";
    const { data, error } = await supabase.from("pages").insert({ project_id: projectId, kind, title, sort: keyBetween(last, null) }).select("id").single();
    if (error) { toast.error("Couldn't add page"); return; }
    await qc.invalidateQueries({ queryKey: ["pages", projectId] });
    setPageId(data.id);
  }
  async function renamePage(pg: Page) {
    const t = window.prompt("Page name", pg.title)?.trim();
    if (!t || t === pg.title) return;
    await supabase.from("pages").update({ title: t }).eq("id", pg.id);
    qc.invalidateQueries({ queryKey: ["pages", projectId] });
  }
  async function deletePage(pg: Page) {
    if (pages.length <= 1 || !window.confirm(`Delete “${pg.title}”?`)) return;
    await supabase.from("pages").delete().eq("id", pg.id);
    if (page?.id === pg.id) setPageId(null);
    qc.invalidateQueries({ queryKey: ["pages", projectId] });
  }

  const chat = useChat(projectId, user.id, page?.kind === "chat", nameOf);
  const [attach, setAttach] = useState<Activity | null>(null);
  const [chatDraft, setChatDraft] = useState("");

  // ---------- canvas ----------
  const [bp, setBp] = useState<Breakpoint>("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const heldRef = useRef<{ id: string; label: string } | null>(null);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  useEffect(() => {
    if (info?.project?.theme) setTheme({ ...DEFAULT_THEME, ...(info.project.theme as Partial<Theme>) });
  }, [info?.project?.theme]);

  const views = useMemo(() => {
    const out: NodeView[] = [];
    if (!page || page.kind !== "canvas") return out;
    for (const [id, p] of Object.entries(room.nodes)) {
      const v = toView(id, p);
      if (!v) continue;
      if ((v.page ?? firstCanvas) !== page.id) continue;
      for (const f of ["text", "sub", "label"] as const) if (shared.has(`${id}:${f}`)) v[f] = shared.get(`${id}:${f}`);
      out.push(v);
    }
    return out;
  }, [room.nodes, page, firstCanvas, shared.ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = views.find((v) => v.id === selected) ?? null;
  const labelOf = (v: NodeView) => `${BLOCKS[v.type].name}${v.text ? ` “${v.text.slice(0, 24)}”` : ""}`;

  useEffect(() => {
    const t = setInterval(() => {
      const h = heldRef.current;
      if (h) room.acquire(h.id, h.label, true);
    }, 5000);
    const onLeave = () => {
      const h = heldRef.current;
      if (h) room.release(h.id, h.label);
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", onLeave);
      onLeave();
    };
  }, [room.acquire, room.release]);

  async function select(id: string | null) {
    if (id === selected) return;
    const prev = heldRef.current;
    heldRef.current = null;
    if (prev) room.release(prev.id, prev.label);
    setSelected(id);
    room.setStatus(id ? "editing" : "watching");
    if (!id || readOnly || !prefs.lockOnSelect) return;
    const v = views.find((x) => x.id === id);
    if (!v) return;
    const label = labelOf(v);
    const ok = await room.acquire(id, label);
    if (ok) heldRef.current = { id, label };
    else toast.info(`${label} is locked by ${room.leases[id]?.holder_name ?? "a teammate"}. You can still edit anything else.`);
  }
  useEffect(() => { select(null); }, [page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addBlock(type: BlockType, at?: { x: number; y: number }, copy?: NodeView) {
    if (!page) return;
    const def = BLOCKS[type];
    const id = crypto.randomUUID();
    const maxOrder = views.reduce<string | null>((m, v) => (!m || v.order > m ? v.order : m), null);
    const pageW = BREAKPOINTS.desktop.width;
    const w = copy ? copy.geo.desktop.w : Math.min(def.w, pageW);
    const h = copy ? copy.geo.desktop.h : def.h;
    const lowest = views.reduce((m, v) => Math.max(m, v.geo.desktop.y + v.geo.desktop.h), 0);
    const G = prefs.grid;
    const useCursor = at && bp === "desktop" && prefs.drop === "cursor";
    const sg = (v: number) => (G ? Math.round(v / G) * G : v);
    const x = copy ? copy.geo.desktop.x + 24 : useCursor ? sg(Math.round(at.x - w / 2)) : prefs.drop === "stack" ? 0 : Math.round((pageW - w) / 2);
    const y = copy ? copy.geo.desktop.y + 24 : useCursor ? sg(Math.round(at.y - h / 2)) : sg(lowest + 32);
    const extra: Record<string, unknown> = {};
    if (copy) {
      extra["text"] = copy.text; extra["sub"] = copy.sub; extra["label"] = copy.label;
      for (const [k, v] of Object.entries(copy.style)) extra[`s.${k}`] = v;
    }
    await room.op(
      id,
      {
        type, parent: null, page: page.id, order: keyBetween(maxOrder, null), deleted: false,
        "x@desktop": Math.max(0, Math.min(pageW - w, x)), "y@desktop": Math.max(0, y), "w@desktop": w, "h@desktop": h, ...extra,
      },
      copy ? "duplicated" : "created",
      def.name,
    );
    if (copy) select(id);
  }

  function commitGeo(id: string, g: Geo, kind: "moved" | "resized") {
    const v = views.find((x) => x.id === id);
    if (!v) return;
    room.op(id, { [`x@${bp}`]: g.x, [`y@${bp}`]: g.y, [`w@${bp}`]: g.w, [`h@${bp}`]: g.h }, kind, labelOf(v));
  }

  const selPin = sel && room.locks[sel.id] && !canOverride(room.locks[sel.id]!) ? room.locks[sel.id]! : null;
  const selLockedBy = sel && room.leases[sel.id] && room.leases[sel.id]!.holder_session !== room.session ? room.leases[sel.id]!.holder_name
    : selPin?.mode === "full" ? `${selPin.locked_by_name} (locked)` : undefined;

  // keyboard: nudge, duplicate, delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!sel || readOnly || selLockedBy || page?.kind !== "canvas" || t.tagName === "TEXTAREA" || t.tagName === "INPUT") return;
      if (selPin) return;
      const step = e.shiftKey ? prefs.nudge * 10 : prefs.nudge;
      const g = sel.geo[bp];
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (d[e.key]) { e.preventDefault(); commitGeo(sel.id, { ...g, x: g.x + d[e.key]![0], y: Math.max(0, g.y + d[e.key]![1]) }, "moved"); }
      else if ((e.key === "Delete" || e.key === "Backspace")) { room.op(sel.id, { deleted: true }, "deleted", labelOf(sel)); select(null); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "d") { e.preventDefault(); addBlock(sel.type, undefined, sel); }
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
  const singleHtml = () => exp.html
    .replace('<link rel="stylesheet" href="styles.css">', () => `<style>${exp.css}</style>`)
    .replace('<script src="script.js"></script>', () => `<script>${exp.js}</script>`);
  const { data: published } = useQuery({
    queryKey: ["published", projectId],
    queryFn: async () => (await supabase.from("published_sites").select("updated_at").eq("project_id", projectId).maybeSingle()).data,
  });
  const siteUrl = typeof window !== "undefined" ? `${window.location.origin}/site/${projectId}` : "";
  function previewSite() {
    if (page?.kind !== "canvas") { toast.info("Open a design page to preview it."); return; }
    const url = URL.createObjectURL(new Blob([singleHtml()], { type: "text/html" }));
    window.open(url, "_blank");
  }
  async function publishSite() {
    if (page?.kind !== "canvas") { toast.info("Open the design page you want to publish."); return; }
    if (!views.length) { toast.info("This page is empty — add some blocks first."); return; }
    const { error } = await supabase.from("published_sites").upsert({ project_id: projectId, title: info?.project?.name ?? "", html: singleHtml(), published_by: user.id, updated_at: new Date().toISOString() });
    if (error) { toast.error("Couldn't publish"); return; }
    qc.invalidateQueries({ queryKey: ["published", projectId] });
    toast.success("Site published", { action: { label: "Open", onClick: () => window.open(siteUrl, "_blank") } });
  }
  async function unpublish() {
    await supabase.from("published_sites").delete().eq("project_id", projectId);
    qc.invalidateQueries({ queryKey: ["published", projectId] });
    toast.success("Site unpublished");
  }
  async function applyTemplate(t: SiteTemplate) {
    if (!page || page.kind !== "canvas") return;
    if (views.length && !window.confirm(`Add the “${t.name}” blocks below what's already on this page?`)) return;
    const base = views.reduce((m, v) => Math.max(m, v.geo.desktop.y + v.geo.desktop.h), 0) + (views.length ? 48 : 0);
    let order: string | null = views.reduce<string | null>((m, v) => (!m || v.order > m ? v.order : m), null);
    const pageW = BREAKPOINTS.desktop.width;
    for (const b of t.blocks) {
      const def = BLOCKS[b.type];
      const w = Math.min(b.w ?? def.w, pageW), h = b.h ?? def.h;
      order = keyBetween(order, null);
      await room.op(crypto.randomUUID(), {
        type: b.type, parent: null, page: page.id, order, deleted: false,
        "x@desktop": b.x ?? Math.round((pageW - w) / 2), "y@desktop": base + b.y, "w@desktop": w, "h@desktop": h,
        text: b.text ?? def.text, sub: b.sub ?? def.sub, label: b.label ?? def.label,
      }, "created", `${def.name} (${t.name} template)`);
    }
    toast.success(`${t.name} template added`);
  }
  function openChat(prefill?: string) {
    if (prefill) setChatDraft(prefill);
    const c = pages.find((x) => x.kind === "chat");
    if (c) setPageId(c.id); else addPage("chat");
  }
  const wbItems = useMemo(() => Object.entries(room.nodes).flatMap(([id, pr]) => {
    if (val<string>(pr, "kind", "") !== "wb" || val(pr, "deleted", false)) return [];
    const text = (shared.has(`${id}:text`) ? shared.get(`${id}:text`) : val<string>(pr, "text", "")).trim();
    return text ? [{ id, text }] : [];
  }), [room.nodes, shared.ver]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function jumpTo(a: Activity) {
    if (!a.node_id) return;
    const pr = room.nodes[a.node_id];
    if (!pr) { toast.info("That item no longer exists."); return; }
    const target = val<string | null>(pr, "page", null) ?? firstCanvas;
    if (target) setPageId(target);
    if (val<string>(pr, "kind", "") !== "wb") setTimeout(() => select(a.node_id), 50);
  }

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

  const onPage = (s: string) => room.peers.filter((p) => p.session !== room.session && (room.cursors[p.session]?.page ?? null) === s);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3">
        <Button variant="ghost" size="icon" asChild><Link to="/projects" aria-label="Back to projects"><ArrowLeft /></Link></Button>
        <span className="font-display text-lg">{info?.project?.name ?? "…"}</span>
        {readOnly && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">View only</span>}
        {page?.kind === "canvas" ? (
          <div className="mx-auto flex rounded-lg border bg-background p-0.5">
            {(["desktop", "tablet", "mobile"] as Breakpoint[]).map((b) => {
              const Icon = b === "desktop" ? Monitor : b === "tablet" ? Tablet : Smartphone;
              return (
                <button key={b} onClick={() => setBp(b)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs ${bp === b ? "bg-secondary font-medium" : "text-muted-foreground"}`}>
                  <Icon className="size-3.5" /> {BREAKPOINTS[b].label}
                </button>
              );
            })}
          </div>
        ) : <span className="mx-auto text-sm text-muted-foreground">{page?.title}</span>}
        <div className="flex items-center gap-1">
          <Button size="sm" variant={page?.kind === "whiteboard" ? "secondary" : "ghost"} onClick={() => { const w = pages.find((x) => x.kind === "whiteboard"); if (w) setPageId(w.id); else addPage("whiteboard"); }}><PenTool className="size-4" /> Whiteboard</Button>
          <Button size="sm" variant={page?.kind === "chat" ? "secondary" : "ghost"} onClick={() => openChat()} className="relative">
            <MessagesSquare className="size-4" /> Chat
            {chat.unread > 0 && page?.kind !== "chat" && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{chat.unread}</span>}
          </Button>
        </div>
        {page?.kind === "canvas" && !readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><LayoutTemplate className="size-4" /> Templates</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              {SITE_TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => applyTemplate(t)} className="flex-col items-start">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">{t.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {page && page.kind !== "chat" && !readOnly && <DragSettings prefs={prefs} onChange={setPrefs} />}
        <Button size="sm" variant="outline" onClick={previewSite}><Eye className="size-4" /> Preview</Button>
        <Popover>
          <PopoverTrigger asChild><Button size="sm" disabled={readOnly}><Globe className="size-4" /> Publish</Button></PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3 text-sm">
            <p className="font-medium">Publish this page as a public website</p>
            {published ? (
              <>
                <p className="text-muted-foreground">Live since {new Date(published.updated_at).toLocaleString()}.</p>
                <a href={siteUrl} target="_blank" rel="noreferrer" className="block truncate text-primary underline">{siteUrl}</a>
                <div className="flex gap-2">
                  <Button size="sm" onClick={publishSite}>Update site</Button>
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(siteUrl); toast.success("Link copied"); }}>Copy link</Button>
                  <Button size="sm" variant="ghost" onClick={unpublish}>Unpublish</Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Anyone with the link will be able to see the current design page.</p>
                <Button size="sm" onClick={publishSite}>Publish now</Button>
              </>
            )}
          </PopoverContent>
        </Popover>
        <div className="flex -space-x-2">
          {room.peers.map((p) => (
            <span key={p.session} title={`${p.name}${p.session === room.session ? " (you)" : ""} · ${p.status}`}
              className="relative grid size-8 place-items-center rounded-full border-2 border-card text-[11px] font-semibold text-primary-foreground"
              style={{ background: p.color }}>
              {initials(p.name)}
              <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card ${p.status === "editing" ? "bg-success" : p.status === "idle" ? "bg-muted-foreground" : "bg-warning"}`} />
            </span>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Pages + blocks */}
        <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r bg-sidebar p-3">
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pages</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-6" disabled={readOnly} aria-label="Add page"><Plus className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => addPage("canvas")}><FileText /> Blank page</DropdownMenuItem>
                <DropdownMenuItem onClick={() => addPage("whiteboard")}><PenTool /> Whiteboard</DropdownMenuItem>
                <DropdownMenuItem onClick={() => addPage("chat")}><MessagesSquare /> Team chat</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ul className="mb-1 space-y-0.5">
            {pages.map((pg) => {
              const Icon = PAGE_ICON[pg.kind] ?? FileText;
              const here = onPage(pg.id);
              return (
                <li key={pg.id} className={`group flex items-center rounded-md ${page?.id === pg.id ? "bg-secondary font-medium" : "hover:bg-secondary/60"}`}>
                  <button onClick={() => setPageId(pg.id)} onDoubleClick={() => !readOnly && renamePage(pg)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{pg.title}</span>
                    {pg.kind === "chat" && chat.unread > 0 && page?.id !== pg.id && (
                      <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{chat.unread}</span>
                    )}
                    <span className="ml-auto flex -space-x-1">{here.slice(0, 3).map((p) => <span key={p.session} className="size-2 rounded-full ring-1 ring-card" style={{ background: p.color }} />)}</span>
                  </button>
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button className="px-1 opacity-0 group-hover:opacity-100" aria-label="Page options"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => renamePage(pg)}>Rename</DropdownMenuItem>
                        <DropdownMenuItem disabled={pages.length <= 1} onClick={() => deletePage(pg)} className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
          {!readOnly && (
            <button onClick={() => addPage("canvas")} className="mb-4 flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
              <Plus className="size-4" /> New blank page
            </button>
          )}
          {page?.kind === "canvas" && (
            <>
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Blocks</p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(BLOCKS) as BlockType[]).map((t) => (
                  <button key={t} disabled={readOnly} draggable={!readOnly}
                    onDragStart={(e) => e.dataTransfer.setData("application/x-webcraft-block", t)}
                    onClick={() => addBlock(t)}
                    className="flex flex-col items-center gap-1 rounded-md border bg-card px-1 py-2 text-[11px] hover:border-primary disabled:opacity-50">
                    <BlockGlyph type={t} />
                    {BLOCKS[t].name}
                  </button>
                ))}
              </div>
              <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground">Click or drag onto the page. Arrow keys nudge, Ctrl/Cmd+D duplicates, Delete removes.</p>
            </>
          )}
        </aside>

        {page?.kind === "whiteboard" ? (
          <Whiteboard key={page.id} pageId={page.id} nodes={room.nodes} userId={user.id} session={room.session} leases={room.leases}
            cursors={room.cursors} drags={room.drags} readOnly={readOnly} shared={shared}
            projectId={projectId} prefs={prefs} locks={room.locks} canOverride={canOverride}
            onLock={(id, mode, label) => room.setLock(id, mode, room.locks[id]?.allowed ?? [], label)}
            ops={{ op: room.op, acquire: room.acquire, release: room.release, sendDrag: room.sendDrag, sendCursor: room.sendCursor }} />
        ) : page?.kind === "chat" ? (
          <ChatPage myId={user.id} members={members} messages={chat.messages} activity={room.activity} nodes={room.nodes} theme={theme}
            attach={attach} setAttach={setAttach} send={chat.send} remove={chat.remove} onJump={jumpTo}
            draft={chatDraft} clearDraft={() => setChatDraft("")} wbItems={wbItems}
            onOpenWb={() => { const w = pages.find((x) => x.kind === "whiteboard"); if (w) setPageId(w.id); }} />
        ) : (
          <main ref={areaRef} className="min-w-0 flex-1 overflow-auto bg-dotgrid p-8" onMouseLeave={() => room.setStatus(selected ? "editing" : "idle")}>
            {!room.loaded || !page ? (
              <p className="text-center text-muted-foreground">Loading page…</p>
            ) : (
              <>
                {views.length === 0 && <p className="mb-4 text-center text-muted-foreground">Blank page — add a Navbar and a Hero from the left to get going.</p>}
                <Canvas nodes={views} bp={bp} theme={theme} scale={scale} selected={selected} mySession={room.session} leases={room.leases}
                  cursors={room.cursors} pageId={page.id} drags={room.drags} readOnly={readOnly} prefs={prefs} locks={room.locks} canOverride={canOverride} onSelect={select} onCommit={commitGeo}
                  onLiveDrag={(id, g, done) => room.sendDrag({ id, bp, ...g, done })}
                  onCursor={(x, y) => room.sendCursor(x, y, page.id)}
                  onDropBlock={(t, x, y) => addBlock(t, { x, y })} />
              </>
            )}
          </main>
        )}

        {/* Right panel */}
        {page?.kind !== "chat" && (
        <aside className="flex w-80 shrink-0 flex-col border-l bg-card">
          <Tabs defaultValue="inspect" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-2 grid grid-cols-5">
              <TabsTrigger value="inspect">Edit</TabsTrigger>
              <TabsTrigger value="locks" className="gap-1">Locks{Object.keys(room.locks).length > 0 && <span className="rounded-full bg-warning/40 px-1 text-[10px]">{Object.keys(room.locks).length}</span>}</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
            </TabsList>

            <TabsContent value="locks" className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
              <p className="px-1 pb-2 text-xs text-muted-foreground">Who locked what. Select any block or whiteboard item, then use the lock buttons in Edit (or on the whiteboard toolbar) to pin or lock it.</p>
              {Object.values(room.locks).length === 0 && <p className="p-3 text-sm text-muted-foreground">Nothing is locked right now.</p>}
              <ul className="space-y-1.5">
                {Object.values(room.locks).map((l) => {
                  const pr = room.nodes[l.node_id];
                  const isWb = pr && val<string>(pr, "kind", "") === "wb";
                  const name = pr ? (isWb ? `Whiteboard ${val<string>(pr, "shape", "item")}` : BLOCKS[val<BlockType>(pr, "type", "text")]?.name ?? "Block") : "Deleted item";
                  const txt = pr ? (shared.has(`${l.node_id}:text`) ? shared.get(`${l.node_id}:text`) : val<string>(pr, "text", "")) : "";
                  const locker = members.find((m) => m.id === l.locked_by);
                  const mine = canOverride(l);
                  return (
                    <li key={l.node_id} className="rounded-md border bg-background p-2 text-sm">
                      <div className="flex items-center gap-2">
                        {l.mode === "move" ? <Pin className="size-3.5 text-warning" /> : <Lock className="size-3.5 text-destructive" />}
                        <span className="min-w-0 flex-1 truncate font-medium">{name}{txt ? ` “${txt.slice(0, 22)}”` : ""}</span>
                        <span className="rounded-full px-1.5 text-[10px] font-medium text-primary-foreground" style={{ background: locker?.color ?? "#78716c" }}>{l.mode === "move" ? "Pinned" : "Locked"}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        By <strong className="text-foreground">{l.locked_by === user.id ? "you" : l.locked_by_name}</strong>
                        {l.allowed.length > 0 && <> · also allowed: {l.allowed.map(nameOf).join(", ")}</>}
                        {mine ? " · you can edit" : l.mode === "move" ? " · you can edit text, not move" : " · you can't change it"}
                      </p>
                      <div className="mt-1.5 flex gap-1">
                        {pr && <Button size="sm" variant="ghost" className="h-7" onClick={() => jumpTo({ node_id: l.node_id } as Activity)}><Crosshair className="size-3" /> Show</Button>}
                        {(l.locked_by === user.id || isOwner) && <Button size="sm" variant="ghost" className="h-7" onClick={() => room.setLock(l.node_id, null, [], name)}><Unlock className="size-3" /> Unlock</Button>}
                        {!mine && <Button size="sm" variant="ghost" className="h-7" onClick={() => openChat(`@${(locker?.name ?? l.locked_by_name).replace(/\s+/g, "_")} could you unlock ${name}${txt ? ` “${txt.slice(0, 22)}”` : ""}? `)}><MessageSquarePlus className="size-3" /> Ask to unlock</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </TabsContent>

            <TabsContent value="inspect" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {page?.kind === "whiteboard" ? (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <h2 className="text-xl text-foreground">Whiteboard</h2>
                  <p>Everyone on this page sees your notes, shapes and drawings live. Selecting something locks it for you until you click away.</p>
                  <p>Double-click a sticky, shape or text to write — several people can type in the same note at once.</p>
                  <p><strong className="text-foreground">AI plan</strong> turns a goal into milestones and prioritized tasks on the board for everyone.</p>
                  <p>Select an item and use the pin or lock buttons to stop others moving or changing it.</p>
                  <p>Use <strong className="text-foreground">Plan</strong> for kanban, timeline, priority matrix, SWOT and retro templates. Vote on stickies with the thumbs-up.</p>
                  <p>Shortcuts: V select, H pan, S sticky, R rectangle, O ellipse, T text, L line, A arrow, P pen, F frame. Ctrl + scroll zooms.</p>
                </div>
              ) : sel ? (
                <>
                <LockControl key={`lock-${sel.id}-${room.locks[sel.id]?.mode ?? "open"}`} lock={room.locks[sel.id]} myId={user.id} isOwner={isOwner} readOnly={readOnly} members={members}
                  onSet={(mode, allowed) => room.setLock(sel.id, mode, allowed, labelOf(sel))} />
                <Inspector
                  key={sel.id}
                  node={sel}
                  bp={bp}
                  shared={shared}
                  lockedBy={selLockedBy}
                  readOnly={readOnly}
                  onEdit={(f, v) => room.op(sel.id, { [f]: v }, "edited", labelOf(sel))}
                  onStyle={(k, v) => room.op(sel.id, { [`s.${k}`]: v ?? null }, "styled", labelOf(sel))}
                  onGeo={(g) => commitGeo(sel.id, g, "resized")}
                  onFront={() => {
                    const max = views.reduce<string | null>((m, v) => (!m || v.order > m ? v.order : m), null);
                    room.op(sel.id, { order: keyBetween(max, null) }, "reordered", labelOf(sel));
                  }}
                  onDuplicate={() => addBlock(sel.type, undefined, sel)}
                  onDelete={async () => {
                    await room.op(sel.id, { deleted: true }, "deleted", labelOf(sel));
                    select(null);
                  }}
                />
                </>
              ) : (
                <>
                  <ThemePanel theme={theme} readOnly={readOnly} onChange={saveTheme} />
                  <LayersList views={views} leases={room.leases} session={room.session} onSelect={select} />
                </>
              )}
            </TabsContent>

            <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
              <p className="px-3 pb-2 text-xs text-muted-foreground">Click an entry to preview what changed.</p>
              <ul className="space-y-1" aria-live="polite">
                {room.activity.map((a) => {
                  const blocked = a.outcome.startsWith("blocked");
                  return (
                    <li key={a.id}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className={`w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary ${blocked ? "bg-destructive/10" : ""}`}>
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
                        </PopoverTrigger>
                        <PopoverContent side="left" className="w-80">
                          <p className="mb-2 text-sm"><strong>{a.actor_name}</strong> {a.action} {a.target}</p>
                          <ActivityPreview a={a} props={a.node_id ? room.nodes[a.node_id] : undefined} theme={theme} />
                          <div className="mt-3 flex gap-2">
                            {a.node_id && <Button size="sm" variant="outline" onClick={() => jumpTo(a)}><Crosshair className="size-3.5" /> Show</Button>}
                            {!blocked && (
                              <Button size="sm" onClick={() => { setAttach(a); openChat(); }}><MessageSquarePlus className="size-3.5" /> Discuss</Button>
                            )}
                            {!blocked && (
                              <Button size="sm" variant="outline" onClick={() => {
                                setAttach(a);
                                const who = members.find((m) => m.name === a.actor_name);
                                openChat(who && who.id !== user.id ? `@${who.name.replace(/\s+/g, "_")} why did you make this change? ` : "Who made this change, and why? ");
                              }}><HelpCircle className="size-3.5" /> Ask why</Button>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </li>
                  );
                })}
                {room.activity.length === 0 && <p className="p-3 text-sm text-muted-foreground">No activity yet.</p>}
              </ul>
            </TabsContent>

            <TabsContent value="code" className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
              <CodeView exp={exp} name={`${info?.project?.name ?? "site"}-${page?.title ?? ""}`} />
            </TabsContent>

            <TabsContent value="team" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              <TeamPanel
                projectId={projectId}
                isOwner={myRole === "owner"}
                members={(info?.members ?? []).map((m) => ({ ...m, profile: info?.profiles.find((p) => p.id === m.user_id) }))}
                onChanged={() => qc.invalidateQueries({ queryKey: ["project", projectId] })}
              />
            </TabsContent>
          </Tabs>
        </aside>
        )}
      </div>
    </div>
  );
}

function initials(n: string) {
  return n.split(/\s+/).map((x) => x[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function BlockGlyph({ type }: { type: BlockType }) {
  const bar = "rounded-[1px] bg-muted-foreground/50";
  const box = "flex h-7 w-11 flex-col justify-center gap-0.5 rounded-sm border bg-background p-1";
  switch (type) {
    case "navbar": return <div className={box}><div className="flex justify-between"><div className={`${bar} h-1 w-3`} /><div className="h-1 w-2 rounded-full bg-primary" /></div></div>;
    case "hero": return <div className={box}><div className={`${bar} h-1.5 w-7`} /><div className={`${bar} h-0.5 w-5`} /><div className="h-1 w-3 rounded-full bg-primary" /></div>;
    case "button": return <div className={`${box} items-center`}><div className="h-2 w-6 rounded-full bg-primary" /></div>;
    case "image": return <div className={box}><div className="h-full rounded-sm bg-accent/60" /></div>;
    case "cards": case "pricing": return <div className={`${box} flex-row items-stretch`}>{[0, 1, 2].map((i) => <div key={i} className="flex-1 rounded-[1px] border" />)}</div>;
    case "login": case "register": return <div className={`${box} items-center`}>{[0, 1].map((i) => <div key={i} className="h-1 w-5 rounded-[1px] border" />)}<div className="h-1 w-5 rounded-full bg-primary" /></div>;
    case "divider": return <div className={box}><div className="h-px w-full bg-muted-foreground/60" /></div>;
    default: return <div className={box}><div className={`${bar} h-1 w-8`} /><div className={`${bar} h-1 w-6`} /></div>;
  }
}

function LayersList({ views, leases, session, onSelect }: { views: NodeView[]; leases: Record<string, { holder_session: string; holder_name: string; holder_color: string }>; session: string; onSelect: (id: string) => void }) {
  const sorted = [...views].sort((a, b) => (a.order > b.order ? -1 : 1));
  return (
    <div className="mt-8">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Layers className="size-4" /> Layers</h3>
      {sorted.length === 0 && <p className="text-xs text-muted-foreground">Nothing on this page yet.</p>}
      <ul className="space-y-0.5">
        {sorted.map((v) => {
          const l = leases[v.id];
          return (
            <li key={v.id}>
              <button onClick={() => onSelect(v.id)} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary">
                <span className="truncate">{BLOCKS[v.type].name}{v.text ? ` · ${v.text.slice(0, 22)}` : ""}</span>
                {l && (
                  <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] text-primary-foreground" style={{ background: l.holder_color }}>
                    <Lock className="size-2.5" /> {l.holder_session === session ? "You" : l.holder_name}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Inspector(props: {
  node: NodeView;
  bp: Breakpoint;
  shared: SharedText;
  lockedBy?: string | undefined;
  readOnly: boolean;
  onEdit: (f: "text" | "sub" | "label", v: string) => void;
  onStyle: (k: keyof BlockStyle, v: unknown) => void;
  onGeo: (g: Geo) => void;
  onFront: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { node } = props;
  const def = BLOCKS[node.type];
  const g = node.geo[props.bp];
  const st = node.style;
  const disabled = props.readOnly || !!props.lockedBy;
  const fields: { f: "text" | "sub" | "label"; label: string }[] = [];
  if (def.text) fields.push({ f: "text", label: node.type === "image" ? "Alt text / caption" : node.type === "cards" || node.type === "pricing" ? "Titles (separate with |)" : "Text" });
  if (def.sub) fields.push({ f: "sub", label: node.type === "pricing" ? "Prices (separate with |)" : node.type === "cards" ? "Descriptions (separate with |)" : "Secondary text" });
  if (def.label) fields.push({ f: "label", label: "Button label" });

  const color = (k: "bg" | "color" | "btn" | "border", label: string) => (
    <label className="flex items-center justify-between gap-2 text-xs">
      {label}
      <span className="flex items-center gap-1">
        <input type="color" disabled={disabled} defaultValue={st[k] ?? "#ffffff"} key={st[k] ?? "none"}
          onBlur={(e) => e.target.value !== st[k] && props.onStyle(k, e.target.value)} className="h-7 w-10 cursor-pointer rounded border bg-transparent" />
        {st[k] && <button disabled={disabled} className="text-[10px] text-muted-foreground hover:underline" onClick={() => props.onStyle(k, null)}>reset</button>}
      </span>
    </label>
  );
  const range = (k: "radius" | "pad" | "opacity" | "scale", label: string, min: number, max: number, step: number, dflt: number) => (
    <label className="block text-xs">
      <span className="flex justify-between">{label}<span className="text-muted-foreground">{st[k] ?? dflt}</span></span>
      <input type="range" min={min} max={max} step={step} disabled={disabled} defaultValue={st[k] ?? dflt} key={String(st[k] ?? dflt)}
        onPointerUp={(e) => props.onStyle(k, Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => props.onStyle(k, Number((e.target as HTMLInputElement).value))}
        className="mt-1 w-full accent-[var(--primary)]" />
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl">{def.name}</h2>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" disabled={disabled} onClick={props.onDuplicate} aria-label="Duplicate"><Copy /></Button>
          <Button size="icon" variant="ghost" disabled={disabled} onClick={props.onFront} aria-label="Bring to front"><ArrowUpToLine /></Button>
          <Button size="icon" variant="ghost" disabled={disabled} onClick={props.onDelete} aria-label="Delete"><Trash2 /></Button>
        </div>
      </div>
      {props.lockedBy ? (
        <p className="flex items-center gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm"><Lock className="size-4" /> {props.lockedBy} is editing this block — it's locked for you.</p>
      ) : !props.readOnly && (
        <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-xs"><Lock className="size-3.5" /> You hold the lock on this block. Others can't change it until you click away.</p>
      )}
      {fields.map(({ f, label }) => (
        <div key={f} className="space-y-1.5">
          <Label>{label}</Label>
          <CollabTextarea shared={props.shared} k={`${node.id}:${f}`} seed={node[f]} disabled={disabled} rows={f === "label" ? 1 : 3}
            onCommit={(v) => props.onEdit(f, v)} />
        </div>
      ))}
      <div className="space-y-3">
        <Label className="block">Style</Label>
        {color("bg", "Background")}
        {color("color", "Text color")}
        {def.label && color("btn", "Button color")}
        {color("border", "Border")}
        {range("radius", "Corner radius", 0, 48, 1, 0)}
        {range("pad", "Padding", 0, 64, 2, 0)}
        {range("scale", "Text scale", 0.6, 1.8, 0.05, 1)}
        {range("opacity", "Opacity", 0.1, 1, 0.05, 1)}
        <div className="flex items-center justify-between text-xs">
          Alignment
          <div className="flex rounded-md border p-0.5">
            {(["left", "center", "right"] as const).map((a) => (
              <button key={a} disabled={disabled} onClick={() => props.onStyle("align", st.align === a ? null : a)}
                className={`rounded px-2 py-0.5 capitalize ${st.align === a ? "bg-secondary font-medium" : "text-muted-foreground"}`}>{a}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          Font
          <div className="flex rounded-md border p-0.5">
            {(["serif", "sans", "mono"] as const).map((a) => (
              <button key={a} disabled={disabled} onClick={() => props.onStyle("font", st.font === a ? null : a)}
                className={`rounded px-2 py-0.5 capitalize ${st.font === a ? "bg-secondary font-medium" : "text-muted-foreground"}`}>{a}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between text-xs">
          Drop shadow
          <Switch checked={!!st.shadow} disabled={disabled} onCheckedChange={(c) => props.onStyle("shadow", c)} />
        </label>
      </div>
      <div key={`${g.x}-${g.y}-${g.w}-${g.h}`}>
        <Label className="mb-1.5 block">Position & size · {BREAKPOINTS[props.bp].label}</Label>
        <div className="grid grid-cols-4 gap-2">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k} className="text-[11px] uppercase text-muted-foreground">
              {k}
              <Input type="number" defaultValue={g[k]} disabled={disabled} className="mt-1 h-8 px-2 text-xs"
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isNaN(n) && n !== g[k]) props.onGeo({ ...g, [k]: n });
                }} />
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
