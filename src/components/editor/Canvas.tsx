import { useRef, useState } from "react";
import { BLOCK_CSS, BREAKPOINTS, blockHtml, themeVars, type BlockType, type Breakpoint, type Theme } from "@/lib/blocks";
import { pageHeight, type Geo, type NodeView } from "@/lib/model";
import type { Cursor, Lease } from "@/lib/useRoom";

type Props = {
  nodes: NodeView[];
  bp: Breakpoint;
  theme: Theme;
  scale: number;
  selected: string | null;
  mySession: string;
  leases: Record<string, Lease>;
  cursors: Record<string, Cursor>;
  drags: Record<string, { bp: string } & Geo>;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  onCommit: (id: string, g: Geo, kind: "moved" | "resized") => void;
  onLiveDrag: (id: string, g: Geo, done?: boolean) => void;
  onCursor: (x: number, y: number) => void;
  onDropBlock: (type: BlockType, x: number, y: number) => void;
};

const SNAP = 6;

export function Canvas(p: Props) {
  const pageW = BREAKPOINTS[p.bp].width;
  const pageH = pageHeight(p.nodes, p.bp);
  const pageRef = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState<{ id: string; g: Geo } | null>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  const toPage = (e: { clientX: number; clientY: number }) => {
    const r = pageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / p.scale, y: (e.clientY - r.top) / p.scale };
  };

  function snap(id: string, g: Geo, resizing: boolean): { g: Geo; gx: number[]; gy: number[] } {
    const xs: number[] = [0, pageW, pageW / 2];
    const ys: number[] = [0];
    for (const n of p.nodes) {
      if (n.id === id) continue;
      const o = n.geo[p.bp];
      xs.push(o.x, o.x + o.w, o.x + o.w / 2);
      ys.push(o.y, o.y + o.h, o.y + o.h / 2);
    }
    const out = { ...g };
    const gx: number[] = [];
    const gy: number[] = [];
    const tryAxis = (edges: number[], targets: number[], apply: (d: number) => void, hits: number[]) => {
      let best: { d: number; t: number } | null = null;
      for (const e of edges) for (const t of targets) {
        const d = t - e;
        if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
      }
      if (best) { apply(best.d); hits.push(best.t); }
    };
    if (resizing) {
      tryAxis([g.x + g.w], xs, (d) => (out.w += d), gx);
      tryAxis([g.y + g.h], ys, (d) => (out.h += d), gy);
    } else {
      tryAxis([g.x, g.x + g.w, g.x + g.w / 2], xs, (d) => (out.x += d), gx);
      tryAxis([g.y, g.y + g.h, g.y + g.h / 2], ys, (d) => (out.y += d), gy);
    }
    out.x = Math.round(out.x); out.y = Math.max(0, Math.round(out.y));
    out.w = Math.max(24, Math.round(out.w)); out.h = Math.max(16, Math.round(out.h));
    return { g: out, gx, gy };
  }

  function startDrag(e: React.PointerEvent, n: NodeView, resizing: boolean) {
    if (p.readOnly || e.button !== 0) return;
    e.stopPropagation();
    p.onSelect(n.id);
    const start = toPage(e);
    const orig = n.geo[p.bp];
    let last = orig;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const cur = toPage(ev);
      const dx = cur.x - start.x, dy = cur.y - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      moved = true;
      const raw = resizing ? { ...orig, w: orig.w + dx, h: orig.h + dy } : { ...orig, x: orig.x + dx, y: orig.y + dy };
      const s = snap(n.id, raw, resizing);
      last = s.g;
      setLocal({ id: n.id, g: s.g });
      setGuides({ x: s.gx, y: s.gy });
      p.onLiveDrag(n.id, s.g);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGuides({ x: [], y: [] });
      if (moved) {
        p.onLiveDrag(n.id, last, true);
        p.onCommit(n.id, last, resizing ? "resized" : "moved");
      }
      setLocal(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const sorted = [...p.nodes].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

  return (
    <div
      className="relative mx-auto origin-top-left"
      style={{ width: pageW * p.scale, height: pageH * p.scale }}
    >
      <style>{BLOCK_CSS}</style>
      <div
        ref={pageRef}
        className="wc-page absolute left-0 top-0 origin-top-left shadow-lift"
        style={{ width: pageW, height: pageH, transform: `scale(${p.scale})`, ...cssVars(p.theme) }}
        onPointerDown={() => p.onSelect(null)}
        onPointerMove={(e) => { const c = toPage(e); p.onCursor(c.x, c.y); }}
        onDragOver={(e) => { if (!p.readOnly) e.preventDefault(); }}
        onDrop={(e) => {
          const t = e.dataTransfer.getData("application/x-webcraft-block") as BlockType;
          if (!t) return;
          const c = toPage(e);
          p.onDropBlock(t, c.x, c.y);
        }}
      >
        {sorted.map((n, i) => {
          const remote = p.drags[n.id];
          const g = local?.id === n.id ? local.g : remote && remote.bp === p.bp ? remote : n.geo[p.bp];
          const lease = p.leases[n.id];
          const lockedByOther = lease && lease.holder_session !== p.mySession;
          const isSel = p.selected === n.id;
          return (
            <div
              key={n.id}
              className="wc-el group"
              style={{
                left: g.x, top: g.y, width: g.w, height: g.h, zIndex: i + 1,
                overflow: "visible",
                cursor: p.readOnly ? "default" : lockedByOther ? "not-allowed" : "move",
                outline: isSel ? "2px solid var(--primary)" : lockedByOther ? `2px dashed ${lease.holder_color}` : undefined,
                outlineOffset: 2,
                transition: remote ? "left 60ms linear, top 60ms linear" : undefined,
              }}
              onPointerDown={(e) => startDrag(e, n, false)}
            >
              <div
                className="pointer-events-none h-full w-full overflow-hidden group-hover:outline group-hover:outline-1 group-hover:outline-[var(--ring)]"
                dangerouslySetInnerHTML={{ __html: blockHtml(n.type, n, n.id) }}
              />
              {lockedByOther && (
                <span
                  className="absolute -top-3 right-1 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[10px] font-medium text-primary-foreground"
                  style={{ background: lease.holder_color }}
                >
                  🔒 {lease.holder_name}
                </span>
              )}
              {isSel && !p.readOnly && (
                <div
                  className="absolute -bottom-1.5 -right-1.5 z-10 size-3 cursor-se-resize rounded-sm border-2 border-primary bg-card"
                  onPointerDown={(e) => startDrag(e, n, true)}
                />
              )}
            </div>
          );
        })}
        {guides.x.map((x, i) => (
          <div key={`gx${i}`} className="pointer-events-none absolute top-0 z-[9998] w-px bg-guide" style={{ left: x, height: pageH }} />
        ))}
        {guides.y.map((y, i) => (
          <div key={`gy${i}`} className="pointer-events-none absolute left-0 z-[9998] h-px bg-guide" style={{ top: y, width: pageW }} />
        ))}
        {Object.entries(p.cursors).map(([s, c]) =>
          s === p.mySession ? null : (
            <div key={s} className="pointer-events-none absolute z-[9999] transition-all duration-75" style={{ left: c.x, top: c.y }}>
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ color: c.color }} fill="currentColor"><path d="M3 2l18 8-8 3-3 8z" /></svg>
              <span className="ml-3 rounded px-1.5 py-0.5 font-sans text-[11px] text-primary-foreground" style={{ background: c.color }}>{c.name}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function cssVars(t: Theme): React.CSSProperties {
  const o: Record<string, string> = {};
  for (const part of themeVars(t).split(";")) {
    const [k, v] = part.split(":");
    if (k && v) o[k] = v;
  }
  return o as React.CSSProperties;
}
