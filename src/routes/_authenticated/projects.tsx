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
        .filter((r) => r.projects)
        .map((r) => ({ role: r.role, ...r.projects! }))
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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.rpc("create_project", { _name: name });
    if (error || !data) {
      toast.error("Couldn't create project");
      return;
    }
    setName("");
    if (tpl) sessionStorage.setItem(`webcraft:tpl:${data}`, tpl);
    qc.invalidateQueries({ queryKey: ["projects"] });
    navigate({ to: "/p/$projectId", params: { projectId: data } });
  }

  return (
    <div className="min-h-screen paper-grain">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <Link to="/" className="font-display text-2xl">WebCraft</Link>
        <Button variant="ghost" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))}>Sign out</Button>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <h1 className="mt-6 text-4xl sm:mt-10 sm:text-5xl">Your projects</h1>
        <form onSubmit={create} className="mt-8 flex max-w-lg gap-2">
          <Input placeholder="New site name, e.g. Studio North" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit">Create</Button>
        </form>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Start from</p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[{ id: "", name: "Blank page", description: "An empty canvas." }, ...SITE_TEMPLATES].map((t) => (
            <button key={t.id || "blank"} type="button" onClick={() => setTpl(t.id)}
              className={`overflow-hidden rounded-lg border text-left text-sm transition ${tpl === t.id ? "border-primary ring-2 ring-primary" : "bg-card hover:border-foreground/30"}`}>
              <SitePreview nodes={"blocks" in t ? templateViews(t) : []} theme={"theme" in t ? t.theme : DEFAULT_THEME} height={130} className="border-b" />
              <span className="block p-2.5"><span className="block font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.description}</span></span>
            </button>
          ))}
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {projects?.length === 0 && <p className="text-muted-foreground">No projects yet — create your first one above.</p>}
          {projects?.map((p) => (
            <Link
              key={p.id}
              to="/p/$projectId"
              params={{ projectId: p.id }}
              className="group overflow-hidden rounded-xl border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              {thumbs ? <SitePreview nodes={thumbs[p.id]?.nodes ?? []} theme={thumbs[p.id]?.theme ?? DEFAULT_THEME} height={180} className="border-b" /> : <div className="h-[180px] animate-pulse border-b bg-muted" />}
              <div className="p-4">
                <h2 className="truncate text-xl group-hover:text-primary">{p.name}</h2>
                <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{p.role}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
