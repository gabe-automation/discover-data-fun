import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { WorkspaceShell, TemplateGallery } from "@/components/WorkspaceGallery";
import type { SiteTemplate } from "@/lib/siteTemplates";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WebCraft — Build websites together, live" },
      { name: "description", content: "A visual website builder where designers and developers edit the same page at once — no locks on the whole page, no waiting." },
      { property: "og:title", content: "WebCraft — Build websites together, live" },
      { property: "og:description", content: "Edit the same page at the same time. Only the element you touch is reserved." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [section, setSection] = useState("Templates");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const pick = (t: SiteTemplate) => {
    sessionStorage.setItem("webcraft:pending-template", t.id);
    navigate({ to: "/auth" });
  };
  return <WorkspaceShell section={section} onSection={setSection} search={search} onSearch={setSearch}>
    <div className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
      <div className="min-w-0"><p className="mb-2 text-xs font-semibold uppercase text-primary">WebCraft / Studio</p><h1 className="text-3xl font-semibold">{section === "Projects" ? "Your next project" : "Website templates"}</h1></div>
      <Button asChild><Link to="/auth"><Plus className="size-4"/><span className="hidden sm:inline">New project</span></Link></Button>
    </div>
    {section === "Projects" && <div className="mb-8 flex items-center justify-between gap-4 border-b pb-6"><p className="text-sm text-muted-foreground">Sign in to open your projects.</p><Button asChild variant="outline"><Link to="/auth">Sign in</Link></Button></div>}
    <TemplateGallery search={search} onPick={pick}/>
  </WorkspaceShell>;
}
