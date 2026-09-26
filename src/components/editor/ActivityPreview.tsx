import { BREAKPOINTS, type Breakpoint } from "@/lib/blocks";
import type { Activity } from "@/lib/useRoom";

type G = { x?: number | undefined; y?: number | undefined; w?: number | undefined; h?: number | undefined };

/** Small before/after visual of one change from the activity feed. */
export function ActivityPreview({ a }: { a: Activity }) {
  const before = a.before ?? {};
  const after = a.after ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const isBoard = a.detail?.type === "wb";

  // geometry per breakpoint (canvas) or plain x/y/w/h (whiteboard)
  const geos: { bp: string; b: G; a: G; width: number }[] = [];
  if (isBoard) {
    const pick = (o: Record<string, unknown>) => ({ x: num(o['x']), y: num(o['y']), w: num(o['w']), h: num(o['h']) });
    if (["x", "y", "w", "h"].some((k) => k in after)) geos.push({ bp: "board", b: pick(before), a: pick(after), width: 1200 });
  } else {
    for (const bp of Object.keys(BREAKPOINTS) as Breakpoint[]) {
      const pick = (o: Record<string, unknown>) => ({ x: num(o[`x@${bp}`]), y: num(o[`y@${bp}`]), w: num(o[`w@${bp}`]), h: num(o[`h@${bp}`]) });
      if (["x", "y", "w", "h"].some((k) => `${k}@${bp}` in after)) geos.push({ bp, b: pick(before), a: pick(after), width: BREAKPOINTS[bp].width });
    }
  }
  const textKeys = keys.filter((k) => ["text", "sub", "label", "color", "checked", "pinned", "deleted"].includes(k));

  if (!keys.length) return <p className="text-xs text-muted-foreground">No detailed snapshot for this change.</p>;

  return (
    <div className="space-y-2 rounded-md border bg-background p-2 text-xs">
      {geos.map(({ bp, b, a: af, width }) => {
        const bb = fill(b, af), aa = fill(af, b);
        const hasBefore = b.x !== undefined || b.w !== undefined;
        const H = Math.max(bb.y + bb.h, aa.y + aa.h, 200) + 40;
        const minX = Math.min(0, bb.x, aa.x);
        const W = Math.max(width, bb.x + bb.w, aa.x + aa.w) - minX;
        return (
          <div key={bp}>
            <p className="mb-1 capitalize text-muted-foreground">{bp === "board" ? "Whiteboard" : BREAKPOINTS[bp as Breakpoint].label} layout</p>
            <svg viewBox={`${minX - 20} -20 ${W + 40} ${H}`} className="h-28 w-full rounded bg-muted">
              <rect x={0} y={0} width={width} height={H - 40} fill="var(--card)" stroke="var(--border)" strokeWidth={4} />
              {hasBefore && a.action !== "created" && <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} fill="none" stroke="var(--muted-foreground)" strokeDasharray="16 10" strokeWidth={6} />}
              <rect x={aa.x} y={aa.y} width={aa.w} height={aa.h} fill="var(--primary)" fillOpacity={0.2} stroke="var(--primary)" strokeWidth={6} />
            </svg>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {hasBefore && a.action !== "created" ? `${bb.x},${bb.y} ${bb.w}×${bb.h} → ` : ""}{aa.x},{aa.y} {aa.w}×{aa.h}
            </p>
          </div>
        );
      })}
      {textKeys.map((k) => (
        <div key={k}>
          <p className="mb-0.5 capitalize text-muted-foreground">{k}</p>
          {before[k] !== undefined && before[k] !== null && a.action !== "created" && (
            <p className="rounded bg-destructive/10 px-1.5 py-0.5 line-through">{show(before[k])}</p>
          )}
          <p className="mt-0.5 rounded bg-success/15 px-1.5 py-0.5">{show(after[k])}</p>
        </div>
      ))}
      {a.action === "reordered" && <p className="text-muted-foreground">Moved in front of other blocks.</p>}
      {a.outcome.startsWith("blocked") && <p className="text-destructive">This change was blocked and not applied.</p>}
    </div>
  );
}

const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const fill = (g: G, o: G) => ({ x: g.x ?? o.x ?? 0, y: g.y ?? o.y ?? 0, w: g.w ?? o.w ?? 100, h: g.h ?? o.h ?? 60 });
const show = (v: unknown) => (v === undefined || v === null ? "—" : typeof v === "string" ? v || "(empty)" : JSON.stringify(v));
