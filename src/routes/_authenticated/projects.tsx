import { SITE_TEMPLATES, templateViews } from "@/lib/siteTemplates";
import { SitePreview } from "@/components/SitePreview";
import { toView, type NodeView } from "@/lib/model";
import { DEFAULT_THEME, type Theme } from "@/lib/blocks";
import { val, type Props } from "@/lib/crdt";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceShell, TemplateGallery } from "@/components/WorkspaceGallery";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowUpRight, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Your projects — WebCraft" },
      { name: "description", content: "All the websites you and your team are building in WebCraft." },
      { property: "og:title", content: "Your projects — WebCraft" },
      { property: "og:description", content: "All the websites you and your team are building in WebCraft." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Projects,
});

function Projects() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("project_members")
        .select("role, projects(id, name, created_at)")
        .eq("user_id", u.user?.id ?? "");
      if (error) throw error;
      return (data ?? [])
        .flatMap((r) => r.projects ? [{ role: r.role, ...r.projects }] : [])
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });

  const ids = (projects ?? []).map((p) => p.id);
  const { data: thumbs } = useQuery({
    queryKey: ["project-thumbs", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [n, pg, pr] = await Promise.all([
        supabase.from("nodes").select("id, project_id, props").in("project_id", ids),
        supabase.from("pages").select("id, project_id, kind, sort, created_at").in("project_id", ids).eq("kind", "canvas").order("sort").order("created_at"),
        supabase.from("projects").select("id, theme").in("id", ids),
      ]);
      const first: Record<string, string> = {};
      for (const p of pg.data ?? []) if (!first[p.project_id]) first[p.project_id] = p.id;
      const out: Record<string, { nodes: NodeView[]; theme: Theme }> = {};
      for (const p of pr.data ?? []) out[p.id] = { nodes: [], theme: { ...DEFAULT_THEME, ...(p.theme as Partial<Theme>) } };
      for (const row of n.data ?? []) {
        const props = row.props as unknown as Props;
        if (val<string>(props, "kind", "") === "wb") continue;
        const v = toView(row.id, props);
        if (!v || (v.page ?? first[row.project_id]) !== first[row.project_id]) continue;
        out[row.project_id]?.nodes.push(v);
      }
      return out;
    },
  });
  const [tpl, setTpl] = useState("");
  const [section, setSection] = useState("Projects");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const filtered = (projects ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const featured = filtered[0];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("create_project", { _name: name });
    if (error || !data) {
      setBusy(false);
      toast.error("Couldn't create project");
      return;
    }
    setName("");
    if (tpl) sessionStorage.setItem(`webcraft:tpl:${data}`, tpl);
    qc.invalidateQueries({ queryKey: ["projects"] });
    navigate({ to: "/p/$projectId", params: { projectId: data } });
  }

  return <WorkspaceShell signedIn section={section} onSection={setSection} search={search} onSearch={setSearch}
    onSignOut={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))}>
    <div className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
      <h1 className="text-3xl font-semibold">{section}</h1>
      <Button onClick={() => { setTpl(sessionStorage.getItem("webcraft:pending-template") ?? ""); sessionStorage.removeItem("webcraft:pending-template"); setCreating(true); }}><Plus className="size-4"/><span className="hidden sm:inline">New project</span></Button>
    </div>
    {section === "Templates" ? <TemplateGallery search={search} onPick={(t) => { setTpl(t.id); setCreating(true); }}/>
      : <>
        {isLoading && <div className="h-80 animate-pulse bg-muted"/>}
        {featured && <Link to="/p/$projectId" params={{ projectId: featured.id }} className="group mb-10 grid overflow-hidden border bg-card transition hover:border-primary md:grid-cols-[3fr_2fr]">
          <SitePreview nodes={thumbs?.[featured.id]?.nodes ?? []} theme={thumbs?.[featured.id]?.theme ?? DEFAULT_THEME} height={340}/>
          <div className="flex min-w-0 flex-col justify-center gap-6 p-7 sm:p-9"><p className="text-xs font-semibold uppercase text-primary">Latest project</p><h2 className="break-words text-2xl font-semibold">{featured.name}</h2><div className="flex gap-8 text-xs text-muted-foreground"><div>Created<p className="mt-1 font-semibold text-foreground">{new Date(featured.created_at).toLocaleDateString()}</p></div><div>Your role<p className="mt-1 font-semibold capitalize text-foreground">{featured.role}</p></div></div><span className="flex items-center gap-2 text-sm font-semibold text-primary">Open project <ArrowUpRight className="size-4"/></span></div>
        </Link>}
        <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.slice(1).map((p) => <Link key={p.id} to="/p/$projectId" params={{ projectId: p.id }} className="group min-w-0"><div className="overflow-hidden rounded-lg border transition group-hover:border-primary"><SitePreview nodes={thumbs?.[p.id]?.nodes ?? []} theme={thumbs?.[p.id]?.theme ?? DEFAULT_THEME} height={230}/></div><h2 className="mt-4 truncate text-sm font-semibold">{p.name}</h2><p className="mt-1 text-xs capitalize text-muted-foreground">{p.role}</p></Link>)}
          <Button variant="ghost" onClick={() => { setTpl(""); setCreating(true); }} className="h-[230px] flex-col gap-3 border border-dashed text-muted-foreground"><Plus className="size-7 text-primary"/>New blank project</Button>
        </div>
        {!isLoading && filtered.length === 0 && <div className="mt-8"><h2 className="mb-6 text-xl font-semibold">Start from a template</h2><TemplateGallery search={search} onPick={(t) => { setTpl(t.id); setCreating(true); }}/></div>}
      </>}
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>New project</DialogTitle><DialogDescription>{SITE_TEMPLATES.find((t) => t.id === tpl)?.name ?? "Blank canvas"}</DialogDescription></DialogHeader>
      <form onSubmit={create} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Input aria-label="Project name" required autoFocus placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)}/><Button type="submit" disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create"}</Button></form>
      <div className="grid grid-cols-2 gap-3">{[{ id: "", name: "Blank page" }, ...SITE_TEMPLATES].map((t) => <Button key={t.id} variant="ghost" aria-pressed={tpl === t.id} className={`h-auto flex-col overflow-hidden border p-0 ${tpl === t.id ? "border-primary ring-1 ring-primary" : ""}`} onClick={() => setTpl(t.id)}><SitePreview nodes={"blocks" in t ? templateViews(t) : []} theme={"theme" in t ? t.theme : DEFAULT_THEME} height={160} className="w-full"/><span className="self-start p-3 text-sm">{t.name}</span></Button>)}</div>
    </DialogContent></Dialog>
  </WorkspaceShell>;
}
