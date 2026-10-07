import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, FolderOpen, LayoutTemplate, LogOut, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SITE_TEMPLATES, templateViews, type SiteTemplate } from "@/lib/siteTemplates";
import { SitePreview } from "@/components/SitePreview";

export function WorkspaceShell({ children, section, onSection, signedIn = false, onSignOut, search, onSearch }: {
  children: ReactNode; section: string; onSection: (value: string) => void; signedIn?: boolean;
  onSignOut?: () => void; search: string; onSearch: (value: string) => void;
}) {
  return <div className="min-h-screen bg-background md:grid md:grid-cols-[224px_minmax(0,1fr)]">
    <aside className="border-b bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-b-0 md:border-r">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-5 md:block md:p-7">
        <Link to="/" className="font-display text-xl font-bold">WebCraft<span className="text-primary">.</span></Link>
        <nav aria-label="Workspace" className="flex gap-1 md:mt-10 md:flex-col">
          {[{ name: "Projects", icon: FolderOpen }, { name: "Templates", icon: LayoutTemplate }].map(({ name, icon: Icon }) =>
            <Button key={name} variant="ghost" aria-pressed={section === name} onClick={() => onSection(name)}
              className={`justify-start px-3 md:w-full ${section === name ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
              <Icon className="size-4"/><span className="hidden sm:inline">{name}</span>
            </Button>)}
        </nav>
      </div>
      <div className="hidden space-y-4 border-t p-6 md:mt-auto md:block">
        <span className="text-xs font-semibold text-muted-foreground">WEBCRAFT STUDIO</span>
        {signedIn ? <Button variant="ghost" className="w-full justify-start" onClick={onSignOut}><LogOut className="size-4"/>Sign out</Button>
          : <Button asChild className="w-full"><Link to="/auth">Sign in <ArrowUpRight className="size-4"/></Link></Button>}
      </div>
    </aside>
    <main className="min-w-0">
      <header className="grid h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b bg-card px-5 sm:px-8">
        <div className="relative max-w-sm min-w-0"><Search className="absolute left-3 top-3 size-4 text-muted-foreground"/>
          <Input aria-label="Search workspace" placeholder="Search workspace…" value={search} onChange={(e) => onSearch(e.target.value)} className="h-10 bg-background pl-10"/>
        </div>
        <Button asChild variant="outline"><Link to={signedIn ? "/projects" : "/auth"}>{signedIn ? "Your workspace" : "Sign in"}<ArrowUpRight className="size-4"/></Link></Button>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">{children}</div>
    </main>
  </div>;
}

export function TemplateGallery({ search = "", onPick, featured = true }: { search?: string; onPick: (t: SiteTemplate) => void; featured?: boolean }) {
  const templates = SITE_TEMPLATES.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase()));
  const first = templates[0];
  const [preview, setPreview] = useState<string | null>(null);
  return <>
    {featured && first && <div className="mb-10 grid overflow-hidden border bg-card md:grid-cols-[3fr_2fr]">
      <div className="relative min-w-0 bg-muted">
        <SitePreview nodes={templateViews(first)} theme={first.theme} height={340}/>
        <span className="absolute left-4 top-4 rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">Featured template</span>
      </div>
      <div className="flex flex-col justify-center gap-5 p-6 sm:p-9">
        <div><p className="mb-3 text-xs font-semibold uppercase text-primary">Collection / 2026</p><h2 className="text-2xl font-semibold">{first.name}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{first.description}</p></div>
        <Button className="self-start" onClick={() => onPick(first)}>Use template <ArrowUpRight className="size-4"/></Button>
      </div>
    </div>}
    <div className="grid gap-7 sm:grid-cols-2 xl:grid-cols-3">
      {templates.slice(featured ? 1 : 0).map((t) => <div key={t.id} className="min-w-0">
        <Button variant="ghost" onClick={() => setPreview(preview === t.id ? null : t.id)} aria-label={`Preview ${t.name}`} className="block h-auto w-full overflow-hidden rounded-lg border p-0 hover:border-primary">
          <SitePreview nodes={templateViews(t)} theme={t.theme} height={230}/>
        </Button>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3"><div className="min-w-0"><h3 className="text-sm font-semibold">{t.name}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description}</p></div><Button size="icon" variant="outline" title={`Use ${t.name}`} aria-label={`Use ${t.name}`} onClick={() => onPick(t)}><Plus className="size-4"/></Button></div>
        {preview === t.id && <div className="mt-3 overflow-hidden border"><SitePreview nodes={templateViews(t)} theme={t.theme} height={520}/></div>}
      </div>)}
    </div>
    {!templates.length && <p className="py-12 text-muted-foreground">No templates match your search.</p>}
  </>;
}