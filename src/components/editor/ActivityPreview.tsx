import { BLOCKS, BLOCK_CSS, blockHtml, styleObj, themeVars, type BlockType, type Theme } from "@/lib/blocks";
import { toView } from "@/lib/model";
import type { Props } from "@/lib/crdt";
import type { Activity } from "@/lib/useRoom";

const NICE: Record<string, string> = {
  text: "Text", sub: "Secondary text", label: "Button label", order: "Layer order", deleted: "Deleted", color: "Color", shape: "Shape",
  "s.bg": "Background", "s.color": "Text color", "s.btn": "Button color", "s.radius": "Corner radius", "s.pad": "Padding",
  "s.align": "Alignment", "s.opacity": "Opacity", "s.scale": "Text scale", "s.border": "Border", "s.shadow": "Shadow", "s.font": "Font",
};
const HIDDEN = new Set(["type", "kind", "page", "parent", "order", "points"]);
function nice(k: string) {
  const m = k.match(/^([xywh])@(\w+)$/);
  if (m) return `${{ x: "Left", y: "Top", w: "Width", h: "Height" }[m[1] as "x"]} (${m[2]})`;
  if (k.startsWith("vote:")) return "Vote";
  return NICE[k] ?? k;
}
function Val({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) return <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm border" style={{ background: v }} />{v}</span>;
  if (typeof v === "boolean") return <>{v ? "yes" : "no"}</>;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return <>{s.length > 60 ? s.slice(0, 60) + "…" : s}</>;
}

/** Small visual preview + before/after list of what one activity entry changed. */
export function ActivityPreview({ a, props, theme }: { a: Activity; props?: Props | undefined; theme: Theme }) {
  const after = a.after ?? {};
  const before = a.before ?? {};
  const keys = Object.keys(after).filter((k) => !HIDDEN.has(k));
  const type = (a.detail?.type ?? "") as BlockType;
  const view = props && a.node_id ? toView(a.node_id, props) : null;
  const def = BLOCKS[type];
  const geoKeys = keys.filter((k) => /^[xywh]@/.test(k));
  const bp = geoKeys[0]?.split("@")[1];

  return (
    <div className="space-y-3 text-sm">
      {view && def && (
        <div className="overflow-hidden rounded-md border bg-muted/40 p-2">
          <style>{BLOCK_CSS}</style>
          <div className="wc-page pointer-events-none relative overflow-hidden rounded" style={{ height: Math.min(140, view.geo.desktop.h * (280 / Math.max(view.geo.desktop.w, 280))) + 8, ...cssVars(theme) }}>
            <div style={{ width: view.geo.desktop.w, height: view.geo.desktop.h, transform: `scale(${Math.min(1, 280 / view.geo.desktop.w)})`, transformOrigin: "top left", ...(styleObj(view.style) as React.CSSProperties) }}
              dangerouslySetInnerHTML={{ __html: blockHtml(view.type, view, "pv" + view.id.slice(0, 4)) }} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Current state of this block</p>
        </div>
      )}
      {bp && (
        <GeoMap before={before} after={after} bp={bp} />
      )}
      {keys.length > 0 ? (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="pb-1 font-normal">Property</th><th className="pb-1 font-normal">Before</th><th className="pb-1 font-normal">After</th></tr></thead>
          <tbody>
            {keys.slice(0, 12).map((k) => (
              <tr key={k} className="border-t align-top">
                <td className="py-1 pr-2 font-medium">{nice(k)}</td>
                <td className="py-1 pr-2 text-muted-foreground line-through decoration-destructive/60"><Val v={before[k]} /></td>
                <td className="py-1 text-success"><Val v={after[k]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-muted-foreground">{a.outcome.startsWith("blocked") ? "This change was blocked, nothing was saved." : "No property details recorded for this entry."}</p>
      )}
    </div>
  );
}

function GeoMap({ before, after, bp }: { before: Record<string, unknown>; after: Record<string, unknown>; bp: string }) {
  const n = (o: Record<string, unknown>, k: string) => (typeof o[`${k}@${bp}`] === "number" ? (o[`${k}@${bp}`] as number) : null);
  const b = { x: n(before, "x"), y: n(before, "y"), w: n(before, "w"), h: n(before, "h") };
  const a = { x: n(after, "x") ?? b.x, y: n(after, "y") ?? b.y, w: n(after, "w") ?? b.w, h: n(after, "h") ?? b.h };
  if (a.x === null || a.y === null || a.w === null || a.h === null) return null;
  const pageW = bp === "mobile" ? 390 : bp === "tablet" ? 768 : 1200;
  const top = Math.min(a.y, b.y ?? a.y) - 40;
  const k = 280 / pageW;
  return (
    <div className="relative h-28 overflow-hidden rounded-md border bg-dotgrid">
      {b.x !== null && b.y !== null && b.w !== null && b.h !== null && (
        <div className="absolute rounded-sm border border-dashed border-muted-foreground" style={{ left: b.x * k, top: (b.y - top) * k, width: b.w * k, height: b.h * k }} />
      )}
      <div className="absolute rounded-sm border-2 border-primary bg-primary/15" style={{ left: a.x * k, top: (a.y - top) * k, width: a.w * k, height: a.h * k }} />
      <span className="absolute bottom-1 right-2 text-[10px] text-muted-foreground">dashed = before · solid = after</span>
    </div>
  );
}

function cssVars(t: Theme): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const part of themeVars(t).split(";")) { const [k, v] = part.split(":"); if (k && v) o[k] = v; }
  return o as React.CSSProperties;
}
