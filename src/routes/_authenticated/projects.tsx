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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase.rpc("create_project", { _name: name });
    if (error || !data) return toast.error("Couldn't create project");
    setName("");
    qc.invalidateQueries({ queryKey: ["projects"] });
    navigate({ to: "/p/$projectId", params: { projectId: data } });
  }

  return (
    <div className="min-h-screen paper-grain">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-2xl">WebCraft</Link>
        <Button variant="ghost" onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/" }))}>Sign out</Button>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <h1 className="mt-10 text-5xl">Your projects</h1>
        <form onSubmit={create} className="mt-8 flex max-w-lg gap-2">
          <Input placeholder="New site name, e.g. Studio North" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit">Create</Button>
        </form>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading && <p className="text-muted-foreground">Loading…</p>}
          {projects?.length === 0 && <p className="text-muted-foreground">No projects yet — create your first one above.</p>}
          {projects?.map((p) => (
            <Link
              key={p.id}
              to="/p/$projectId"
              params={{ projectId: p.id }}
              className="group rounded-xl border bg-card p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="mb-10 h-24 rounded-md bg-dotgrid" />
              <h2 className="text-xl group-hover:text-primary">{p.name}</h2>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{p.role}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
