import { createFileRoute, Link } from "@tanstack/react-router";
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

const features = [
  { n: "01", t: "Everyone on one page", d: "Changes merge automatically. No “someone else is editing” screens — ever." },
  { n: "02", t: "Lock one element, not the page", d: "Click a block and it’s yours for a moment. Everything else stays open to the team." },
  { n: "03", t: "Nothing silently lost", d: "Blocked edits show up in the activity feed, so everyone knows exactly why." },
  { n: "04", t: "Real code out", d: "Clean, semantic HTML, CSS and JS — responsive for desktop, tablet and phone." },
];

function Landing() {
  return (
    <div className="min-h-screen paper-grain">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl">WebCraft</span>
        <div className="flex gap-2">
          <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
          <Button asChild><Link to="/auth">Start building</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid gap-12 py-20 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div className="animate-rise">
            <p className="mb-6 text-sm uppercase tracking-[0.2em] text-primary">Collaborative web builder</p>
            <h1 className="text-6xl leading-[0.95] md:text-8xl">
              Build the page <em className="text-primary">together.</em>
            </h1>
          </div>
          <div className="animate-rise space-y-6 [animation-delay:150ms]">
            <p className="text-lg text-muted-foreground">
              Designers and developers editing the same website at the same time. Only the block you're touching is
              reserved — and only while you're touching it.
            </p>
            <Button size="lg" asChild><Link to="/auth">Open the studio</Link></Button>
          </div>
        </section>

        <section className="relative mb-24 overflow-hidden rounded-2xl border bg-card shadow-lift animate-rise [animation-delay:300ms]">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-full bg-primary/60" />
            <span className="size-2.5 rounded-full bg-warning/60" />
            <span className="size-2.5 rounded-full bg-success/60" />
            <span className="ml-3">studio-north / home</span>
            <div className="ml-auto flex -space-x-2">
              {["MA", "JO", "KE"].map((i, k) => (
                <span key={i} className={`grid size-6 place-items-center rounded-full border-2 border-card text-[10px] font-semibold text-primary-foreground ${k === 0 ? "bg-primary" : k === 1 ? "bg-accent" : "bg-ink"}`}>{i}</span>
              ))}
            </div>
          </div>
          <div className="relative h-80 bg-dotgrid p-8">
            <div className="absolute left-10 top-8 h-12 w-[85%] rounded border bg-card" />
            <div className="absolute left-10 top-28 w-[55%] rounded-md border-2 border-primary bg-card p-6">
              <span className="absolute -top-3 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">Mara is editing</span>
              <div className="font-display text-3xl">Craft that feels unhurried</div>
              <div className="mt-3 h-2 w-2/3 rounded bg-muted" />
            </div>
            <div className="absolute right-10 top-32 h-36 w-[28%] rounded-md border-2 border-accent bg-card">
              <span className="absolute -top-3 right-3 rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">Jonas</span>
            </div>
            <svg className="absolute left-[48%] top-[60%] size-5 text-accent" viewBox="0 0 24 24" fill="currentColor"><path d="M3 2l18 8-8 3-3 8z" /></svg>
          </div>
        </section>

        <section className="grid gap-px overflow-hidden rounded-2xl border bg-border md:grid-cols-2 mb-24">
          {features.map((f) => (
            <div key={f.n} className="bg-background p-10">
              <span className="font-mono text-xs text-primary">{f.n}</span>
              <h3 className="mt-4 text-2xl">{f.t}</h3>
              <p className="mt-2 text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="mx-auto max-w-6xl border-t px-6 py-8 text-sm text-muted-foreground">© 2026 WebCraft</footer>
    </div>
  );
}
