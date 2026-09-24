import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, Lock, Monitor, Smartphone, Tablet, Trash2, ArrowUpToLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Canvas } from "@/components/editor/Canvas";
import { BLOCKS, BREAKPOINTS, DEFAULT_THEME, type BlockType, type Breakpoint, type Theme } from "@/lib/blocks";
import { generateExport, toView, type Geo, type NodeView } from "@/lib/model";
import { keyBetween } from "@/lib/crdt";
import { useRoom, type Me } from "@/lib/useRoom";

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

  const [bp, setBp] = useState<Breakpoint>("desktop");
  const [selected, setSelected] = useState<string | null>(null);
  const heldRef = useRef<{ id: string; label: string } | null>(null);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  useEffect(() => {
    if (info?.project?.theme) setTheme({ ...DEFAULT_THEME, ...(info.project.theme as Partial<Theme>) });
  }, [info?.project?.theme]);

  const views = useMemo(() => {
    const out: NodeView[] = [];
    for (const [id, p] of Object.entries(room.nodes)) {
      const v = toView(id, p);
      if (v) out.push(v);
    }
    return out;
  }, [room.nodes]);
  const sel = views.find((v) => v.id === selected) ?? null;
  const labelOf = (v: NodeView) => `${BLOCKS[v.type].name}${v.text ? ` “${v.text.slice(0, 24)}”` : ""}`;

  // lease heartbeat + release on leave
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
    if (!id || readOnly) return;
    const v = views.find((x) => x.id === id);
    if (!v) return;
    const label = labelOf(v);
    const ok = await room.acquire(id, label);
    if (ok) heldRef.current = { id, label };
    else toast.info(`${label} is locked by ${room.leases[id]?.holder_name ?? "a teammate"}. You can still edit anything else.`);
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
    await room.op(
      id,
      {
        type, parent: null, order: keyBetween(maxOrder, null), deleted: false,
        "x@desktop": Math.max(0, Math.min(pageW - w, x)), "y@desktop": Math.max(0, y), "w@desktop": w, "h@desktop": def.h,
      },
      "created",
      def.name,
    );
  }

  function commitGeo(id: string, g: Geo, kind: "moved" | "resized") {
    const v = views.find((x) => x.id === id);
    if (!v) return;
    room.op(id, { [`x@${bp}`]: g.x, [`y@${bp}`]: g.y, [`w@${bp}`]: g.w, [`h@${bp}`]: g.h }, kind, labelOf(v));
  }

  function edit(field: "text" | "sub" | "label", value: string) {
    if (!sel || (sel as Record<string, unknown>)[field] === value) return;
    room.op(sel.id, { [field]: value }, "edited", labelOf(sel));
  }

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
  }, []);
  const scale = Math.min(1, (areaW - 64) / BREAKPOINTS[bp].width);

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
          {(["desktop", "tablet", "mobile"] as Breakpoint[]).map((b) => {
            const Icon = b === "desktop" ? Monitor : b === "tablet" ? Tablet : Smartphone;
            return (
              <button
                key={b}
                onClick={() => setBp(b)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs ${bp === b ? "bg-secondary font-medium" : "text-muted-foreground"}`}
              >
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
          <p className="mt-4 px-1 text-[11px] leading-relaxed text-muted-foreground">Click to add, or drag onto the page.</p>
        </aside>

        {/* Canvas */}
        <main
          ref={areaRef}
          className="min-w-0 flex-1 overflow-auto bg-dotgrid p-8"
          onMouseLeave={() => room.setStatus(selected ? "editing" : "idle")}
        >
          {!room.loaded ? (
            <p className="text-center text-muted-foreground">Loading page…</p>
          ) : (
            <>
              {views.length === 0 && (
                <p className="mb-4 text-center text-muted-foreground">Empty page — add a Navbar and a Hero from the left to get going.</p>
              )}
              <Canvas
                nodes={views}
                bp={bp}
                theme={theme}
                scale={scale}
                selected={selected}
                mySession={room.session}
                leases={room.leases}
                cursors={room.cursors}
                drags={room.drags}
                readOnly={readOnly}
                onSelect={select}
                onCommit={commitGeo}
                onLiveDrag={(id, g, done) => room.sendDrag({ id, bp, ...g, done })}
                onCursor={room.sendCursor}
                onDropBlock={(t, x, y) => addBlock(t, { x, y })}
              />
            </>
          )}
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
                  key={sel.id + sel.text + sel.sub + sel.label}
                  node={sel}
                  bp={bp}
                  lockedBy={room.leases[sel.id]?.holder_session !== room.session ? room.leases[sel.id]?.holder_name : undefined}
                  readOnly={readOnly}
                  onEdit={edit}
                  onGeo={(g) => commitGeo(sel.id, g, "resized")}
                  onFront={() => {
                    const max = views.reduce<string | null>((m, v) => (!m || v.order > m ? v.order : m), null);
                    room.op(sel.id, { order: keyBetween(max, null) }, "reordered", labelOf(sel));
                  }}
                  onDelete={async () => {
                    await room.op(sel.id, { deleted: true }, "deleted", labelOf(sel));
                    select(null);
                  }}
                />
              ) : (
                <ThemePanel theme={theme} readOnly={readOnly} onChange={saveTheme} />
              )}
            </TabsContent>

            <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
              <ul className="space-y-1" aria-live="polite">
                {room.activity.map((a) => {
                  const blocked = a.outcome.startsWith("blocked");
                  return (
                    <li key={a.id} className={`rounded-md px-3 py-2 text-sm ${blocked ? "bg-destructive/10" : ""}`}>
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
                    </li>
                  );
                })}
                {room.activity.length === 0 && <p className="p-3 text-sm text-muted-foreground">No activity yet.</p>}
              </ul>
            </TabsContent>

            <TabsContent value="code" className="min-h-0 flex-1 overflow-hidden px-2 pb-2">
              <CodeView exp={exp} name={info?.project?.name ?? "site"} />
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
      </div>
    </div>
  );
}

function initials(n: string) {
  return n.split(/\s+/).map((x) => x[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function Inspector(props: {
  node: NodeView;
  bp: Breakpoint;
  lockedBy?: string;
  readOnly: boolean;
  onEdit: (f: "text" | "sub" | "label", v: string) => void;
  onGeo: (g: Geo) => void;
  onFront: () => void;
  onDelete: () => void;
}) {
  const { node } = props;
  const def = BLOCKS[node.type];
  const g = node.geo[props.bp];
  const disabled = props.readOnly || !!props.lockedBy;
  const fields: { f: "text" | "sub" | "label"; label: string }[] = [];
  if (def.text) fields.push({ f: "text", label: node.type === "image" ? "Alt text / caption" : node.type === "cards" || node.type === "pricing" ? "Titles (separate with |)" : "Text" });
  if (def.sub) fields.push({ f: "sub", label: node.type === "pricing" ? "Prices (separate with |)" : node.type === "cards" ? "Descriptions (separate with |)" : "Secondary text" });
  if (def.label) fields.push({ f: "label", label: "Button label" });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl">{def.name}</h2>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" disabled={disabled} onClick={props.onFront} aria-label="Bring to front"><ArrowUpToLine /></Button>
          <Button size="icon" variant="ghost" disabled={disabled} onClick={props.onDelete} aria-label="Delete"><Trash2 /></Button>
        </div>
      </div>
      {props.lockedBy && (
        <p className="flex items-center gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm">
          <Lock className="size-4" /> {props.lockedBy} is editing this block.
        </p>
      )}
      {fields.map(({ f, label }) => (
        <div key={f} className="space-y-1.5">
          <Label>{label}</Label>
          <Textarea
            defaultValue={node[f]}
            disabled={disabled}
            rows={f === "label" ? 1 : 3}
            onBlur={(e) => props.onEdit(f, e.target.value)}
          />
        </div>
      ))}
      <div>
        <Label className="mb-1.5 block">Position & size · {BREAKPOINTS[props.bp].label}</Label>
        <div className="grid grid-cols-4 gap-2">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <label key={k} className="text-[11px] uppercase text-muted-foreground">
              {k}
              <Input
                type="number"
                defaultValue={g[k]}
                disabled={disabled}
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
  members: { user_id: string; role: string; profile?: { display_name: string; color: string } }[];
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
