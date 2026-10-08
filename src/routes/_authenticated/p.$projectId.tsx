import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, Download, Lock, Monitor, Smartphone, Tablet, Trash2, ArrowUpToLine, Plus, FileText, PenTool, MessagesSquare, MoreHorizontal, MessageSquarePlus, Crosshair, Layers,
  Eye, Globe, LayoutTemplate, HelpCircle, Pin, Unlock, UserMinus, PanelLeft, Server, X,
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
import { BLOCKS, BREAKPOINTS, DEFAULT_THEME, safeHref, type BlockStyle, type BlockType, type Breakpoint, type Theme } from "@/lib/blocks";
import { generateExport, toView, type Geo, type NodeView } from "@/lib/model";
import { keyBetween, val } from "@/lib/crdt";
import { useRoom, type Activity, type Me } from "@/lib/useRoom";
import { useSharedText, type SharedText } from "@/lib/sharedText";
import { useChat } from "@/lib/useChat";
import { useDragPrefs } from "@/lib/dragPrefs";
import { DragSettings } from "@/components/editor/DragSettings";
import { LockControl } from "@/components/editor/LockControl";
import type { NodeLock } from "@/lib/useRoom";
import { SITE_TEMPLATES, templateViews, type SiteTemplate } from "@/lib/siteTemplates";
import { SitePreview } from "@/components/SitePreview";
import { openSandboxed, downloadSiteZip } from "@/lib/sandbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isContainer, type BoxOpts } from "@/lib/blocks";

export const Route = createFileRoute("/_authenticated/p/$projectId")({
  head: () => ({
    meta: [
      { title: "Editor — WebCraft" },
      { name: "description", content: "Edit your website live with your team in WebCraft." },
      { property: "og:title", content: "Editor — WebCraft" },
      { property: "og:description", content: "Edit your website live with your team in WebCraft." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditorPage,
});

type Page = { id: string; kind: string; title: string; sort: string };
const PAGE_ICON = { canvas: FileText, whiteboard: PenTool, chat: MessagesSquare } as Record<string, typeof FileText>;

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

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
  const isMobile = useMediaQuery("(max-width: 767px)");
  const readOnly = myRole === "viewer" || isMobile;
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
  const [chatOpen, setChatOpen] = useState(false);
  const page = chatOpen ? { id: "team-chat", kind: "chat", title: "Team chat", sort: "" } : pages.find((x) => x.id === pageId) ?? pages[0] ?? null;
  const firstCanvas = pages.find((x) => x.kind === "canvas")?.id ?? null;

  async function addPage(kind: "canvas" | "whiteboard" | "chat") {
    if (kind === "chat") { setChatOpen(true); return; }
    const last = pages[pages.length - 1]?.sort ?? null;
    const title = kind === "canvas" ? `Page ${pages.filter((x) => x.kind === "canvas").length + 1}` : kind === "whiteboard" ? "Whiteboard" : "Team chat";
    const { data, error } = await supabase.from("pages").insert({ project_id: projectId, kind, title, sort: keyBetween(last, null) }).select("id").single();
    if (error) { toast.error("Couldn't add page"); return; }
    await qc.invalidateQueries({ queryKey: ["pages", projectId] });
    setPageId(data.id);
    setChatOpen(false);
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
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
    if (id && typeof window !== "undefined" && window.innerWidth < 1024) setPanelOpen(true);
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
      extra["text"] = copy.text; extra["sub"] = copy.sub; extra["label"] = copy.label; extra["href"] = copy.href;
      extra["attrs"] = copy.attrs; extra["script"] = copy.script;
      for (const [k, v] of Object.entries(copy.box)) extra[`c.${k}`] = v;
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
  const sitePages = useMemo(() => Object.fromEntries(pages.filter((p) => p.kind === "canvas").map((pg) => {
    const nodes = Object.entries(room.nodes).flatMap(([id, props]) => {
      const v = toView(id, props);
      if (!v || (v.page ?? firstCanvas) !== pg.id) return [];
      for (const f of ["text", "sub", "label"] as const) if (shared.has(`${id}:${f}`)) v[f] = shared.get(`${id}:${f}`);
      return [v];
    });
    const out = generateExport(nodes, theme, pg.title);
    return [pg.id, out.html.replace('<link rel="stylesheet" href="styles.css">', `<style>${out.css}</style>`).replace('<script src="script.js"></script>', `<script>${out.js}</script>`)] as const;
  })), [pages, room.nodes, shared.ver, firstCanvas, theme]);
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
    const data = JSON.stringify(sitePages).replace(/</g, "\\u003c");
    const handler = `<script>var pages=${data};function navigatePage(e){var a=e.target.closest('a[href^="?page="]');if(!a)return;var id=a.getAttribute('href').slice(6);if(pages[id]){e.preventDefault();document.open();document.write(pages[id]);document.close();document.addEventListener('click',navigatePage)}}document.addEventListener('click',navigatePage)</script>`;
    const html = singleHtml().replace('</body>', `${handler}</body>`);
    if (!openSandboxed(html, info?.project?.name ?? "Preview")) toast.error("Allow pop-ups to preview");
  }
  async function publishSite() {
    if (page?.kind !== "canvas") { toast.info("Open the design page you want to publish."); return; }
    if (!views.length) { toast.info("This page is empty — add some blocks first."); return; }
    const { error } = await supabase.from("published_sites").upsert({ project_id: projectId, title: info?.project?.name ?? "", html: singleHtml(), pages_html: sitePages as never, published_by: user.id, updated_at: new Date().toISOString() });
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
    const templateNodes = templateViews(t);
    const jobs = t.blocks.map((b, i) => {
      const def = BLOCKS[b.type];
      const w = Math.min(b.w ?? def.w, pageW), h = b.h ?? def.h;
      const geometry = templateNodes[i]?.geo;
      order = keyBetween(order, null);
      return room.op(crypto.randomUUID(), {
        type: b.type, parent: null, page: page.id, order, deleted: false,
        "x@desktop": b.x ?? Math.round((pageW - w) / 2), "y@desktop": base + b.y, "w@desktop": w, "h@desktop": h,
        ...Object.fromEntries((["tablet", "mobile"] as const).flatMap((bp) => geometry ? Object.entries(geometry[bp]).map(([k, v]) => [`${k}@${bp}`, k === "y" ? base + v : v]) : [])),
        text: b.text ?? def.text, sub: b.sub ?? def.sub, label: b.label ?? def.label, href: b.href ?? "", attrs: b.attrs ?? {},
        ...Object.fromEntries(Object.entries(b.style ?? {}).map(([k, v]) => [`s.${k}`, v])),
        ...Object.fromEntries(Object.entries(b.box ?? {}).map(([k, v]) => [`c.${k}`, v])),
      }, "created", `${def.name} (${t.name} template)`);
    });
    const results = await Promise.all(jobs);
    if (results.some((r) => r !== "applied" && r !== "duplicate")) toast.error("Some template blocks could not be added");
    else {
      if (!views.length) await saveTheme(t.theme);
      toast.success(`${t.name} template added`);
    }
  }
  // Apply a template picked on the projects screen, once the first page is ready.
  useEffect(() => {
    if (!room.loaded || !page || page.kind !== "canvas" || readOnly) return;
    const key = `webcraft:tpl:${projectId}`;
    const id = sessionStorage.getItem(key);
    if (!id) return;
    sessionStorage.removeItem(key);
    const t = SITE_TEMPLATES.find((x) => x.id === id);
    if (t && views.length === 0) void applyTemplate(t);
  }, [room.loaded, page?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  function openChat(prefill?: string) {
    if (prefill) setChatDraft(prefill);
    setChatOpen(true);
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
  const scale = Math.min(1, (areaW - (areaW < 640 ? 24 : 64)) / BREAKPOINTS[bp].width);

  function jumpTo(a: Activity) {
    if (!a.node_id) return;
    const pr = room.nodes[a.node_id];
    if (!pr) { toast.info("That item no longer exists."); return; }
    const target = val<string | null>(pr, "page", null) ?? firstCanvas;
    if (target) { setPageId(target); setChatOpen(false); }
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
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 overflow-x-auto [&>*]:shrink-0">
        <Button variant="ghost" size="icon" asChild><Link to="/projects" aria-label="Back to projects"><ArrowLeft /></Link></Button>
        <span className="max-w-40 truncate font-display text-sm font-semibold">{info?.project?.name ?? "…"}</span>
        <Button size="sm" variant={chatOpen ? "secondary" : "outline"} onClick={() => openChat()} className="relative ml-auto" aria-label="Open team chat">
          <MessagesSquare className="size-4" /> <span className="hidden sm:inline">Chat</span>
          {chat.unread > 0 && !chatOpen && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{chat.unread}</span>}
        </Button>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto [&>*]:shrink-0">
        {readOnly && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground" title={isMobile ? "Editing is only available on a larger screen" : undefined}>
            {isMobile ? "View only on mobile" : "View only"}
          </span>
        )}
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
          <Button size="sm" variant={page?.kind === "whiteboard" ? "secondary" : "ghost"} onClick={() => { const w = pages.find((x) => x.kind === "whiteboard"); if (w) { setPageId(w.id); setChatOpen(false); } else addPage("whiteboard"); }}><PenTool className="size-4" /> <span className="hidden xl:inline">Whiteboard</span></Button>
        </div>
        {page?.kind === "canvas" && !readOnly && (
          <Button size="sm" variant="outline" onClick={() => setTplOpen(true)}><LayoutTemplate className="size-4" /> <span className="hidden xl:inline">Templates</span></Button>
        )}
        {page?.kind !== "chat" && (
          <Button size="sm" variant={panelOpen ? "secondary" : "outline"} className="lg:hidden" onClick={() => setPanelOpen((o) => !o)} aria-label="Toggle settings panel"><PanelLeft className="size-4" /></Button>
        )}
        {page && page.kind !== "chat" && !readOnly && <DragSettings prefs={prefs} onChange={setPrefs} />}
        <Button size="sm" variant="outline" onClick={previewSite} title="Preview website"><Eye className="size-4" /> <span className="hidden xl:inline">Preview</span></Button>
        <Popover>
          <PopoverTrigger asChild><Button size="sm" disabled={readOnly}><Globe className="size-4" /> <span className="hidden xl:inline">Publish</span></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3 text-sm">
            <p className="font-medium">Publish your website</p>
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
                <p className="text-muted-foreground">Anyone with the link can see this page and linked project pages.</p>
                <Button size="sm" onClick={publishSite}>Publish now</Button>
              </>
            )}
            <div className="border-t pt-3">
              <Button size="sm" variant="outline" className="w-full" onClick={() => setHostOpen(true)}><Server className="size-4" /> Host on Hostinger, GoDaddy…</Button>
            </div>
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
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Settings panel (left) */}
        {page?.kind !== "chat" && (
        <aside className={`${panelOpen ? "fixed bottom-0 left-0 top-14 z-40 flex shadow-lift" : "hidden"} w-[min(20rem,90vw)] shrink-0 flex-col border-r bg-card lg:static lg:flex lg:w-80 lg:shadow-none ${isMobile ? "!hidden" : ""}`}>
          <div className="flex items-center justify-end px-2 pt-2 lg:hidden"><Button size="icon" variant="ghost" className="size-7" onClick={() => setPanelOpen(false)} aria-label="Close panel"><X className="size-4" /></Button></div>
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
                  <p>Tick the circle on any task to mark it <strong className="text-foreground">Done</strong>; click a task's status to move it along. Undo and redo with Ctrl+Z / Ctrl+Y.</p>
                  <p>Select an item and use the pin or lock buttons to stop others moving or changing it.</p>
                  <p>Use <strong className="text-foreground">Plan</strong> for sprint board, user flow, API design, bug triage and retro templates. Vote on stickies with the thumbs-up.</p>
                  <p>Shortcuts: V select, H pan, K task, S sticky, R process, D decision, O start/end, A connector, C code, I API, T text, F frame, P pen. Ctrl + scroll zooms.</p>
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
                    onLink={(v) => { if (v && !safeHref(v)) { toast.error("Use a valid website, payment, email, or project page link"); return; } room.op(sel.id, { href: v }, "linked", labelOf(sel)); }}
                    pages={pages.filter((p) => p.kind === "canvas")}
                  onStyle={(k, v) => room.op(sel.id, { [`s.${k}`]: v ?? null }, "styled", labelOf(sel))}
                  onAttrs={(a) => room.op(sel.id, { attrs: a }, "set attributes on", labelOf(sel))}
                  onScript={(js) => room.op(sel.id, { script: js }, "edited logic of", labelOf(sel))}
                  onBox={(k, v) => room.op(sel.id, { [`c.${k}`]: v ?? null }, "changed layout of", labelOf(sel))}
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
                <CodeView exp={exp} pages={sitePages} homeId={firstCanvas} name={`${info?.project?.name ?? "site"}-${page?.title ?? ""}`} />
            </TabsContent>

            <TabsContent value="team" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              <TeamPanel
                projectId={projectId}
                isOwner={myRole === "owner"}
                myId={user.id}
                members={(info?.members ?? []).map((m) => ({ ...m, profile: info?.profiles.find((p) => p.id === m.user_id) }))}
                onChanged={() => qc.invalidateQueries({ queryKey: ["project", projectId] })}
              />
            </TabsContent>
          </Tabs>
        </aside>
        )}
        {/* Pages + blocks (right) */}
        <aside className="order-last hidden w-52 shrink-0 flex-col overflow-y-auto border-l bg-sidebar p-3 md:flex xl:w-56">
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
                  <button onClick={() => { setPageId(pg.id); setChatOpen(false); }} onDoubleClick={() => !readOnly && renamePage(pg)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
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
          <Button variant={chatOpen ? "secondary" : "ghost"} size="sm" onClick={() => openChat()} className="mb-3 justify-start"><MessagesSquare className="size-4" /> Team chat</Button>
          {!readOnly && (
            <button onClick={() => addPage("canvas")} className="mb-4 flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
              <Plus className="size-4" /> New blank page
            </button>
          )}
          {page?.kind === "canvas" && !readOnly && (
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

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile page switcher (sidebars are hidden on small screens) */}
          <div className="flex items-center gap-1 overflow-x-auto border-b bg-sidebar px-2 py-1.5 md:hidden">
            {pages.map((pg) => {
              const Icon = PAGE_ICON[pg.kind] ?? FileText;
              return (
                <button key={pg.id} onClick={() => { setPageId(pg.id); setChatOpen(false); }}
                  className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${page?.id === pg.id ? "bg-secondary font-medium" : "text-muted-foreground"}`}>
                  <Icon className="size-3.5" /> {pg.title}
                </button>
              );
            })}
            <button onClick={() => openChat()} className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${chatOpen ? "bg-secondary font-medium" : "text-muted-foreground"}`}>
              <MessagesSquare className="size-3.5" /> Chat
              {chat.unread > 0 && <span className="rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{chat.unread}</span>}
            </button>
          </div>
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
            onOpenWb={() => { const w = pages.find((x) => x.kind === "whiteboard"); if (w) { setPageId(w.id); setChatOpen(false); } }} />
        ) : (
          <main ref={areaRef} className="editor-gradient min-w-0 flex-1 overflow-auto p-3 sm:p-6 lg:p-8" onMouseLeave={() => room.setStatus(selected ? "editing" : "idle")}>
            {!room.loaded || !page ? (
              <p className="text-center text-muted-foreground">Loading page…</p>
            ) : (
              <>
                {views.length === 0 && <p className="mb-4 text-center text-muted-foreground">Blank page — add a Navbar and a Hero from the blocks panel on the right.</p>}
                <Canvas nodes={views} bp={bp} theme={theme} scale={scale} selected={selected} mySession={room.session} leases={room.leases}
                  cursors={room.cursors} pageId={page.id} drags={room.drags} readOnly={readOnly} prefs={prefs} locks={room.locks} canOverride={canOverride} onSelect={select} onCommit={commitGeo}
                  onLiveDrag={(id, g, done) => room.sendDrag({ id, bp, ...g, done })}
                  onCursor={(x, y) => room.sendCursor(x, y, page.id)}
                  onDropBlock={(t, x, y) => addBlock(t, { x, y })} />
              </>
            )}
          </main>
        )}
        </div>

      </div>

      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Website templates</DialogTitle><DialogDescription>Pick a design to add to this page. You can change everything afterwards.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {SITE_TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => { setTplOpen(false); applyTemplate(t); }} className="overflow-hidden rounded-lg border text-left transition hover:border-primary hover:shadow-lift">
                <SitePreview nodes={templateViews(t)} theme={t.theme} height={190} className="border-b" />
                <span className="block p-3"><span className="block font-medium">{t.name}</span><span className="text-xs text-muted-foreground">{t.description}</span></span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <HostingDialog open={hostOpen} onOpenChange={setHostOpen} siteUrl={siteUrl} published={!!published}
        onZip={(host) => downloadSiteZip(sitePages, firstCanvas, info?.project?.name ?? "site", host)} />
    </div>
  );
}

const HOSTS = {
  Hostinger: { upload: ["Log in to hPanel and open Websites → Manage.", "Open File Manager and go into the public_html folder.", "Delete the default index.php or default.php file if there is one.", "Upload the ZIP, right-click it and choose Extract, then delete the ZIP."], forward: ["In hPanel open Domains → your domain → Redirects (or Domain forwarding).", "Choose a permanent (301) redirect and paste your published link.", "Save. It can take up to a few hours to take effect."] },
  GoDaddy: { upload: ["Open My Products → Web Hosting → Manage → cPanel Admin.", "Open File Manager → public_html.", "Upload the ZIP, select it and choose Extract.", "Remove any old index files that came with the hosting."], forward: ["Open My Products → Domains → your domain → DNS → Forwarding.", "Add forwarding to your published link, type Permanent (301).", "Save. GoDaddy says it can take up to 48 hours."] },
  Namecheap: { upload: ["Open Hosting List → Go to cPanel.", "Open File Manager → public_html.", "Upload the ZIP and Extract it there."], forward: ["Open Domain List → Manage → Redirect Domain.", "Add a redirect from your domain to your published link.", "Save. Changes can take about 30 minutes."] },
  "Other host": { upload: ["Open your host's file manager or connect by FTP.", "Go to the website root (often public_html, www or htdocs).", "Upload and extract the ZIP so index.html sits in the root."], forward: ["Find Domain forwarding / Redirects in your domain settings.", "Point your domain to your published link with a permanent (301) redirect."] },
} as const;

function HostingDialog({ open, onOpenChange, siteUrl, published, onZip }: { open: boolean; onOpenChange: (o: boolean) => void; siteUrl: string; published: boolean; onZip: (host: string) => void }) {
  const [host, setHost] = useState<keyof typeof HOSTS>("Hostinger");
  const h = HOSTS[host];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Put your site on your own hosting</DialogTitle>
          <DialogDescription>Your download is already configured for static hosting. Choose a provider for the exact upload or domain steps.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(HOSTS) as (keyof typeof HOSTS)[]).map((k) => (
            <Button key={k} size="sm" variant={host === k ? "default" : "outline"} onClick={() => setHost(k)}>{k}</Button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border p-4">
            <h3 className="font-medium">Option 1 · Upload the files</h3>
            <p className="mt-1 text-xs text-muted-foreground">Your site runs on your {host} hosting. Re-upload after changes.</p>
            <Button size="sm" className="mt-3" onClick={() => onZip(host)}><Download className="size-4" /> Download preconfigured ZIP</Button>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm">{h.upload.map((x) => <li key={x}>{x}</li>)}</ol>
          </section>
          <section className="rounded-lg border p-4">
            <h3 className="font-medium">Option 2 · Forward your domain</h3>
            <p className="mt-1 text-xs text-muted-foreground">Your WebCraft address is already live-ready. Your domain provider still requires you to approve the forwarding change.</p>
            {published ? (
              <div className="mt-3 flex items-center gap-1">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{siteUrl}</code>
                <Button size="icon" variant="outline" className="size-7" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(siteUrl); toast.success("Link copied"); }}><Copy className="size-3.5" /></Button>
              </div>
            ) : <p className="mt-3 rounded bg-warning/15 p-2 text-xs">Publish the site first to get your link.</p>}
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm">{h.forward.map((x) => <li key={x}>{x}</li>)}</ol>
          </section>
        </div>
      </DialogContent>
    </Dialog>
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
    case "input": return <div className={box}><div className={`${bar} h-0.5 w-4`} /><div className="h-2 w-9 rounded-[2px] border bg-card" /></div>;
    case "flex": return <div className={`${box} flex-row items-center gap-0.5`}>{[0, 1, 2].map((i) => <div key={i} className="h-3 flex-1 rounded-[1px] bg-primary/30" />)}</div>;
    case "grid": return <div className={`${box} grid grid-cols-3 gap-0.5`}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-1.5 rounded-[1px] bg-primary/30" />)}</div>;
    case "stack": return <div className={`${box} gap-0.5`}>{[0, 1, 2].map((i) => <div key={i} className="h-1 w-full rounded-[1px] bg-primary/30" />)}</div>;
    case "absolute": return <div className={`${box} relative`}><div className="absolute left-1 top-1 h-3 w-5 rounded-[1px] bg-primary/25" /><div className="absolute left-3 top-2.5 h-3 w-5 rounded-[1px] bg-primary/50" /></div>;
    case "section": return <div className={`${box} bg-accent/20`}><div className={`${bar} h-1 w-6`} /><div className={`${bar} h-0.5 w-8`} /></div>;
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
  onLink: (v: string) => void;
  pages: Page[];
  onStyle: (k: keyof BlockStyle, v: unknown) => void;
  onAttrs: (a: Record<string, string>) => void;
  onScript: (js: string) => void;
  onBox: (k: keyof BoxOpts, v: unknown) => void;
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
  if (def.text) fields.push({ f: "text", label: node.type === "image" ? "Alt text / caption" : node.type === "cards" || node.type === "pricing" ? "Titles (separate with |)" : node.type === "input" ? "Field label" : isContainer(node.type) && node.type !== "section" ? "Items (separate with |)" : "Text" });
  if (def.sub) fields.push({ f: "sub", label: node.type === "pricing" ? "Prices (separate with |)" : node.type === "cards" ? "Descriptions (separate with |)" : node.type === "input" ? "Placeholder" : "Secondary text" });
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
      {["button", "navbar", "hero", "pricing", "login", "register"].includes(node.type) && (
        <div className="space-y-2 border-t pt-4">
          <Label>Button destination</Label>
          <select aria-label="Button destination type" disabled={disabled} value={node.href.startsWith("?page=") ? "page" : "url"}
            onChange={(e) => props.onLink(e.target.value === "page" ? `?page=${props.pages[0]?.id ?? ""}` : "")}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="url">Website or payment link</option><option value="page">Another page in this project</option>
          </select>
          {node.href.startsWith("?page=") ? (
            <select aria-label="Destination page" disabled={disabled} value={node.href.slice(6)} onChange={(e) => props.onLink(`?page=${e.target.value}`)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {props.pages.map((pg) => <option key={pg.id} value={pg.id}>{pg.title}</option>)}
            </select>
          ) : <Input aria-label="Website or payment URL" disabled={disabled} type="url" placeholder="https://checkout.example.com/…" defaultValue={node.href} key={node.id + node.href}
              onBlur={(e) => { if (e.target.value !== node.href) props.onLink(e.target.value.trim()); }} />}
          <p className="text-xs text-muted-foreground">Paste your payment provider's checkout link, or select a project page. Sign-in and sign-up blocks also need a destination; they do not create user accounts.</p>
        </div>
      )}
      {isContainer(node.type) && node.type !== "section" && (
        <BoxPanel type={node.type} box={node.box} disabled={disabled} onBox={props.onBox} />
      )}
      <AttrsPanel key={`attrs-${node.id}`} node={node} disabled={disabled} onAttrs={props.onAttrs} />
      <LogicPanel key={`js-${node.id}-${node.script.length}`} node={node} disabled={disabled} onScript={props.onScript} />
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

function CodeView({ exp, pages, name, homeId }: { exp: { html: string; css: string; js: string }; pages: Record<string, string>; name: string; homeId: string | null }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const base: Record<string, string> = { "index.html": exp.html, "styles.css": exp.css, "script.js": exp.js };
  const files = Object.keys(base).map((k) => ({ k, v: edits[k] ?? base[k]!, edited: k in edits }));
  const val = (k: string) => edits[k] ?? base[k]!;
  const combined = () => {
    let html = val("index.html");
    const css = `<style>${val("styles.css")}</style>`;
    const js = `<script>${val("script.js")}</script>`;
    html = html.replace(/<link[^>]+styles\.css[^>]*>/i, css).replace(/<script[^>]+script\.js[^>]*><\/script>/i, js);
    if (!html.includes(css)) html = html.replace(/<\/head>/i, `${css}</head>`);
    if (!html.includes(js)) html = html.replace(/<\/body>/i, `${js}</body>`);
    return html;
  };
  function preview() {
    if (!openSandboxed(combined())) toast.error("Allow pop-ups to preview");
  }
  async function zip() {
    const JSZip = (await import("jszip")).default;
    const z = new JSZip();
    for (const f of files) z.file(f.k, f.v);
    for (const [id, html] of Object.entries(pages)) z.file(`page-${id}.html`, html.replace(/\?page=([0-9a-f-]{36})/gi, 'page-$1.html'));
    z.file("index.html", val("index.html").replace(/\?page=([0-9a-f-]{36})/gi, 'page-$1.html'));
    const blob = await z.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "site"}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <Tabs defaultValue="index.html" className="flex h-full flex-col">
      <div className="flex items-center gap-1">
        <TabsList className="h-8">
          {files.map((f) => <TabsTrigger key={f.k} value={f.k} className="text-xs">{f.k}{f.edited ? " •" : ""}</TabsTrigger>)}
        </TabsList>
        <Button size="sm" variant="ghost" className="ml-auto h-8 px-2 text-xs" onClick={preview}>Preview</Button>
        <Button size="icon" variant="ghost" className="size-8" onClick={zip} aria-label="Export as ZIP"><Download /></Button>
      </div>
      {Object.keys(edits).length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">Edited code is used for Preview and ZIP export only; canvas changes won't overwrite your edits until you reset.</p>
      )}
      {files.map((f) => (
        <TabsContent key={f.k} value={f.k} className="relative mt-2 min-h-0 flex-1">
          <div className="absolute right-2 top-2 z-10 flex gap-1">
            {f.edited && (
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => setEdits(({ [f.k]: _, ...rest }) => rest)}>Reset</Button>
            )}
            <Button
              size="icon"
              variant="secondary"
              className="size-7"
              onClick={() => navigator.clipboard.writeText(f.v).then(() => toast.success(`${f.k} copied`))}
              aria-label={`Copy ${f.k}`}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <textarea
            value={f.v}
            spellCheck={false}
            aria-label={`Edit ${f.k}`}
            onChange={(e) => { const v = e.target.value; setEdits((s) => ({ ...s, [f.k]: v })); }}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              e.preventDefault();
              const t = e.currentTarget, s = t.selectionStart, en = t.selectionEnd;
              const v = t.value.slice(0, s) + "  " + t.value.slice(en);
              setEdits((st) => ({ ...st, [f.k]: v }));
              requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
            }}
            className="h-full w-full resize-none overflow-auto whitespace-pre rounded-md bg-ink p-3 font-mono text-[11px] leading-relaxed text-paper outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TeamPanel(props: {
  projectId: string;
  isOwner: boolean;
  myId: string;
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
            {props.isOwner && m.role !== "owner" && m.user_id !== props.myId && (
              <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label={`Remove ${m.profile?.display_name ?? "member"}`} title="Remove from project"
                onClick={async () => {
                  if (!window.confirm(`Remove ${m.profile?.display_name ?? "this member"} from the project? They'll lose access right away.`)) return;
                  const { error } = await supabase.from("project_members").delete().eq("project_id", props.projectId).eq("user_id", m.user_id);
                  if (error) toast.error("Couldn't remove member"); else { toast.success("Member removed"); props.onChanged(); }
                }}><UserMinus className="size-3.5" /></Button>
            )}
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

const SNIPPETS: { name: string; code: string }[] = [
  { name: "Required field", code: `input.required = true;\ninput.addEventListener("blur", () => {\n  el.querySelector(".wc-field-msg").textContent = input.value.trim() ? "" : "This field is required";\n});` },
  { name: "Email check", code: `input.addEventListener("input", () => {\n  const ok = /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(input.value);\n  input.setCustomValidity(ok ? "" : "Enter a valid email");\n  el.querySelector(".wc-field-msg").textContent = ok || !input.value ? "" : "Enter a valid email";\n});` },
  { name: "Min length", code: `input.addEventListener("input", () => {\n  const short = input.value.length > 0 && input.value.length < 8;\n  el.querySelector(".wc-field-msg").textContent = short ? "Use at least 8 characters" : "";\n});` },
  { name: "Click message", code: `el.addEventListener("click", () => {\n  alert("Thanks for clicking!");\n});` },
  { name: "Save to browser", code: `input.value = localStorage.getItem(input.name) || "";\ninput.addEventListener("input", () => localStorage.setItem(input.name, input.value));` },
];

function AttrsPanel({ node, disabled, onAttrs }: { node: NodeView; disabled: boolean; onAttrs: (a: Record<string, string>) => void }) {
  const [rows, setRows] = useState<[string, string][]>(() => Object.entries(node.attrs));
  const commit = (r: [string, string][]) => {
    const o: Record<string, string> = {};
    for (const [k, v] of r) if (k.trim()) o[k.trim()] = v;
    if (JSON.stringify(o) !== JSON.stringify(node.attrs)) onAttrs(o);
  };
  const presets: [string, string][] = node.type === "input"
    ? [["type", "email"], ["name", "email"], ["required", ""], ["minlength", "8"], ["maxlength", "120"], ["pattern", "[A-Za-z ]+"], ["autocomplete", "email"]]
    : [["aria-label", ""], ["title", ""], ["data-track", "cta"], ["role", "region"]];
  return (
    <div className="space-y-2 border-t pt-4">
      <Label>Attributes</Label>
      <p className="text-xs text-muted-foreground">{node.type === "input" ? "Set the input type, name, required, length limits or a pattern." : "Added to this block's element in the published site."} Event handlers go in Logic below.</p>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex gap-1">
          <Input aria-label="Attribute name" disabled={disabled} value={k} placeholder="name" className="h-8 flex-1 font-mono text-xs"
            onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} onBlur={() => commit(rows)} />
          <Input aria-label="Attribute value" disabled={disabled} value={v} placeholder="value" className="h-8 flex-1 font-mono text-xs"
            onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} onBlur={() => commit(rows)} />
          <Button size="icon" variant="ghost" className="size-8" disabled={disabled} aria-label="Remove attribute" onClick={() => { const r = rows.filter((_, j) => j !== i); setRows(r); commit(r); }}><X className="size-3.5" /></Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        {presets.filter(([k]) => !rows.some(([x]) => x === k)).map(([k, v]) => (
          <button key={k} disabled={disabled} onClick={() => { const r: [string, string][] = [...rows, [k, v]]; setRows(r); commit(r); }}
            className="rounded-full border px-2 py-0.5 font-mono text-[10px] hover:border-primary disabled:opacity-50">+ {k}</button>
        ))}
        <button disabled={disabled} onClick={() => setRows((r) => [...r, ["", ""]])} className="rounded-full border border-dashed px-2 py-0.5 text-[10px] hover:border-primary">+ custom</button>
      </div>
    </div>
  );
}

function LogicPanel({ node, disabled, onScript }: { node: NodeView; disabled: boolean; onScript: (js: string) => void }) {
  const [code, setCode] = useState(node.script);
  const save = (v: string) => { if (v !== node.script) onScript(v); };
  return (
    <div className="space-y-2 border-t pt-4">
      <Label>Logic (JavaScript)</Label>
      <p className="text-xs text-muted-foreground">Runs on the live site. Use <code className="font-mono">el</code> for this block{node.type === "input" ? <> and <code className="font-mono">input</code> for the field</> : null}. It also appears in the script.js tab.</p>
      <div className="flex flex-wrap gap-1">
        {SNIPPETS.filter((x) => node.type === "input" || !x.code.includes("input.")).map((x) => (
          <button key={x.name} disabled={disabled} onClick={() => { const v = code ? `${code}\n\n${x.code}` : x.code; setCode(v); save(v); }}
            className="rounded-full border px-2 py-0.5 text-[10px] hover:border-primary disabled:opacity-50">+ {x.name}</button>
        ))}
      </div>
      <textarea value={code} disabled={disabled} spellCheck={false} rows={7} aria-label="Block logic"
        placeholder={node.type === "input" ? 'input.addEventListener("input", () => {\n  // check input.value\n});' : 'el.addEventListener("click", () => {\n  // do something\n});'}
        onChange={(e) => setCode(e.target.value)} onBlur={() => save(code)}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          e.preventDefault();
          const t = e.currentTarget, a = t.selectionStart, b = t.selectionEnd;
          const v = code.slice(0, a) + "  " + code.slice(b);
          setCode(v); requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
        }}
        className="w-full resize-y rounded-md bg-ink p-2 font-mono text-[11px] leading-relaxed text-paper outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
    </div>
  );
}

function BoxPanel({ type, box, disabled, onBox }: { type: BlockType; box: BoxOpts; disabled: boolean; onBox: (k: keyof BoxOpts, v: unknown) => void }) {
  const seg = <K extends keyof BoxOpts>(k: K, label: string, opts: readonly string[], dflt: string) => (
    <div className="flex items-center justify-between gap-2 text-xs">
      {label}
      <div className="flex flex-wrap rounded-md border p-0.5">
        {opts.map((o) => (
          <button key={o} disabled={disabled} onClick={() => onBox(k, o === dflt ? null : o)}
            className={`rounded px-1.5 py-0.5 capitalize ${(box[k] ?? dflt) === o ? "bg-secondary font-medium" : "text-muted-foreground"}`}>{o}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-2.5 border-t pt-4">
      <Label className="block">Container layout</Label>
      {type !== "absolute" && (
        <label className="block text-xs"><span className="flex justify-between">Gap<span className="text-muted-foreground">{box.gap ?? 16}px</span></span>
          <input type="range" min={0} max={64} step={2} disabled={disabled} defaultValue={box.gap ?? 16} key={String(box.gap)} onPointerUp={(e) => onBox("gap", Number((e.target as HTMLInputElement).value))} className="mt-1 w-full accent-[var(--primary)]" />
        </label>
      )}
      {type === "grid" && (
        <label className="block text-xs"><span className="flex justify-between">Columns<span className="text-muted-foreground">{box.cols ?? 3}</span></span>
          <input type="range" min={1} max={6} step={1} disabled={disabled} defaultValue={box.cols ?? 3} key={String(box.cols)} onPointerUp={(e) => onBox("cols", Number((e.target as HTMLInputElement).value))} className="mt-1 w-full accent-[var(--primary)]" />
        </label>
      )}
      {type === "flex" && seg("dir", "Direction", ["row", "column"], "row")}
      {(type === "flex" || type === "stack") && seg("justify", "Justify", ["start", "center", "end", "between"], "start")}
      {type !== "absolute" && seg("align", "Align", ["start", "center", "end", "stretch"], "stretch")}
      {type === "flex" && (
        <label className="flex items-center justify-between text-xs">Wrap items<Switch checked={!!box.wrap} disabled={disabled} onCheckedChange={(c) => onBox("wrap", c || null)} /></label>
      )}
      {type === "absolute" && <p className="text-xs text-muted-foreground">Layers overlap freely, each offset from the last — good for collages and stacked cards.</p>}
    </div>
  );
}
